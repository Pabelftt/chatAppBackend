import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseMessaging } from '../src/firebase-admin.js';

test('Firebase Admin is optional when no service account is configured', () => {
  assert.equal(createFirebaseMessaging(null), null);
});

test('Firebase Admin rejects malformed credentials explicitly', () => {
  assert.throws(
    () => createFirebaseMessaging('not-json'),
    /Firebase Admin service-account credential must contain valid JSON/
  );
  assert.throws(
    () => createFirebaseMessaging('{"type":"authorized_user"}'),
    /Firebase Admin credential must be a service account/
  );
});
