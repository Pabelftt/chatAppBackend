import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { HttpError } from './errors.js';
import { normalizeEmail, validateLogin, validateRegistration } from './auth-validation.js';
import { RefreshToken } from './models/refresh-token.js';
import { User } from './models/user.js';

const BCRYPT_ROUNDS = 12;

export function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createAccessToken(user, config) {
  return jwt.sign({ sub: user.id }, config.accessSecret, {
    algorithm: 'HS256',
    expiresIn: config.accessTokenTtl
  });
}

async function createRefreshToken(user, config) {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000);
  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashRefreshToken(token),
    expiresAt
  });
  return token;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName
  };
}

function issueAccessToken(user, config) {
  return createAccessToken(user, config);
}

export async function register(body, config) {
  const errors = validateRegistration(body);
  if (errors.length > 0) {
    throw new HttpError(400, errors.join('; '));
  }

  const user = await User.create({
    email: normalizeEmail(body.email),
    username: body.username,
    displayName: body.displayName.trim(),
    passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS)
  });
  const [accessToken, refreshToken] = await Promise.all([
    Promise.resolve(issueAccessToken(user, config)),
    createRefreshToken(user, config)
  ]);
  return { user: publicUser(user), accessToken, refreshToken };
}

export async function login(body, config) {
  const errors = validateLogin(body);
  if (errors.length > 0) {
    throw new HttpError(400, errors.join('; '));
  }

  const user = await User.findOne({ email: normalizeEmail(body.email) }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const [accessToken, refreshToken] = await Promise.all([
    Promise.resolve(issueAccessToken(user, config)),
    createRefreshToken(user, config)
  ]);
  return { user: publicUser(user), accessToken, refreshToken };
}

export async function rotateRefreshToken(token, config) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) {
    throw new HttpError(401, 'Invalid refresh token');
  }

  const stored = await RefreshToken.findOneAndDelete({
    tokenHash: hashRefreshToken(token),
    expiresAt: { $gt: new Date() }
  });
  if (!stored) {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }

  const user = await User.findById(stored.userId);
  if (!user) {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }

  const [accessToken, refreshToken] = await Promise.all([
    Promise.resolve(issueAccessToken(user, config)),
    createRefreshToken(user, config)
  ]);
  return { user: publicUser(user), accessToken, refreshToken };
}

export async function revokeRefreshToken(token, userId) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) {
    throw new HttpError(400, 'A valid refresh token is required');
  }
  await RefreshToken.deleteOne({ tokenHash: hashRefreshToken(token), userId });
}

export function verifyAccessToken(token, config) {
  return jwt.verify(token, config.accessSecret, { algorithms: ['HS256'] });
}
