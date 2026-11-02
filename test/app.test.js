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

test('registration uploads the required profile image and returns its stored profile', async (context) => {
  const uploaded = [];
  const server = createServer(createApp(config, {
    profileImageService: {
      async upload(buffer) {
        uploaded.push(buffer.toString());
        return {
          secureUrl: 'https://res.cloudinary.com/example/image/upload/profile.jpg',
          publicId: 'chatapp/profile-images/profile'
        };
      },
      async destroy() {
        assert.fail('A successful registration must retain the uploaded image');
      }
    },
    async registerAccount(body, _config, profileImageUrl) {
      assert.equal(body.email, 'person@example.com');
      assert.equal(profileImageUrl, 'https://res.cloudinary.com/example/image/upload/profile.jpg');
      return {
        user: { id: 'user-id', profileImageUrl },
        accessToken: 'access-token',
        refreshToken: 'refresh-token'
      };
    }
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())
  ));
  const form = new FormData();
  form.set('email', 'person@example.com');
  form.set('username', 'person_1');
  form.set('displayName', 'Person');
  form.set('password', 'long-password-123');
  form.set('profileImage', new Blob(['photo bytes'], { type: 'image/jpeg' }), 'photo.jpg');

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/auth/register`,
    { method: 'POST', body: form }
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    user: {
      id: 'user-id',
      profileImageUrl: 'https://res.cloudinary.com/example/image/upload/profile.jpg'
    },
    accessToken: 'access-token',
    refreshToken: 'refresh-token'
  });
  assert.deepEqual(uploaded, ['photo bytes']);
});

test('registration rejects unsupported images and reports missing Cloudinary configuration', async (context) => {
  const server = createServer(createApp(config));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())
  ));
  const origin = `http://127.0.0.1:${server.address().port}/api/auth/register`;
  const createForm = (mimeType) => {
    const form = new FormData();
    form.set('email', 'person@example.com');
    form.set('username', 'person_1');
    form.set('displayName', 'Person');
    form.set('password', 'long-password-123');
    form.set('profileImage', new Blob(['photo bytes'], { type: mimeType }), 'photo');
    return form;
  };

  const unsupported = await fetch(origin, {
    method: 'POST',
    body: createForm('application/pdf')
  });
  assert.equal(unsupported.status, 400);
  assert.deepEqual(await unsupported.json(), {
    error: 'Profile image must be JPEG, PNG, or WebP'
  });

  const unconfigured = await fetch(origin, {
    method: 'POST',
    body: createForm('image/jpeg')
  });
  assert.equal(unconfigured.status, 503);
  assert.deepEqual(await unconfigured.json(), {
    error: 'Profile image upload is not configured'
  });
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
