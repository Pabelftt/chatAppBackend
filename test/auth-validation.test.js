import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, validateLogin, validateRegistration } from '../src/auth-validation.js';

test('normalizes email addresses before use', () => {
  assert.equal(normalizeEmail('  Person@Example.com '), 'person@example.com');
});

test('accepts a valid registration and rejects weak or malformed fields', () => {
  assert.deepEqual(
    validateRegistration({
      email: 'person@example.com',
      username: 'person_1',
      displayName: 'Person',
      password: 'a-long-password-123'
    }),
    []
  );

  assert.equal(
    validateRegistration({
      email: 'not-an-email',
      username: 'x',
      displayName: '',
      password: 'short'
    }).length,
    4
  );
  assert.deepEqual(
    validateRegistration({
      email: 'person@example.com',
      username: 'person_1',
      displayName: 'Person',
      password: '12345678'
    }),
    []
  );
  assert.ok(
    validateRegistration({
      email: 'person@example.com',
      username: 'person_1',
      displayName: 'Person',
      password: '1234567'
    }).includes('Password must be between 8 and 128 characters')
  );
});

test('rejects malformed login input without accepting object-shaped values', () => {
  assert.deepEqual(validateLogin({ email: 'person@example.com', password: 'secret' }), []);
  assert.equal(validateLogin({ email: { $ne: null }, password: 'secret' }).length, 1);
});
