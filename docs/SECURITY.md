# Security status

## Implemented in the current foundation

- Passwords are hashed with bcrypt; the password field is excluded from
  ordinary user queries.
- Access JWTs use a pinned HS256 algorithm and have a configurable short TTL.
- Refresh tokens are high-entropy, stored only as SHA-256 hashes, rotated on
  use, and expired through a TTL index.
- Credentials and origins are loaded from environment variables. Startup
  rejects missing/short/equal JWT secrets, wildcard CORS, and example JWT keys.
- Helmet, explicit CORS origins, bounded JSON request bodies, authentication
  request rate limiting, schema constraints, and request validation are set up.
- Android refresh tokens are encrypted with an AES-GCM key held by Android
  Keystore; Android backup is disabled.
- Cleartext networking is enabled only in the Android debug manifest. Release
  API URLs must use HTTPS.

## Required before production

Configure production TLS, MongoDB authentication and network restrictions,
secret rotation and a secret manager, distributed rate limiting, audit
logging, monitoring, deployment health checks, and backup/recovery. Review
session revocation and account recovery policies before launch.

There is no OTP, email verification, password reset, device/session UI,
authorization model for conversations, upload scanning, E2EE, or call
signaling implemented yet. Do not send sensitive data in notifications or
claim E2EE until audited protocol and key-management flows are complete.
