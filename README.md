# Church of the Nazarene — Remera Archive

A responsive public homepage for the congregation's photo and video archive, backed by a separate Express API foundation. The homepage is ready to connect to published album data; it does not invent or preview historical church content.

## Current homepage

The root route includes the shared site header and navigation, an editorial archive introduction, featured albums, an archive-browsing introduction, and the shared footer. Album data has a typed boundary in `frontend/src/lib/albums.ts`. Production album data remains empty until published records are connected, so the homepage displays its prepared empty state. Album cards link to `/gallery/:slug` when records exist. Album details use a separate media lookup, show an empty state when there are no media items, and provide a native-dialog photo viewer and browser-controlled video playback.

Development mode includes one explicitly marked empty-album preview record for checking album routing and empty-state behavior. It contains no photographs, video, or invented church history, and is excluded from production builds. No safe demonstration photo or video was supplied, so the photo viewer and video player need suitable media records to be exercised manually.

## Prerequisites

- Node.js 20.19+ (or 22.12+) and npm.
- Install dependencies independently in `frontend/` and `backend/` with `npm install`.

## Local configuration

Copy the root `.env.example` to `backend/.env` and adjust values if needed. The API defaults to port 3001 and only allows the Vite development origin `http://localhost:5173` for CORS. Set `FRONTEND_ORIGIN` to the exact frontend origin when using another host or port. No frontend secrets are needed. The Vite development server proxies `/api` to `http://localhost:3001`.

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

Open the Vite URL printed in the frontend terminal. The API health check is `GET http://localhost:3001/api/health` and returns `{ "status": "ok", "service": "remera-archive-api" }`.

## Frontend checks

Run these commands from `frontend/` before submitting changes:

```sh
npm run typecheck
npm run lint
npm run build
```

## Brand and design

Original supplied logo files are in `frontend/public/brand/`; see `frontend/src/styles/brand-assets.md` for variant guidance. The official Church of the Nazarene style guide PDF is retained in `frontend/public/`. The interface uses the supplied neutral and accent palette, with Lato bundled locally for body and heading use. Brandon Grotesque is not loaded because no licensed font files were supplied. A Remera church-name logo was not supplied, so the local church name appears as surrounding page text. Logo artwork has not been recreated or recolored.

The shared shell and homepage use semantic landmarks, a skip link, visible keyboard focus, responsive layouts, and reduced-motion handling. No genuine congregation photography was supplied; the homepage uses a text-led composition and does not present placeholder imagery as archive content.
