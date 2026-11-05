# Supabase media stack deployment

This guide covers the new Supabase gallery and image-processing stack. It is
separate from the legacy Express API and root `docker-compose.yml`. The
migrations and services have not been deployed or verified against a live
project. Do not link or push migrations to a production-like project without
explicit approval.

## Components

- `supabase/migrations/`: roles, albums, media/upload workflow, storage policies,
  safe public views, and limit/retention settings.
- `supabase/functions/archive`, `admin-users`, and `bootstrap-super-admin`:
  authenticated gallery/admin endpoints and one-time initial account setup.
- `worker/compose.yaml`: image-processing worker and ClamAV service. The worker
  requires a reviewed, digest-pinned ClamAV image.
- `frontend/`: Supabase URL and public anon/publishable key are compiled into
  the browser bundle. Never put a service-role key in the frontend.

## Isolated environment setup

1. Create a disposable Supabase project or isolated local stack. Confirm the
   project reference before any database operation. The local Supabase CLI
   runtime requires Docker; no local database/runtime validation was available
   during this implementation.
2. Review both SQL migrations and their grants, RLS policies, storage policies,
   and security-definer functions. Apply them only to the isolated environment,
   then test role boundaries, upload reservation limits, cleanup, and published
   reads.
3. Set the Edge Function secret `SITE_ORIGINS` to a comma-separated list of
   exact frontend origins (no trailing slash), for example the production
   `https://...` origin plus `http://localhost:5173` and
   `http://127.0.0.1:5173` when local development needs access. Do not use
   `*`. `SITE_ORIGIN` remains supported for a single origin. Deploy the three
   Edge Functions after configuring the secret. The bootstrap function additionally requires a one-time
   high-entropy `BOOTSTRAP_TOKEN` (at least 32 characters). Supabase supplies
   project URL and keys to Edge Functions; confirm the deployed function
   environment has `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY`.
4. Configure Auth email confirmation and redirect URLs for the intended site.
   Public sign-up is disabled by default; create users through the controlled
   bootstrap/admin workflow. Do not expose the service-role key to browsers or
   logs.
5. Build the frontend with `VITE_SUPABASE_URL` and either
   `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`. These are public client settings. Set the same
   values as build args for `frontend/Dockerfile` or in `frontend/.env` for Vite
   development.
6. Configure the worker's `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` only in its secret environment. Review
   `worker/clamd.conf`, the resource limits in Compose, and the ClamAV image
   provenance before operating it. `worker/.env.example` intentionally uses a
   placeholder digest; replace it with a reviewed image digest.
7. Exercise account bootstrap, album CRUD, upload reservation, TUS transfer,
   ClamAV unavailable/infected responses, image decoding limits, retry/expiry,
   publication, signed image URLs, and retention in the isolated environment.
   Confirm unauthorized roles cannot read private originals or mutate records.
   Configure monitoring, backups, SMTP, secret rotation, and incident response
   before any production rollout.

If the frontend reports that an Edge Function is not deployed, deploy
`archive`, `admin-users`, and `bootstrap-super-admin` to the same Supabase
project selected by `VITE_SUPABASE_URL`. A browser network failure rather than
an HTTP error usually indicates a CORS-origin mismatch; add the browser's exact
`location.origin` to `SITE_ORIGINS` and redeploy the functions.

## Local frontend

Copy `frontend/.env.example` to `frontend/.env`, fill in a non-production
Supabase project URL and anon/publishable key, then run `npm install` and
`npm run dev` from `frontend/`. Do not point local tests at a production-like
database. The frontend build succeeds without these values, but the live
Supabase-backed features will report that configuration is missing.

## Legacy deployment distinction

The root `docker-compose.yml` still builds the Express backend and nginx
frontend. It is not the worker deployment and does not apply the Supabase
migrations. Its frontend build accepts the public Vite values, but running that
Compose stack does not create Supabase resources or deploy Edge Functions.
