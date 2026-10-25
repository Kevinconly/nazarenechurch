# Church of the Nazarene — Remera Archive

A responsive public homepage for the congregation's photo and video archive, backed by a separate Express API foundation. The homepage is ready to connect to published album data; it does not invent or preview historical church content.

## Current homepage

The root route includes the shared site header and navigation, an editorial archive introduction, searchable album results, archive filters, and the shared footer. Search matches album title, explicit event/category metadata, and valid event year; filter options are derived from published records. Production album data remains empty until published records are connected, so the homepage displays its prepared empty state and metadata filters remain unavailable. Album cards link to `/gallery/:slug` when records exist. Album details use a separate media lookup, show an empty state when there are no media items, and provide a native-dialog photo viewer and browser-controlled video playback.

Development mode includes one explicitly marked empty-album preview record for checking album routing and empty-state behavior. It contains no photographs, video, or invented church history, and is excluded from production builds. No safe demonstration photo or video was supplied, so the photo viewer and video player need suitable media records to be exercised manually.

## Prerequisites

- Node.js 20.19+ (or 22.12+) and npm.
- Install dependencies independently in `frontend/` and `backend/` with `npm install`.

## Local configuration

Copy the root `.env.example` to `backend/.env` and replace the `DATABASE_URL` placeholders with a PostgreSQL connection URL. The API defaults to port 3001 and only allows the Vite development origin `http://localhost:5173` for CORS. Set `FRONTEND_ORIGIN` to the exact frontend origin when using another host or port. No frontend secrets are needed. The Vite development server proxies `/api` to `http://localhost:3001`.

The backend uses PostgreSQL through the `pg` driver and reviewed SQL migrations (no ORM). Create an empty database named `remera_archive`, configure `DATABASE_URL`, then run `cd backend && npm run migrate` once before starting the API. TLS certificate verification is enabled. If the database certificate is not in Node's trust store, download the database CA certificate from the provider and set `DATABASE_SSL_CA_FILE` to its local path. The initial migration creates constrained `albums` and `media` tables; both default to unpublished (`draft`). The API's public routes only return published albums and media. Test records exist only in automated tests, not as archive content.

## Development

Run the frontend and backend in separate terminals:

```sh
cd frontend
npm install
npm run dev
```

```sh
cd backend
npm install
npm run dev
```

Open the Vite URL printed in the frontend terminal. The API health check is `GET http://localhost:3001/api/health` and returns `{ "status": "ok", "service": "remera-archive-api" }`. Public album pages are `GET /api/albums?page=1&pageSize=20`; published album media is `GET /api/albums/:slug/media?page=1&pageSize=20`. Page size is limited to 100. Both return `items`, `page`, `pageSize`, `total`, and `totalPages`.

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

## Brand and design

Original supplied logo files are in `frontend/public/brand/`; see `frontend/src/styles/brand-assets.md` for variant guidance. The official Church of the Nazarene style guide PDF is kept as a local reference only and is intentionally excluded from the repository and the built site. The interface uses the supplied neutral and accent palette, with Lato bundled locally for body and heading use. Brandon Grotesque is not loaded because no licensed font files were supplied. A Remera church-name logo was not supplied, so the local church name appears as surrounding page text. Logo artwork has not been recreated or recolored.

The shared shell and homepage use semantic landmarks, a skip link, visible keyboard focus, responsive layouts, and reduced-motion handling. No genuine congregation photography was supplied; the homepage uses a text-led composition and does not present placeholder imagery as archive content.

## Theme preference

Use the **Theme** control in the site header to choose **Light**, **Dark**, or **System**. System is the initial preference and follows the device's light or dark setting; explicit choices are saved in local storage. If browser storage is unavailable, the chosen appearance still applies for the current visit. The supplied grey logo variants are used on light surfaces and the original white variants are used on dark surfaces.

## Staff authentication and roles

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
