# Handoff — production hardening milestone

Last updated: 2026-11-05
Branch: `main`
Last commit: `e8c099e` (pushed to `origin/main`)
CI: https://github.com/Kevinconly/nazarenechurch/actions — latest run **passed** (backend, frontend, both Docker builds + Trivy scans).

Read this before making changes. It records what is done, what is deliberately
not done, and the constraints for continuing.

## 0. Supabase media milestone (current work)

The frontend has since been wired to Supabase Auth/Edge Functions for the
gallery and media-admin flows. SQL migrations, Edge Functions, an isolated
worker/ClamAV Compose stack, and responsive gallery styling are present in the
worktree. This stack has **not** been applied to any Supabase project or
deployed. The original Express backend and root Compose stack are now a separate
legacy path and are not the frontend's gallery/auth service. Do not apply the
migrations or create/bootstrap accounts in any production-like project without
explicit approval.

Latest changes still require final typecheck/lint/test/build/audit verification.
The database migrations and Edge Functions need isolated runtime validation.
No browser automation was available during this milestone, so required
viewport, keyboard, reduced-motion, interaction, and screenshot checks are
pending; see `UI_AUDIT.md` and `MEDIA_SECURITY_AUDIT.md` for evidence limits.

## 1. What is complete

### Security / access control
- Uppercase-UUID self-change bypass fixed in `backend/src/auth/validation.ts`
  (`userId()` canonicalizes to lowercase) and `backend/src/routes/adminUsers.ts`.
  Covered by a regression test.
- Server-side RBAC for every admin route; last active Administrator cannot be
  demoted or disabled; Administrators cannot change their own role/status.
- bcrypt hashes, generic sign-in errors, dummy-hash comparison, session
  regeneration, session expiry, disabled-account recheck, hashed CSRF/session
  identifiers.
- Helmet, strict API CSP, `no-store` on auth/admin, CORS locked to one origin,
  JSON escaping, simple query parser, request IDs, structured logs without
  query strings or secrets, 16 KB JSON limit, request/header/keep-alive
  timeouts, graceful shutdown, `/api/health/ready`.
- Query-parameter allowlist (`page`, `pageSize`), exact body-key allowlists,
  bounded pagination, slug validation.

### Deployment / CI
- `backend/Dockerfile`: multi-stage, `node:22-alpine`, non-root `node`, tini,
  healthcheck; production dependencies only.
- `frontend/Dockerfile`: Vite build + `nginxinc/nginx-unprivileged:1.29.8-alpine3.23`.
  Contains `USER root` + `apk upgrade --no-cache brotli-libs` + `USER 101` to
  patch CVE-2026-111497 (brotli OOB write). **Revisit/remove when the upstream
  base image is rebuilt with `brotli-libs 1.2.1-r0`.**
- `frontend/nginx.conf`: security headers, CSP, `/api` proxy, 1 MB body cap.
- `docker-compose.yml`: read-only roots, dropped caps, `no-new-privileges`,
  backend not published, frontend on `${HTTP_PORT:-8080}`.
- `.github/workflows/ci.yml`: backend and frontend checks, Docker builds, Trivy
  scan failing on critical findings. `aquasecurity/trivy-action@v0.36.0` (needs
  the `v` prefix).
- `.github/dependabot.yml`: npm (both projects), Docker, GitHub Actions.
- Removed two root-level GitHub-generated templates (`node.js.yml`,
  `npm-publish.yml`): there is no root `package.json`, so they always failed.
  Do not re-add them; extend `ci.yml` instead.
- `SECURITY.md`, `docs/AWS_PRODUCTION.md`, README capability + endpoint tables.

### Verification status
- Backend: typecheck, **21/21 tests**, build, `npm audit` → 0 vulnerabilities.
- Frontend: typecheck, lint, **9/9 tests**, build, `npm audit` → 0 vulnerabilities.
- Vite plugin removes the local style-guide PDF from `dist`; the PDF is ignored.
- Tests are in-memory with generated fixtures. No production DB was written to.

## 2. Hard constraints for the next agent

- **Do not migrate, write to, or provision against the configured production-like
  database without explicit approval.** `backend/.env` and `backend/certs/` are
  ignored secrets; never commit them.
- **Docker is not installed on the original dev machine.** Container builds are
  validated only by CI. Do not claim a local Compose smoke test was run.
- **No AWS credentials/account access.** AWS controls are documented, not
  applied.
- On Windows, PowerShell blocks `npm.ps1` — use `npm.cmd`.
- Keep tests in-memory. Do not hardcode reusable passwords/secrets; generate
  fixtures (UUIDs, passwords, session secrets).
- The nginx CSP allows `style-src 'unsafe-inline'` because the theme provider
  sets style attributes; scripts are external (`frontend/public/theme-init.js`).
- Rate limiting is in-process, per task. Multi-task deployments need WAF or a
  shared Redis store.

## 3. Known gaps (verified, not guesses)

| Gap | Detail |
| --- | --- |
| Frontend not wired to API | `frontend/src/lib/albums.ts` uses an empty `publishedAlbumRecords` array; only dev fixtures exist. Search/filters therefore run over no production data. |
| Search is browser-only | `frontend/src/lib/archiveSearch.ts` matches title/event/category/valid year locally. The API has no search or filter parameters and rejects unknown query params. |
| File uploads | Not implemented. No multipart, no storage layer. Do not add naively. |
| Single-photo permalinks | Not implemented. `GET /api/albums/:slug/media` is the only media route. |
| Private/custom share links | Not implemented. Published albums are public by slug; drafts 404. No tokens, passwords, or expiry. |
| Account lifecycle | Missing password reset, invitations, email verification, MFA, durable audit log, and paginated user listing. |
| Initial Administrator | Not provisioned in any real environment. |
| Production DB integration | No live PostgreSQL-backed auth test has been run. |

## 4. Recommended next steps (priority order)

1. **Wire the frontend to the live API.** Replace `publishedAlbumRecords` and
   `mediaRecordsByAlbumId` in `frontend/src/lib/albums.ts` with fetch calls to
   `/api/albums` and `/api/albums/:slug/media`; handle loading/error/empty
   states. Keep the existing Vite proxy and Docker nginx proxy.
2. **Provision the first Administrator** with
   `node dist/auth/provisionAdmin.js` in the target environment (interactive,
   never a CLI password argument).
3. **Server-side search/filtering.** Add validated `q`, `event`, `category`,
   `year` parameters to `GET /api/albums`, update the query allowlist, use
   parameterized `ILIKE`/exact matches, bound input lengths, and add tests.
   Keep the browser filter as a fallback only.
4. **Account lifecycle.** Password reset with single-use hashed tokens and
   expiry, invitations, email verification, optional TOTP MFA, and a durable
   admin audit table (actor, action, target, timestamp, request ID).
5. **File uploads (only with a full design).** Private S3 bucket + block public
   access, presigned PUT, server-side magic-byte/type/size validation,
   malware scanning, image re-encoding/stripping metadata, and lifecycle rules.
   Never trust `Content-Type`.
6. **Share links.** Per-photo and per-album opaque tokens, hashed at rest,
   optional password/expiry, revocation, and no indexing. Drafts must stay 404.
7. **AWS account controls.** Apply `docs/AWS_PRODUCTION.md`: WAF managed + rate
   rules, ALB TLS, private RDS with KMS encryption, task IAM roles, Secrets
   Manager, VPC endpoints, CloudTrail/GuardDuty/Security Hub, CloudWatch alarms.
8. **Operational hardening.** Move rate limits to WAF/Redis for multiple tasks,
   add structured audit logs, test RDS backup restore, and add dependency/update
   cadence review.

## 5. Commands

```powershell
# Backend
cd backend
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd audit --omit=dev --audit-level=high

# Frontend
cd frontend
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd audit --omit=dev --audit-level=high

# Docker (machine with Docker only)
cp .env.example .env   # set real values, never commit
docker compose build
docker compose run --rm backend node dist/db/migrate.js
docker compose run --rm backend node dist/auth/provisionAdmin.js
docker compose up -d
```

## 6. Useful file map

- `backend/src/app.ts` — middleware order, headers, limits, error handling.
- `backend/src/auth/*` — validation, roles, middleware, repository, provisioning.
- `backend/src/routes/*` — albums, auth, admin users, health.
- `backend/src/lib/*` — pagination, query allowlist, HTTP errors.
- `backend/migrations/*` — archive + auth schema (do not run against prod).
- `frontend/src/lib/albums.ts` — **current API boundary to replace**.
- `frontend/src/lib/archiveSearch.ts` — browser search logic + tests.
- `frontend/nginx.conf`, `frontend/Dockerfile` — edge headers and CVE patch.
- `.github/workflows/ci.yml` — the only CI workflow to extend.
