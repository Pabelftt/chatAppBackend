# ChatApp Backend

Node.js 20+ / Express API with MongoDB/Mongoose-backed account registration,
login, short-lived JWT access tokens, rotating refresh tokens, direct
conversations, persisted text messages, participant-authorized REST APIs, and
authenticated Socket.IO delivery and authenticated WebRTC call signaling.
User search uses normalized, indexed username and display-name prefixes.
Firebase Cloud Messaging sends message and incoming-call notifications to
registered Android devices. Location sharing, groups, attachments, and E2EE
are not implemented.

## Run locally

1. Install Node.js 20+ and MongoDB 7+.
2. Copy `.env.example` to `.env`.
3. Configure `MONGODB_URI`, two distinct random JWT secrets of at least 32
   characters, and explicit `CORS_ORIGIN` values. For local FCM delivery, set
   `FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json`. For hosted
   deployments, configure `FIREBASE_SERVICE_ACCOUNT_JSON` as a secret instead.
   Set `CLOUDINARY_URL` to a rotated Cloudinary credential for profile photo
   uploads. Do not use the example secrets in `.env.example`.
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
- `FIREBASE_SERVICE_ACCOUNT_JSON` — Firebase Admin service-account JSON
  contents, stored as a secret (never commit it)
- `CLOUDINARY_URL` — Cloudinary connection URL, stored as a secret, for required
  profile image uploads during account registration
- Optionally `ACCESS_TOKEN_TTL=15m` and `REFRESH_TOKEN_DAYS=30`
- For calls across restrictive NATs, configure `TURN_SERVER_URL`,
  `TURN_USERNAME`, and `TURN_PASSWORD` together. Use a TURN provider and
  short-lived credentials for production; STUN-only calls are not reliable on
  every network.

Never commit `.env`, MongoDB credentials, or signing/service-account files.

### Alternative: Render Node runtime

If you select the Node runtime instead of Docker, use:

- **Build command:** `npm ci && npm test`
- **Start command:** `npm start`

## Implemented API

- `POST /api/auth/register` — multipart form with `email`, `username`,
  `displayName`, `password`, and required `profileImage` (JPEG, PNG, or WebP,
  at most 5 MB); the backend stores the transformed image in Cloudinary
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout` (bearer access token required)
- `GET /api/users/me` (bearer access token required)
- `GET /api/users/search?q=<query>` (bearer access token required)
- `GET /api/conversations` (bearer access token required)
- `POST /api/conversations` (bearer access token required)
- `GET /api/conversations/:conversationId/messages` (bearer access token required)
- `POST /api/conversations/:conversationId/messages` (bearer access token required)
- `POST /api/users/me/push-token` and
  `DELETE /api/users/me/push-token` (bearer access token required)
- `GET /health`

Socket.IO clients authenticate with an access token in the connection `auth`
payload. The server emits `message:new` to both conversation participants when
a message is persisted. Realtime delivery requires an active connection;
conversation and message history remain available through the REST APIs.

Authenticated sockets also support `call:prepare`, `call:start`, `call:accept`,
`call:decline`, `call:end`, `call:ice`, and `call:resume`. The backend checks
conversation membership and routes call setup, ICE candidates, and TURN
configuration only to participants. WebRTC carries audio/video peer-to-peer
or through a configured TURN relay. FCM notifies recipients of new messages
and incoming calls; call resumption requires the app to reconnect while the
call is still ringing.

See [`API.md`](../docs/API.md) and [`SECURITY.md`](../docs/SECURITY.md).
The Android client is maintained in the separate `chatAppAndroid` repository.
