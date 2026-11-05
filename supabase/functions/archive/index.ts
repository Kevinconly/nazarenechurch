import { ApiError, assertAllowedOrigin, createClients, corsHeaders, jsonResponse, mapDatabaseError, readJson, requireRoles, validUuid, type SupabaseClients } from "../_shared/http.ts";

const managers = ["SUPER_ADMIN", "MEDIA_ADMIN"] as const;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type Variant = { variant_type: string; storage_path: string; width: number; height: number };

function routeParts(request: Request): string[] {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const functionIndex = parts.indexOf("archive");
  return functionIndex < 0 ? [] : parts.slice(functionIndex + 1);
}

async function signedVariant(clients: SupabaseClients, mediaId: string, variantType: string) {
  const { data: variant, error } = await clients.admin
    .from("media_variants")
    .select("storage_path,width,height")
    .eq("media_id", mediaId)
    .eq("variant_type", variantType)
    .maybeSingle();
  if (error) throw new Error("Unable to retrieve an image variant.");
  if (!variant) return undefined;
  const { data, error: signError } = await clients.admin.storage
    .from("media-processed")
    .createSignedUrl(variant.storage_path, 3600);
  if (signError || !data?.signedUrl) throw new Error("Unable to create a time-limited image URL.");
  return { src: data.signedUrl, width: variant.width, height: variant.height };
}

async function signedImageSet(clients: SupabaseClients, mediaId: string) {
  const [thumbnail, medium, large] = await Promise.all([
    signedVariant(clients, mediaId, "thumbnail"),
    signedVariant(clients, mediaId, "medium"),
    signedVariant(clients, mediaId, "large"),
  ]);
  if (!large) return undefined;
  const sources = [thumbnail, medium, large].filter((source) => source !== undefined);
  return {
    large,
    thumbnail,
    srcSet: sources.map((source) => `${source.src} ${source.width}w`).join(", "),
  };
}

async function publicAlbums(clients: SupabaseClients, request: Request) {
  const params = new URL(request.url).searchParams;
  const page = Number(params.get("page") ?? 1);
  const pageSize = Number(params.get("pageSize") ?? 24);
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000_000
      || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ApiError(400, "Album pagination is invalid.");
  }
  const from = (page - 1) * pageSize;
  const { data, error, count } = await clients.admin
    .from("public_album_catalog")
    .select("*", { count: "exact" })
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(from, from + pageSize - 1);
  if (error) throw new Error("Unable to load the public album catalog.");
  const albums = await Promise.all((data ?? []).map(async (album) => {
    const mediaQuery = await clients.admin
      .from("public_media_catalog")
      .select("id,type")
      .eq("album_id", album.id);
    if (mediaQuery.error) throw new Error("Unable to load album media counts.");
    const items = mediaQuery.data ?? [];
    const cover = album.cover_media_id
      ? await signedImageSet(clients, album.cover_media_id)
      : undefined;
    return {
      id: album.id,
      slug: album.slug,
      title: album.title,
      description: album.description ?? undefined,
      eventName: album.event_name ?? undefined,
      category: album.category ?? undefined,
      eventDate: album.event_date ?? undefined,
      publishedAt: album.published_at ?? undefined,
      status: "published",
      cover: cover ? { ...cover.large, srcSet: cover.srcSet, alt: album.title } : undefined,
      mediaType: items.some((item) => item.type === "video") ? "mixed" : "photo",
      mediaCount: items.length,
      createdAt: album.created_at,
    };
  }));
  return jsonResponse(request, {
    items: albums,
    page,
    pageSize,
    total: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function publicAlbumMedia(clients: SupabaseClients, request: Request, slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ApiError(400, "Album slug is invalid.");
  const { data: album, error: albumError } = await clients.admin
    .from("public_album_catalog")
    .select("id,slug,title,description,event_name,category,event_date,published_at,created_at,cover_media_id")
    .eq("slug", slug)
    .maybeSingle();
  if (albumError) throw new Error("Unable to load the public album.");
  if (!album) throw new ApiError(404, "Published album not found.");
  const { data: items, error } = await clients.admin
    .from("public_media_catalog")
    .select("id,album_id,type,alt,caption,width,height,sort_order,published_at")
    .eq("album_id", album.id)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error("Unable to load published album media.");
  const media = await Promise.all((items ?? []).map(async (item) => {
    const imageSet = await signedImageSet(clients, item.id);
    if (!imageSet) throw new Error("An approved image variant is missing.");
    return {
      id: item.id,
      type: "photo",
      src: imageSet.large.src,
      srcSet: imageSet.srcSet,
      thumbnailSrc: imageSet.thumbnail?.src,
      alt: item.alt,
      caption: item.caption ?? undefined,
      width: item.width ?? imageSet.large.width,
      height: item.height ?? imageSet.large.height,
    };
  }));
  return jsonResponse(request, {
    album: {
      id: album.id,
      slug,
      title: album.title,
      description: album.description ?? undefined,
      eventName: album.event_name ?? undefined,
      category: album.category ?? undefined,
      eventDate: album.event_date ?? undefined,
      publishedAt: album.published_at ?? undefined,
      status: "published",
      mediaType: "photo",
      mediaCount: media.length,
      createdAt: album.created_at,
    },
    items: media,
    page: 1,
    pageSize: media.length || 1,
    total: media.length,
    totalPages: media.length ? 1 : 0,
  });
}

async function adminAlbums(clients: SupabaseClients) {
  requireRoles(clients, managers);
  const { data, error } = await clients.admin
    .from("albums")
    .select("id,slug,title,description,event_name,category,event_date,status,cover_media_id,published_at,created_at,deleted_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Unable to load managed albums.");
  return await Promise.all((data ?? []).map(async (album) => {
    const [{ count, error: countError }, cover] = await Promise.all([
      clients.admin.from("media").select("id", { count: "exact", head: true })
        .eq("album_id", album.id).is("deleted_at", null),
      album.cover_media_id ? signedImageSet(clients, album.cover_media_id) : undefined,
    ]);
    if (countError) throw new Error("Unable to load managed album counts.");
    return {
      id: album.id,
      slug: album.slug,
      title: album.title,
      description: album.description ?? undefined,
      eventName: album.event_name ?? undefined,
      category: album.category ?? undefined,
      eventDate: album.event_date ?? undefined,
      status: album.status,
      publishedAt: album.published_at ?? undefined,
      createdAt: album.created_at,
      deletedAt: album.deleted_at ?? undefined,
      cover: cover ? { ...cover.large, srcSet: cover.srcSet, alt: album.title } : undefined,
      mediaType: "photo",
      mediaCount: count ?? 0,
    };
  }));
}

async function createUploads(clients: SupabaseClients, request: Request, albumId: string) {
  requireRoles(clients, managers);
  if (!validUuid(albumId)) throw new ApiError(400, "Album identifier is invalid.");
  const body = await readJson(request);
  if (!Array.isArray(body.files) || body.files.length < 1 || body.files.length > 10) {
    throw new ApiError(400, "Select between 1 and 10 images.");
  }
  const { data: limits, error: limitsError } = await clients.admin
    .from("media_settings")
    .select("max_upload_bytes,max_batch_files,max_batch_bytes")
    .eq("singleton", true)
    .single();
  if (limitsError || !limits) throw new Error("Unable to load media upload limits.");
  if (body.files.length > limits.max_batch_files) {
    throw new ApiError(400, `Select no more than ${limits.max_batch_files} images.`);
  }
  let totalSize = 0;
  const files = body.files.map((file) => {
    if (!file || typeof file !== "object" || Array.isArray(file)) throw new ApiError(400, "An upload entry is invalid.");
    const input = file as Record<string, unknown>;
    if (typeof input.name !== "string" || typeof input.size !== "number"
        || !Number.isSafeInteger(input.size) || input.size < 1 || input.size > limits.max_upload_bytes
        || typeof input.type !== "string" || !allowedTypes.has(input.type)
        || (input.alt !== undefined && typeof input.alt !== "string")
        || (input.caption !== undefined && typeof input.caption !== "string")) {
      throw new ApiError(400, "The image format or file size does not meet the upload limits.");
    }
    const id = crypto.randomUUID();
    const filename = input.name.replace(/[\\/\u0000-\u001f\u007f]/g, "_").trim().slice(0, 255);
    if (!filename) throw new ApiError(400, "An upload filename is required.");
    const alt = typeof input.alt === "string" && input.alt.trim()
      ? input.alt.trim().slice(0, 300)
      : filename.slice(0, 300);
    const caption = typeof input.caption === "string" ? input.caption.trim().slice(0, 2000) : "";
    totalSize += input.size;
    return {
      id,
      file_size_bytes: input.size,
      declared_mime_type: input.type,
      original_filename: filename,
      alt,
      caption,
      quarantine_path: `${clients.userId}/${id}/${crypto.randomUUID()}`,
    };
  });
  if (totalSize > limits.max_batch_bytes) throw new ApiError(400, "The batch exceeds the configured total size limit.");

  const { data: created, error } = await clients.user.rpc("admin_create_uploads", {
    p_album_id: albumId,
    p_files: files,
  });
  if (error) mapDatabaseError(error);
  const sessions = (created ?? []).map((item: { id: string; quarantine_path: string }) => ({
    id: item.id,
    path: item.quarantine_path,
  }));
  return jsonResponse(request, { items: sessions }, 201);
}

async function completeUpload(clients: SupabaseClients, request: Request, mediaId: string) {
  requireRoles(clients, managers);
  if (!validUuid(mediaId)) throw new ApiError(400, "Media identifier is invalid.");
  const { data: media, error } = await clients.admin
    .from("media")
    .select("id,uploader_id,quarantine_path,file_size_bytes,status")
    .eq("id", mediaId)
    .maybeSingle();
  if (error) throw new Error("Unable to verify the upload record.");
  if (!media || media.uploader_id !== clients.userId || media.status !== "awaiting_upload") {
    throw new ApiError(404, "The pending upload was not found.");
  }
  const parts = media.quarantine_path.split("/");
  const filename = parts.pop()!;
  const directory = parts.join("/");
  const { data: files, error: listError } = await clients.admin.storage
    .from("media-quarantine")
    .list(directory, { search: filename, limit: 5 });
  if (listError) throw new Error("Unable to verify the quarantined upload.");
  const uploaded = files?.find((item) => item.name === filename);
  if (!uploaded || uploaded.metadata?.size !== media.file_size_bytes) {
    throw new ApiError(409, "The uploaded file is missing or its size does not match the authorized upload.");
  }
  const { error: completeError } = await clients.user.rpc("admin_complete_upload", { p_media_id: mediaId });
  if (completeError) mapDatabaseError(completeError);
  return jsonResponse(request, { id: mediaId, status: "uploaded" }, 202);
}

async function retryUpload(clients: SupabaseClients, request: Request, mediaId: string) {
  requireRoles(clients, managers);
  if (!validUuid(mediaId)) throw new ApiError(400, "Media identifier is invalid.");
  const { data: media, error } = await clients.admin
    .from("media")
    .select("id,quarantine_path,file_size_bytes,status")
    .eq("id", mediaId)
    .maybeSingle();
  if (error) throw new Error("Unable to verify the failed upload.");
  if (!media || !["scan_failed", "processing_failed"].includes(media.status)) {
    throw new ApiError(404, "The failed upload is not available for retry.");
  }
  const parts = media.quarantine_path.split("/");
  const filename = parts.pop()!;
  const { data: files, error: listError } = await clients.admin.storage
    .from("media-quarantine")
    .list(parts.join("/"), { search: filename, limit: 5 });
  if (listError) throw new Error("Unable to verify the quarantined upload.");
  const uploaded = files?.find((item) => item.name === filename);
  if (!uploaded || uploaded.metadata?.size !== media.file_size_bytes) {
    throw new ApiError(409, "The quarantined image is no longer available for retry.");
  }
  const { error: retryError } = await clients.user.rpc("admin_retry_upload", { p_media_id: mediaId });
  if (retryError) mapDatabaseError(retryError);
  return jsonResponse(request, { id: mediaId, status: "uploaded" }, 202);
}

async function uploadLimits(clients: SupabaseClients, request: Request) {
  requireRoles(clients, managers);
  const { data, error } = await clients.admin
    .from("media_settings")
    .select("max_upload_bytes,max_batch_files,max_batch_bytes,max_concurrent_uploads,retention_days")
    .eq("singleton", true)
    .single();
  if (error || !data) throw new Error("Unable to load media upload limits.");
  return jsonResponse(request, {
    limits: {
      maxFileSizeBytes: data.max_upload_bytes,
      maxBatchFiles: data.max_batch_files,
      maxBatchBytes: data.max_batch_bytes,
      maxConcurrentUploads: data.max_concurrent_uploads,
      retentionDays: data.retention_days,
    },
  });
}

async function handle(request: Request): Promise<Response> {
  assertAllowedOrigin(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const clients = await createClients(request);
  const parts = routeParts(request);

  if (request.method === "GET" && parts.length === 1 && parts[0] === "albums") {
    return await publicAlbums(clients, request);
  }
  if (request.method === "GET" && parts.length === 1 && parts[0] === "me") {
    if (!clients.userId || !clients.role) throw new ApiError(401, "Authentication required.");
    return jsonResponse(request, {
      user: { id: clients.userId, email: clients.email, role: clients.role },
    });
  }
  if (request.method === "GET" && parts.length === 2 && parts[0] === "albums") {
    return await publicAlbumMedia(clients, request, parts[1]);
  }
  if (request.method === "GET" && parts.join("/") === "admin/albums") {
    return jsonResponse(request, { items: await adminAlbums(clients) });
  }
  if (request.method === "GET" && parts.join("/") === "admin/uploads") {
    requireRoles(clients, managers);
    const { data, error } = await clients.admin
      .from("media")
      .select("id,album_id,original_filename,file_size_bytes,status,scan_status,processing_status,created_at,upload_jobs(status,error_code,retry_count)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Unable to load upload status.");
    return jsonResponse(request, { items: data ?? [] });
  }
  if (request.method === "GET" && parts.join("/") === "admin/upload-limits") {
    return await uploadLimits(clients, request);
  }
  if (request.method === "POST" && parts.join("/") === "admin/albums") {
    requireRoles(clients, managers);
    const body = await readJson(request);
    const allowed = ["title", "slug", "description", "event_name", "category", "event_date"];
    if (Object.keys(body).some((key) => !allowed.includes(key))
        || typeof body.title !== "string" || typeof body.slug !== "string") {
      throw new ApiError(400, "Album title and slug are required; unknown fields are not allowed.");
    }
    const { data, error } = await clients.user.rpc("admin_create_album", {
      p_title: body.title,
      p_slug: body.slug,
      p_description: body.description ?? null,
      p_event_name: body.event_name ?? null,
      p_category: body.category ?? null,
      p_event_date: body.event_date ?? null,
    });
    if (error) mapDatabaseError(error);
    return jsonResponse(request, { album: data }, 201);
  }
  if (request.method === "PATCH" && parts.length === 3 && parts[0] === "admin" && parts[1] === "albums") {
    requireRoles(clients, managers);
    if (!validUuid(parts[2])) throw new ApiError(400, "Album identifier is invalid.");
    const body = await readJson(request);
    const { data, error } = await clients.user.rpc("admin_update_album", {
      p_album_id: parts[2],
      p_changes: body,
    });
    if (error) mapDatabaseError(error);
    return jsonResponse(request, { album: data });
  }
  if (request.method === "DELETE" && parts.length === 3 && parts[0] === "admin" && parts[1] === "albums") {
    requireRoles(clients, managers);
    if (!validUuid(parts[2])) throw new ApiError(400, "Album identifier is invalid.");
    const body = await readJson(request);
    if (body.confirm !== true) throw new ApiError(400, "Explicit confirmation is required.");
    const { error } = await clients.user.rpc("admin_delete_album", { p_album_id: parts[2], p_confirm: true });
    if (error) mapDatabaseError(error);
    return jsonResponse(request, { id: parts[2], deleted: true });
  }
  if (request.method === "POST" && parts.length === 4 && parts[0] === "admin" && parts[1] === "albums" && parts[3] === "uploads") {
    return await createUploads(clients, request, parts[2]);
  }
  if (request.method === "POST" && parts.length === 4 && parts[0] === "admin" && parts[1] === "media" && parts[3] === "complete") {
    return await completeUpload(clients, request, parts[2]);
  }
  if (request.method === "POST" && parts.length === 4 && parts[0] === "admin" && parts[1] === "media" && parts[3] === "retry") {
    return await retryUpload(clients, request, parts[2]);
  }
  if (request.method === "PATCH" && parts.length === 3 && parts[0] === "admin" && parts[1] === "media") {
    requireRoles(clients, managers);
    if (!validUuid(parts[2])) throw new ApiError(400, "Media identifier is invalid.");
    const body = await readJson(request);
    if (Object.keys(body).length !== 1 || !["published", "approved"].includes(String(body.status))) {
      throw new ApiError(400, "Only an explicit publish or unpublish status is accepted.");
    }
    const { error } = await clients.user.rpc("admin_set_media_status", {
      p_media_id: parts[2],
      p_status: body.status,
    });
    if (error) mapDatabaseError(error);
    return jsonResponse(request, { id: parts[2], status: body.status });
  }
  if (request.method === "DELETE" && parts.length === 3 && parts[0] === "admin" && parts[1] === "media") {
    requireRoles(clients, managers);
    if (!validUuid(parts[2])) throw new ApiError(400, "Media identifier is invalid.");
    const body = await readJson(request);
    if (body.confirm !== true) throw new ApiError(400, "Explicit confirmation is required.");
    const { error } = await clients.user.rpc("admin_delete_media", { p_media_id: parts[2], p_confirm: true });
    if (error) mapDatabaseError(error);
    return jsonResponse(request, { id: parts[2], deleted: true });
  }
  if (request.method === "PATCH" && parts.length === 3 && parts[0] === "admin" && parts[1] === "media-order") {
    requireRoles(clients, managers);
    if (!validUuid(parts[2])) throw new ApiError(400, "Album identifier is invalid.");
    const body = await readJson(request);
    if (!Array.isArray(body.mediaIds) || body.mediaIds.some((id) => typeof id !== "string" || !validUuid(id))) {
      throw new ApiError(400, "A valid media order is required.");
    }
    const { error } = await clients.user.rpc("admin_reorder_media", { p_album_id: parts[2], p_media_ids: body.mediaIds });
    if (error) mapDatabaseError(error);
    return jsonResponse(request, { albumId: parts[2], reordered: true });
  }
  if (request.method === "PATCH" && parts.length === 3 && parts[0] === "admin" && parts[1] === "media-move") {
    requireRoles(clients, managers);
    if (!validUuid(parts[2])) throw new ApiError(400, "Media identifier is invalid.");
    const body = await readJson(request);
    if (typeof body.albumId !== "string" || !validUuid(body.albumId)) throw new ApiError(400, "A valid destination album is required.");
    const { error } = await clients.user.rpc("admin_move_media", { p_media_id: parts[2], p_album_id: body.albumId });
    if (error) mapDatabaseError(error);
    return jsonResponse(request, { id: parts[2], albumId: body.albumId });
  }
  throw new ApiError(404, "Archive operation not found.");
}

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (error) {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    if (error instanceof ApiError) return jsonResponse(request, { error: error.message, requestId }, error.status);
    console.error(JSON.stringify({ event: "archive_function_error", requestId }));
    return jsonResponse(request, { error: "The archive service could not complete the request.", requestId }, 500);
  }
});
