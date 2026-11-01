import test from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../src/models/user.js';

test('stores normalized search fields for user profiles', async () => {
  const user = new User({
    email: 'person@example.com',
    username: 'Chat_User',
    displayName: '  Chat User  ',
    passwordHash: 'password-hash'
  });

  await user.validate();

  assert.equal(user.usernameSearch, 'chat_user');
  assert.equal(user.displayNameSearch, 'chat user');
});
