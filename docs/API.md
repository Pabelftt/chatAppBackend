# Backend API (implemented subset)

Base URL: `http://localhost:3000` for local development. Production
deployments must use HTTPS.

## Authentication

- `POST /api/auth/register` — create an account with `email`, `username`,
  `displayName`, and a 12–128 character `password`.
- `POST /api/auth/login` — authenticate with `email` and `password`.
- `POST /api/auth/refresh` — rotate a single-use `refreshToken`.
- `POST /api/auth/logout` — authenticate with a bearer access token and submit
  the current `refreshToken` to revoke that device session.

Register, login, and refresh return `{ user, accessToken, refreshToken }`.
Access tokens are signed using HS256 and configured with a short expiry.
Refresh tokens are random, single-use, rotated on refresh, and stored as
SHA-256 hashes with a MongoDB TTL index.

## Profile

- `GET /api/users/me` — return the authenticated account's public profile.

Supply `Authorization: Bearer <accessToken>` for protected routes. The API
validates inputs and does not accept client-supplied MongoDB query objects.

## Not implemented yet

Conversation/message APIs and socket message events, devices/FCM, calls,
location, groups, attachments, and E2EE are future phases, not available API
routes.
