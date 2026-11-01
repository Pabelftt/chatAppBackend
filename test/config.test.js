import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('requires explicit origins and sufficiently long independent secrets', () => {
  const names = [
    'NODE_ENV',
    'PORT',
    'MONGODB_URI',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'ACCESS_TOKEN_TTL',
    'REFRESH_TOKEN_DAYS',
    'CORS_ORIGIN',
    'TURN_SERVER_URL',
    'TURN_USERNAME',
    'TURN_PASSWORD'
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));

  try {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1/chatapp';
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    delete process.env.PORT;
    delete process.env.REFRESH_TOKEN_DAYS;

    assert.equal(loadConfig().port, 3000);
    process.env.TURN_SERVER_URL = 'turns:turn.example.com:5349';
    process.env.TURN_USERNAME = 'chatapp';
    process.env.TURN_PASSWORD = 'temporary-password';
    assert.equal(loadConfig().turnServerUrl, 'turns:turn.example.com:5349');
    delete process.env.TURN_PASSWORD;
    assert.throws(() => loadConfig(), /Configure TURN_SERVER_URL/);
    delete process.env.TURN_SERVER_URL;
    delete process.env.TURN_USERNAME;
    process.env.CORS_ORIGIN = '*';
    assert.throws(() => loadConfig(), /explicit allowed origins/);
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    process.env.JWT_REFRESH_SECRET = 'short';
    assert.throws(() => loadConfig(), /JWT_REFRESH_SECRET/);
    process.env.JWT_REFRESH_SECRET = process.env.JWT_ACCESS_SECRET;
    assert.throws(() => loadConfig(), /must be different/);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
});
