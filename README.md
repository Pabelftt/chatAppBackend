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

## Render deployment

Create a Web Service for this repository with:

- **Root directory:** blank
- **Build command:** `npm ci && npm test`
- **Start command:** `npm start`
- **Health check path:** `/health`

Set these Render environment variables before deployment:

- `NODE_ENV=production`
- `MONGODB_URI` — an authenticated MongoDB connection string reachable from
  the service
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — different, securely generated
  random secrets (at least 32 characters)
- `CORS_ORIGIN` — comma-separated, explicitly permitted browser origins; native
  Android apps do not require browser CORS access
- Optionally `ACCESS_TOKEN_TTL=15m` and `REFRESH_TOKEN_DAYS=30`

Render supplies `PORT`. The service binds to the default network interface.
Never commit `.env`, MongoDB credentials, or signing/service-account files.

## Implemented API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout` (bearer access token required)
- `GET /api/users/me` (bearer access token required)
- `GET /health`

See [`API.md`](../docs/API.md) and [`SECURITY.md`](../docs/SECURITY.md).
The Android client is maintained in the separate `chatAppAndroid` repository.
