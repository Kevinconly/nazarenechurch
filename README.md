# Church of the Nazarene — Remera Archive

Responsive public gallery and administration UI for the congregation's photo
archive. The active gallery now uses Supabase (Auth, Postgres, Storage, and Edge
Functions) and a separate image-scanning worker; the Express/PostgreSQL backend
and root Compose stack described below are a legacy deployment and are not
connected to the Supabase-backed gallery. Neither stack is deployed by this
repository change. Do not apply migrations to a production-like project without
explicit approval.

## Current homepage

The root route presents published Supabase albums, searchable/filterable results,
and shared site navigation. Album details show responsive processed images with
a keyboard- and touch-operable photo viewer. The `/admin` area requires a
Supabase account and role; it supports album CRUD, bounded uploads, processing
status/retry, and publish/unpublish/delete workflows. Empty and configuration
errors are explicit; no historical content is fabricated.

The Supabase migrations, Edge Functions, and worker are implementation artifacts,
not evidence of a deployed or operational service. Browser-level responsive
verification and live Supabase integration remain outstanding; see
[UI_AUDIT.md](UI_AUDIT.md),
[MEDIA_SECURITY_AUDIT.md](MEDIA_SECURITY_AUDIT.md), and
[docs/SUPABASE_MEDIA_DEPLOYMENT.md](docs/SUPABASE_MEDIA_DEPLOYMENT.md).

## Prerequisites

- Node.js 20.19+ (or 22.12+) and npm.
- Install dependencies independently in `frontend/` and `backend/` with `npm install`.

## Local configuration

For the Supabase-backed frontend, copy `frontend/.env.example` to
`frontend/.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the
public project URL and anon/publishable key. The key can be supplied as
`VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`. These browser values are embedded
at build time and are not service-role credentials. For the legacy backend,
copy the root `.env.example` to `backend/.env` and set the PostgreSQL
`DATABASE_URL`. Do not reuse production credentials for local testing.

The backend uses PostgreSQL through the `pg` driver and reviewed SQL migrations (no ORM). Create an empty database named `remera_archive`, configure `DATABASE_URL`, then run `cd backend && npm run migrate` once before starting the API. TLS certificate verification is enabled. If the database certificate is not in Node's trust store, download the database CA certificate from the provider and set `DATABASE_SSL_CA_FILE` to its local path. The initial migration creates constrained `albums` and `media` tables; both default to unpublished (`draft`). The API's public routes only return published albums and media. Test records exist only in automated tests, not as archive content.

## Development

Run the frontend in its own terminal after configuring `frontend/.env`:

```sh
cd frontend
npm install
npm run dev
```

The Vite development server prints the local URL. It connects directly to the
configured Supabase project. For a local Supabase stack, use the Supabase CLI
and follow [the media deployment guide](docs/SUPABASE_MEDIA_DEPLOYMENT.md);
Docker/Supabase CLI runtime checks were not performed for this change.

The Express API under `backend/` and its `/api/*` routes remain available as a
separate legacy application. They are not the current gallery data/auth
boundary; avoid running it as though it supplies the Supabase gallery.

## Backend checks

Run from `backend/`:

```sh
npm run typecheck
npm test
npm run build
```

## Frontend checks

Run these commands from `frontend/` before submitting changes:

```sh
npm run typecheck
npm run lint
npm run test
npm run build
```

## CI/CD

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

- Backend: `npm ci`, typecheck, tests, build, and a production dependency audit.
- Frontend: `npm ci`, typecheck, lint, tests, build, and a production dependency audit.
- Containers: builds both images and scans them with Trivy; critical
  vulnerabilities fail the job.

Dependabot is configured for both npm projects, both Dockerfiles, and GitHub
Actions. Run the same checks locally with the commands in the sections above plus
`npm audit --omit=dev --audit-level=high` in each project.

## Container deployment

The root Compose file deploys the **legacy Express/PostgreSQL app**, not the
Supabase media worker. It remains separate from the current gallery integration.
The frontend image accepts `VITE_SUPABASE_URL` and either
`VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY` build args; configure those public values in the root
`.env` before building it. The Supabase worker and ClamAV have a separate
Compose file in `worker/compose.yaml`; see the deployment guide before operating
it. Container execution has not been validated locally.

```sh
cp .env.example .env
# This root Compose stack is legacy. Set its backend values plus the public
# VITE_SUPABASE_URL and either public client-key build value as appropriate.
docker compose build
docker compose run --rm backend node dist/db/migrate.js
docker compose run --rm backend node dist/auth/provisionAdmin.js
docker compose up -d
```

Only the frontend port (`HTTP_PORT`, default 8080) is published. The backend is
reachable only on the internal Compose network. Both containers use read-only
root filesystems, dropped capabilities, and `no-new-privileges`. The nginx layer
adds CSP, HSTS, framing, referrer, permissions, and MIME-sniffing headers, and
proxies `/api` to the backend.

Production mode requires HTTPS in front of the stack and a real secret manager.
See [docs/AWS_PRODUCTION.md](docs/AWS_PRODUCTION.md) for the AWS reference
architecture, WAF/RDS/IAM/CloudWatch checklist, and migration/provisioning steps.
The application-level threat mapping is in [SECURITY.md](SECURITY.md).

## Legacy backend capability matrix

| Capability | Status | Notes |
| --- | --- | --- |
| File uploads | **Not implemented in the legacy backend** | The separate Supabase media pipeline is implemented in migrations/functions/worker but not deployed or runtime-verified. |
| Account management | **Partial** | Sign-in/out, server-side sessions, CSRF, Administrator create/list, role and status changes, self-change protection, and last-Administrator protection. Missing password reset, invitations, email verification, MFA, a durable audit log, and paginated user listing. |
| Public single-photo link | **Not implemented** | Public media is exposed only as a paginated list at `GET /api/albums/:slug/media`. There is no single-media route or photo permalink. |
| Custom albums / share links | **Partial** | Published albums are addressable by slug at `/gallery/:slug` and through `GET /api/albums/:slug/media`. Drafts return 404. There are no private share tokens, passwords, or expiring links. |
| Search by event, category, year, or title | **Legacy API: browser-only** | The Supabase frontend filters published albums it has loaded; pagination and live-project behavior still need runtime verification. |
| Input validation | **Yes, current surface** | Every route validates the inputs it consumes; see the endpoint table below. |

### Endpoint validation

| Endpoint | Validation |
| --- | --- |
| `GET /api/health`, `GET /api/health/ready` | No request input; readiness checks the database and returns 503 when unavailable. |
| `GET /api/albums` | Only `page` and `pageSize` allowed; positive safe integers; page size at most 100. |
| `GET /api/albums/:slug/media` | Album slug restricted to lowercase words separated by single hyphens; pagination as above. |
| `GET /api/auth/csrf` | No request input; issues a session-bound hashed CSRF token. |
| `POST /api/auth/sign-in` | Exact `email` and `password` keys only; email format/length; password byte limit; CSRF required; rate limited. |
| `GET /api/auth/me` | Session only; rechecks the active account on every request. |
| `POST /api/auth/sign-out` | CSRF required; no body fields. |
| `GET /api/admin/users` | Administrator session and permission required. |
| `POST /api/admin/users` | Exact `email`, `password`, and `role` keys only; role allow-list; CSRF; Administrator permission. |
| `PATCH /api/admin/users/:id` | UUID format and canonicalization; exact `role`/`active` keys; role/boolean validation; CSRF; self-change and last-Administrator protection. |
| Unknown routes | JSON 404. Oversized bodies return 413; malformed JSON returns 400. |

## Brand and design

Original supplied logo files are in `frontend/public/brand/`; see `frontend/src/styles/brand-assets.md` for variant guidance. The official Church of the Nazarene style guide PDF is kept as a local reference only and is intentionally excluded from the repository and the built site. The interface uses the supplied neutral and accent palette, with Lato bundled locally for body and heading use. Brandon Grotesque is not loaded because no licensed font files were supplied. A Remera church-name logo was not supplied, so the local church name appears as surrounding page text. Logo artwork has not been recreated or recolored.

The shared shell and homepage use semantic landmarks, a skip link, visible keyboard focus, responsive layouts, and reduced-motion handling. No genuine congregation photography was supplied; the homepage uses a text-led composition and does not present placeholder imagery as archive content.

## Theme preference

Use the **Theme** control in the site header to choose **Light**, **Dark**, or **System**. System is the initial preference and follows the device's light or dark setting; explicit choices are saved in local storage. If browser storage is unavailable, the chosen appearance still applies for the current visit. The supplied grey logo variants are used on light surfaces and the original white variants are used on dark surfaces.

## Legacy Express staff authentication and roles

This section describes the separate legacy Express backend only. Its
Contributor/Editor/Administrator roles are not the Supabase gallery roles.
In local development, if `SESSION_SECRET` is omitted, the backend generates an ephemeral random secret; restarting the backend invalidates local sessions. In production, `SESSION_SECRET` is mandatory and must be a unique random value with at least 32 bytes, held in the deployment's secret manager.

Run `cd backend && npm run migrate` to apply the user and server-side session migration. Set `SESSION_SECRET` to a unique random value of at least 32 bytes for production. `NODE_ENV=production` enables secure cookies; serve the application over HTTPS and use an exact `FRONTEND_ORIGIN`. The session cookie is HTTP-only, SameSite=Lax, path `/`, and expires after eight hours. Sessions are stored in PostgreSQL and invalidated on sign-out; inactive users are rechecked against the database on protected requests. The browser obtains a session-bound CSRF token from `/api/auth/csrf` and sends it in `X-CSRF-Token` for sign-in, sign-out, and account changes. Authentication requests are rate limited. Same-origin reverse proxying is recommended; cross-origin deployments must use credentials and the exact configured frontend origin.

Provision the first Administrator from an interactive backend terminal after migrations: `cd backend && npm run provision-admin`. Enter the email and password at the prompts; password input is not echoed and is never supplied as a command argument. Provisioning refuses to add another initial Administrator once one exists. Sign in at `/admin/sign-in`; the header provides sign-out. Administrators can create accounts and change roles/account status at `/admin`. If the initial Administrator is unavailable, use a controlled database operator procedure to restore access; no public reset route is provided. Password reset, invitations, email verification, and archive editing are not implemented in this milestone.

| Role | Permissions in this milestone |
| --- | --- |
| Contributor | Sign in and read own identity/role; no protected account or archive operations. |
| Editor | Sign in and read own identity/role; no protected account or archive operations. |
| Administrator | Read/create accounts, assign any of the three roles, and enable/disable other accounts. Administrators cannot change their own role/status; the final active Administrator cannot be disabled/demoted. |

Public published-album routes remain available without a session. Backend role checks are authoritative; frontend route protection is only a user experience layer. Passwords are stored as bcrypt hashes and are never returned by the API. PostgreSQL TLS certificate verification stays enabled; set `DATABASE_SSL_CA_FILE` if the provider CA is not in Node's trust store. Production deployment still requires verified HTTPS/proxy behavior and a protected secret manager for `SESSION_SECRET`.

For TLS-terminating reverse proxies, set TRUST_PROXY_HOPS to the exact number of trusted hops (default 0). Use HTTPS in production; SESSION_COOKIE_SECURE can enable Secure cookies during local HTTPS testing.

Staff API endpoints are GET /api/auth/csrf, POST /api/auth/sign-in, GET /api/auth/me, POST /api/auth/sign-out, and admin-only GET/POST /api/admin/users plus PATCH /api/admin/users/:id. User passwords are 12+ characters and limited to 72 UTF-8 bytes because bcrypt has a 72-byte input boundary. The database stores only bcrypt password hashes, hashed session identifiers, and hashed CSRF tokens.
