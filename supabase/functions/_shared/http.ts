import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type AppRole = "SUPER_ADMIN" | "MEDIA_ADMIN" | "REGULAR_USER";
export type SupabaseClients = {
  admin: SupabaseClient;
  user: SupabaseClient;
  userId: string | null;
  email: string | null;
  role: AppRole | null;
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required function secret: ${name}`);
  return value;
}

function allowedOrigins(): string[] {
  const configuredOrigins = Deno.env.get("SITE_ORIGINS")?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  const legacyOrigin = Deno.env.get("SITE_ORIGIN")?.trim();
  if (legacyOrigin) configuredOrigins.push(legacyOrigin);
  if (configuredOrigins.length === 0) {
    throw new Error("Missing required function secret: SITE_ORIGINS (or SITE_ORIGIN)");
  }
  return [...new Set(configuredOrigins)];
}

export function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-bootstrap-token",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Vary": "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins().includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

export function assertAllowedOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().includes(origin)) {
    throw new ApiError(403, "This origin is not allowed.");
  }
}

export function jsonResponse(request: Request, body: unknown, status = 200): Response {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 16_384) throw new ApiError(413, "Request body is too large.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Request body must contain valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "Request body must be an object.");
  }
  return value as Record<string, unknown>;
}

export async function createClients(request: Request): Promise<SupabaseClients> {
  const url = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authorization = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
  if (!token) {
    return {
      admin,
      user: createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } }),
      userId: null,
      email: null,
      role: null,
    };
  }
  if (token === anonKey) {
    return {
      admin,
      user: createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } }),
      userId: null,
      email: null,
      role: null,
    };
  }

  const user = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await user.auth.getUser(token);
  if (authError || !authData.user) {
    throw new ApiError(401, "Authentication required.");
  }
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,active")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) throw new Error("Unable to verify the account role.");
  if (!profile || !profile.active) throw new ApiError(401, "Authentication required.");
  const role = profile.role as AppRole;
  if (!["SUPER_ADMIN", "MEDIA_ADMIN", "REGULAR_USER"].includes(role)) {
    throw new ApiError(403, "The account role is not valid.");
  }
  return { admin, user, userId: authData.user.id, email: authData.user.email ?? null, role };
}

export function requireRoles(clients: SupabaseClients, roles: readonly AppRole[]): void {
  if (!clients.userId) throw new ApiError(401, "Authentication required.");
  if (!clients.role || !roles.includes(clients.role)) {
    throw new ApiError(403, "You do not have permission to perform this action.");
  }
}

export function mapDatabaseError(error: { code?: string } | null): never {
  if (error?.code === "42501") throw new ApiError(403, "You do not have permission to perform this action.");
  if (error?.code === "23505") throw new ApiError(409, "That album slug is already in use.");
  if (error?.code === "P0002") throw new ApiError(404, "The requested record was not found.");
  if (error?.code === "22023" || error?.code === "23514") throw new ApiError(400, "The requested change is not valid.");
  if (error?.code === "54000") throw new ApiError(429, "An upload or storage limit was reached.");
  throw new Error("A database operation failed.");
}

export function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function sanitizedFilename(value: string): string {
  return value
    .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
    .trim()
    .slice(0, 255);
}
