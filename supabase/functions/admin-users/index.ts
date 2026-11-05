import { ApiError, assertAllowedOrigin, createClients, corsHeaders, jsonResponse, readJson, requireRoles, validUuid } from "../_shared/http.ts";

const superAdmin = ["SUPER_ADMIN"] as const;
const assignableRoles = new Set(["MEDIA_ADMIN", "REGULAR_USER"]);

function requestPath(request: Request): string[] {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const index = parts.indexOf("admin-users");
  return index < 0 ? [] : parts.slice(index + 1);
}

async function handle(request: Request): Promise<Response> {
  assertAllowedOrigin(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const clients = await createClients(request);
  requireRoles(clients, superAdmin);
  const path = requestPath(request);

  if (request.method === "GET" && path.length === 0) {
    const { data, error } = await clients.admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error("Unable to list administrator accounts.");
    const { data: profiles, error: profileError } = await clients.admin
      .from("profiles")
      .select("id,role,active,created_at");
    if (profileError) throw new Error("Unable to load account roles.");
    const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    return jsonResponse(request, {
      items: data.users.map((user) => {
        const profile = byId.get(user.id);
        return {
          id: user.id,
          email: user.email,
          role: profile?.role ?? "REGULAR_USER",
          active: profile?.active ?? false,
          createdAt: profile?.created_at ?? user.created_at,
        };
      }),
    });
  }

  if (request.method === "POST" && path.length === 0) {
    const body = await readJson(request);
    if (Object.keys(body).some((key) => !["email", "role"].includes(key))
        || typeof body.email !== "string"
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
        || typeof body.role !== "string" || !assignableRoles.has(body.role)) {
      throw new ApiError(400, "A valid email and an assignable role are required.");
    }
    const { data: invited, error } = await clients.admin.auth.admin.inviteUserByEmail(body.email.trim());
    if (error || !invited.user) throw new ApiError(503, "Unable to send the account invitation. Verify the configured Supabase email provider.");
    const { error: roleError } = await clients.user.rpc("super_admin_assign_role", {
      p_user_id: invited.user.id,
      p_role: body.role,
    });
    if (roleError) {
      await clients.admin.auth.admin.deleteUser(invited.user.id);
      throw new ApiError(400, "Unable to apply the invited account role.");
    }
    return jsonResponse(request, {
      user: { id: invited.user.id, email: invited.user.email, role: body.role, active: true },
    }, 201);
  }

  if (request.method === "PATCH" && path.length === 1) {
    const userId = path[0];
    if (!validUuid(userId)) throw new ApiError(400, "User identifier is invalid.");
    if (userId === clients.userId) throw new ApiError(400, "You cannot change your own account role or status.");
    const body = await readJson(request);
    if (Object.keys(body).length !== 1) throw new ApiError(400, "Provide exactly one role or active-status change.");
    const { data: target, error: targetError } = await clients.admin
      .from("profiles")
      .select("id,role,active")
      .eq("id", userId)
      .maybeSingle();
    if (targetError) throw new Error("Unable to load the target account.");
    if (!target) throw new ApiError(404, "User not found.");
    if (typeof body.role === "string" && assignableRoles.has(body.role)) {
      const { error } = await clients.user.rpc("super_admin_assign_role", {
        p_user_id: userId,
        p_role: body.role,
      });
      if (error) {
        if (error.code === "42501") throw new ApiError(403, "Super Admin roles cannot be changed here.");
        if (error.code === "P0002") throw new ApiError(404, "User not found.");
        throw new ApiError(400, "The requested role change is not allowed.");
      }
      return jsonResponse(request, { user: { id: userId, role: body.role, active: target.active } });
    }

    if (typeof body.active === "boolean") {
      const { error: changeError } = await clients.user.rpc("super_admin_set_account_active", {
        p_user_id: userId,
        p_active: body.active,
      });
      if (changeError) {
        if (changeError.code === "23514") throw new ApiError(409, "At least one active Super Admin must remain.");
        if (changeError.code === "42501") throw new ApiError(403, "You do not have permission to change this account.");
        if (changeError.code === "P0002") throw new ApiError(404, "User not found.");
        throw new ApiError(400, "The requested account status change is not allowed.");
      }
      const { error: authError } = await clients.admin.auth.admin.updateUserById(userId, {
        ban_duration: body.active ? "none" : "876000h",
      });
      if (authError) throw new ApiError(503, "The role policy was updated, but Supabase Auth could not revoke or restore sessions.");
      return jsonResponse(request, { user: { id: userId, role: target.role, active: body.active } });
    }
    throw new ApiError(400, "Provide a valid role or active-status change.");
  }

  throw new ApiError(404, "Administrator account operation not found.");
}

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (error) {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    if (error instanceof ApiError) return jsonResponse(request, { error: error.message, requestId }, error.status);
    console.error(JSON.stringify({ event: "admin_users_function_error", requestId }));
    return jsonResponse(request, { error: "The account service could not complete the request.", requestId }, 500);
  }
});
