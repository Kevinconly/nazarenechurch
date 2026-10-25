# Church of the Nazarene — Remera Archive

Foundation milestone for the congregation's photo and video archive. This repository contains a React/TypeScript frontend and a separate Express/TypeScript API. The public gallery and archive content are future milestones; this scaffold does not imply that historical media is already available.

## Prerequisites

- Node.js 20.19+ (or 22.12+) and npm.
- Install each application independently with `npm install` from `frontend/` and `backend/`.

## Local configuration

Copy the root `.env.example` to `backend/.env` and adjust values if needed. The API defaults to port 3001 and only allows the Vite development origin `http://localhost:5173` for CORS. Set `FRONTEND_ORIGIN` to the exact frontend origin when using another host or port. No frontend secrets are needed. The Vite dev server proxies `/api` to `http://localhost:3001`.

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

## Quality checks

```sh
cd frontend && npm run typecheck && npm run lint && npm run build
cd backend && npm run build
```

## Brand and design

Original supplied logo files are in `frontend/public/brand/`; see `frontend/src/styles/brand-assets.md` for variant guidance. The original Church of the Nazarene style guide PDF is retained in `frontend/public/`. Interface tokens use the supplied neutral and accent palette, Lato is bundled locally for body and heading use, and Brandon Grotesque is not loaded because no licensed font files were supplied. A Remera church-name logo was not supplied; the local church name is presented as page text. No logo artwork has been recreated or recolored.

The shell is responsive and uses visible keyboard focus, a skip link, semantic landmarks, and reduced-motion handling. Its photo area is explicitly labeled as a placeholder and does not contain fabricated historical media.
