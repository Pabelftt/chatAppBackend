import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp, createSocketAuthenticator } from '../src/app.js';
import jwt from 'jsonwebtoken';

const config = {
  accessSecret: 'test-access-secret-that-is-long-enough-123456',
  refreshSecret: 'test-refresh-secret-that-is-long-enough-123456',
  accessTokenTtl: '15m',
  refreshTokenDays: 30,
  allowedOrigins: ['http://localhost:3000']
};

test('health endpoint and guarded profile route respond without database startup', async (context) => {
  const server = createServer(createApp(config));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())
  ));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const profile = await fetch(`${origin}/api/users/me`);
  assert.equal(profile.status, 401);
  assert.deepEqual(await profile.json(), { error: 'Authentication required' });

  for (const path of [
    '/api/users/search?q=person',
    '/api/conversations',
    '/api/conversations/507f1f77bcf86cd799439011/messages'
  ]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 401, `${path} must require authentication`);
  }

  const invalidRegistration = await fetch(`${origin}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: { $ne: null }, password: 'bad' })
  });
  assert.equal(invalidRegistration.status, 400);
});

test('socket authentication only accepts valid signed access tokens', () => {
  const authenticate = createSocketAuthenticator(config);
  const token = jwt.sign({ sub: 'user-id' }, config.accessSecret, { algorithm: 'HS256' });
  const socket = { handshake: { auth: { token } }, data: {} };

  authenticate(socket, (error) => assert.equal(error, undefined));
  assert.equal(socket.data.userId, 'user-id');

  authenticate({ handshake: { auth: {} }, data: {} }, (error) => {
    assert.match(error.message, /Authentication required/);
  });
});

test('push-token endpoints require authentication and validate the token', async (context) => {
  const saved = [];
  const removed = [];
  const server = createServer(createApp(config, {
    async savePushToken(userId, token) {
      saved.push({ userId, token });
      return true;
    },
    async deletePushToken(userId, token) {
      removed.push({ userId, token });
      return true;
    }
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())
  ));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const authorization = `Bearer ${jwt.sign(
    { sub: 'user-id' },
    config.accessSecret,
    { algorithm: 'HS256' }
  )}`;

  const unauthorized = await fetch(`${origin}/api/users/me/push-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'valid-token-12345678901234567890' })
  });
  assert.equal(unauthorized.status, 401);

  const invalid = await fetch(`${origin}/api/users/me/push-token`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'short' })
  });
  assert.equal(invalid.status, 400);

  const token = 'valid-token-12345678901234567890';
  const registered = await fetch(`${origin}/api/users/me/push-token`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ token })
  });
  assert.equal(registered.status, 204);
  assert.deepEqual(saved, [{ userId: 'user-id', token }]);

  const unregistered = await fetch(`${origin}/api/users/me/push-token`, {
    method: 'DELETE',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ token })
  });
  assert.equal(unregistered.status, 204);
  assert.deepEqual(removed, [{ userId: 'user-id', token }]);
});
