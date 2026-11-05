import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY
  || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)?.trim()
let client: SupabaseClient | undefined
type JsonValue = string | number | boolean | null | undefined | JsonValue[] | { [key: string]: JsonValue }
type JsonObject = { [key: string]: JsonValue }

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and either VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY.')
  }
  client ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      flowType: 'pkce',
    },
  })
  return client
}

export function getSupabaseAnonKey() {
  if (!supabaseAnonKey) {
    throw new Error('Supabase is not configured. Set either VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY.')
  }
  return supabaseAnonKey
}

export function getSupabaseUrl() {
  if (!supabaseUrl) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL.')
  }
  return supabaseUrl.replace(/\/+$/, '')
}

export async function invokeSupabaseFunction<T>(
  name: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: JsonObject,
): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke(name, { method, body })
  if (error) {
    let message = 'The Supabase function could not complete the request.'
    const response = error.context
    if (response instanceof Response) {
      try {
        const payload = await response.clone().json() as { error?: unknown; message?: unknown }
        const detail = typeof payload.error === 'string'
          ? payload.error
          : typeof payload.message === 'string' ? payload.message : undefined
        if (response.status === 404 && detail === 'Requested function was not found') {
          message = `The Supabase Edge Function "${name.split('/')[0]}" is not deployed to the configured project.`
        } else if (detail) {
          message = detail
        } else {
          message = `The Supabase function request failed (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`
        }
      } catch {
        message = `The Supabase function request failed (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`
      }
    } else if (error.message) {
      if (error.message === 'Failed to send a request to the Edge Function') {
        const origin = typeof window === 'undefined' ? 'the frontend origin' : window.location.origin
        message = `Could not reach the Supabase Edge Function "${name.split('/')[0]}". Confirm it is deployed and that its SITE_ORIGINS setting includes ${origin}.`
      } else {
        message = error.message
      }
    }
    throw new Error(message)
  }
  return data as T
}
