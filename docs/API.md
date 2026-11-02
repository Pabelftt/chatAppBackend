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
- `typing:start` / `typing:stop` — `{ "conversationId": "..." }`; membership
  is checked and the other participant receives `typing:started` /
  `typing:stopped`. Typing automatically expires after five seconds.
- `POST /api/users/me/push-token` and `DELETE /api/users/me/push-token` —
  register or remove the authenticated device's Firebase Cloud Messaging token.
  The server sends message and incoming-call notifications to registered devices.

Set `FIREBASE_SERVICE_ACCOUNT_JSON` in the backend environment to the JSON
contents of a Firebase Admin service-account credential, or use
`FIREBASE_SERVICE_ACCOUNT_PATH` for a local file. Do not commit this credential.
Push delivery is disabled until one of these values is configured.

The socket event is limited to 30 sends per 10 seconds per connection. REST
message sends also fan out as `message:new`.

Supply `Authorization: Bearer <accessToken>` for protected routes. The API
validates inputs and does not accept client-supplied MongoDB query objects.

## Audio/video call signaling

Authenticated sockets first request ICE configuration with `call:prepare` and
`{ "conversationId": "..." }`. Conversation membership is checked before the
server returns STUN/TURN settings. Start a call with `call:start` and
`{ "conversationId": "...", "mediaType": "audio|video", "offer": { "type":
"offer", "sdp": "..." } }`. The other participant receives `call:incoming`
with the offer and ICE servers.

The recipient responds with `call:accept` and
`{ "callId": "...", "answer": { "type": "answer", "sdp": "..." } }`.
`call:ice` exchanges bounded ICE candidates; `call:decline` and `call:end`
terminate the call. `call:resume` replays a still-ringing incoming call after
the recipient reconnects from its notification. Call signaling and participant
authorization are handled by the backend; WebRTC transports audio/video
between the two devices, directly or through TURN.

Configure `TURN_SERVER_URL`, `TURN_USERNAME`, and `TURN_PASSWORD` together for
networks that require TURN relaying. Use short-lived credentials for
production. Message and incoming-call notifications require an FCM token from
the Android client and Firebase Admin credentials on the backend.

## Not implemented yet

Location, groups, attachments,
offline Android sending, delivery/read receipts, and E2EE are future phases,
not available features.
