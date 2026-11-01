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
- `GET /api/users/search?q=<name-or-username>` — search up to 20 public
  profiles; query must contain 2–50 characters.

## Direct conversations and messages

- `GET /api/conversations` — list the signed-in user's recent direct
  conversations.
- `POST /api/conversations` — create or return a direct conversation with
  `{ "participantId": "<user ID>" }`.
- `GET /api/conversations/:conversationId/messages?limit=50` — retrieve the
  latest 1–100 messages in a conversation the caller belongs to.
- `POST /api/conversations/:conversationId/messages` — persist and deliver
  `{ "content": "..." }`; message text must contain 1–4000 characters.

All conversation and message routes check membership on the server. Direct
conversations are unique per user pair.

## Real-time messages

Connect Socket.IO with the access token in the handshake auth object:
`{ "token": "<accessToken>" }`.

- `conversation:join` — `{ "conversationId": "..." }`; membership is checked
  before joining the room.
- `message:send` — `{ "conversationId": "...", "content": "..." }`; persisted
  messages are acknowledged and delivered to every participant's connected
  devices as `message:new`.
- `message:new` — server event containing the persisted message and public
  sender profile.

The socket event is limited to 30 sends per 10 seconds per connection. REST
message sends also fan out as `message:new`.

Supply `Authorization: Bearer <accessToken>` for protected routes. The API
validates inputs and does not accept client-supplied MongoDB query objects.

## Not implemented yet

Devices/FCM, calls, location, groups, attachments, offline Android storage,
delivery/read receipts, and E2EE are future phases, not available features.
