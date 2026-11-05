import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ApiError, assertAllowedOrigin, corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";

function tokensMatch(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

async function handle(request: Request): Promise<Response> {
  assertAllowedOrigin(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") throw new ApiError(405, "Method not allowed.");

  const bootstrapToken = Deno.env.get("BOOTSTRAP_TOKEN")?.trim();
  const supplied = request.headers.get("x-bootstrap-token") ?? "";
  if (!bootstrapToken || bootstrapToken.length < 32 || !tokensMatch(supplied, bootstrapToken)) {
    throw new ApiError(403, "The one-time bootstrap authorization is invalid.");
  }

  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !serviceKey) throw new Error("Supabase service configuration is unavailable.");
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const body = await readJson(request);
  if (Object.keys(body).some((key) => !["email", "password"].includes(key))
      || typeof body.email !== "string"
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
      || typeof body.password !== "string"
      || body.password.length < 12
      || new TextEncoder().encode(body.password).length > 72) {
    throw new ApiError(400, "A valid email and a password of 12 to 72 UTF-8 bytes are required.");
  }
  const { data: claimed, error: claimError } = await admin.rpc("claim_super_admin_bootstrap");
  if (claimError) throw new Error("Unable to claim the one-time Super Admin bootstrap.");
  if (!claimed) throw new ApiError(409, "Super Admin bootstrap is already complete or in progress.");

  const { data, error } = await admin.auth.admin.createUser({
    email: body.email.trim(),
    password: body.password,
    email_confirm: true,
  });
  if (error || !data.user) throw new ApiError(409, "Unable to create the initial Super Admin account.");
  const { error: roleError } = await admin.from("profiles")
    .update({ role: "SUPER_ADMIN", active: true })
    .eq("id", data.user.id);
  if (roleError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error("Unable to apply the initial Super Admin role.");
  }
  const { error: completionError } = await admin.rpc("complete_super_admin_bootstrap", { p_user_id: data.user.id });
  if (completionError) throw new Error("The Super Admin was created but bootstrap completion could not be recorded.");
  return jsonResponse(request, { user: { id: data.user.id, email: data.user.email, role: "SUPER_ADMIN" } }, 201);
}

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (error) {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    if (error instanceof ApiError) return jsonResponse(request, { error: error.message, requestId }, error.status);
    console.error(JSON.stringify({ event: "super_admin_bootstrap_error", requestId }));
    return jsonResponse(request, { error: "The bootstrap operation could not be completed.", requestId }, 500);
  }
});
