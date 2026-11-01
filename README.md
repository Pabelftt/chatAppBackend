# ChatApp Backend

Node.js 20+ / Express API with MongoDB/Mongoose-backed account registration,
login, short-lived JWT access tokens, rotating refresh tokens, and an
authenticated profile endpoint. This is the first implementation phase, not a
complete chat backend. Messaging, FCM, WebRTC, location sharing, groups,
attachments, and E2EE are not implemented.

## Run locally

1. Install Node.js 20+ and MongoDB 7+.
2. Copy `.env.example` to `.env`.
3. Configure `MONGODB_URI`, two distinct random JWT secrets of at least 32
   characters, and explicit `CORS_ORIGIN` values. Do not use the example
   secrets in `.env.example`.
4. Run `npm ci`, `npm test`, and `npm start`.
5. Check `GET http://localhost:3000/health`.

## Render deployment with Docker

Create a Render Web Service using the Docker runtime:

- **Repository:** `https://github.com/Pavelprfb/chatAppBackend`
- **Branch:** `main`
- **Root directory:** blank (the Dockerfile is at the repository root)
- **Dockerfile path:** `./Dockerfile`
- **Health check path:** `/health`

The Docker image runs the backend tests during its build, includes only
production dependencies in the final image, runs as the unprivileged `node`
user, and exposes the `/health` endpoint as its container health check. Do not
set separate build or start commands for the Docker runtime.

Render supplies `PORT`; the container uses that port at runtime.

Set these Render environment variables before deploying:

- `NODE_ENV=production`
- `MONGODB_URI` — an authenticated MongoDB connection string reachable from
  the service
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — different, securely generated
  random secrets (at least 32 characters)
- `CORS_ORIGIN` — comma-separated, explicitly permitted browser origins; native
  Android apps do not require browser CORS access
- Optionally `ACCESS_TOKEN_TTL=15m` and `REFRESH_TOKEN_DAYS=30`

Never commit `.env`, MongoDB credentials, or signing/service-account files.

### Alternative: Render Node runtime

If you select the Node runtime instead of Docker, use:

- **Build command:** `npm ci && npm test`
- **Start command:** `npm start`

## Implemented API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout` (bearer access token required)
- `GET /api/users/me` (bearer access token required)
- `GET /health`

See [`API.md`](../docs/API.md) and [`SECURITY.md`](../docs/SECURITY.md).
The Android client is maintained in the separate `chatAppAndroid` repository.
