import 'dotenv/config';

function required(name, minimumLength = 1) {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimumLength) {
    throw new Error(`${name} must be configured with at least ${minimumLength} characters`);
  }
  return value;
}

export function loadConfig() {
  const port = Number(process.env.PORT ?? 3000);
  const refreshTokenDays = Number(process.env.REFRESH_TOKEN_DAYS ?? 30);
  const allowedOrigins = required('CORS_ORIGIN')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  if (!Number.isInteger(refreshTokenDays) || refreshTokenDays < 1) {
    throw new Error('REFRESH_TOKEN_DAYS must be a positive integer');
  }
  if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    throw new Error('CORS_ORIGIN must contain explicit allowed origins');
  }

  const accessSecret = required('JWT_ACCESS_SECRET', 32);
  const refreshSecret = required('JWT_REFRESH_SECRET', 32);
  if (accessSecret.startsWith('replace-with-') || refreshSecret.startsWith('replace-with-')) {
    throw new Error('Replace the example JWT secrets with randomly generated values');
  }
  if (accessSecret === refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port,
    mongoUri: required('MONGODB_URI'),
    accessSecret,
    refreshSecret,
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTokenDays,
    allowedOrigins
  };
}
