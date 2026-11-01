import test from 'node:test';
import assert from 'node:assert/strict';
import { isObjectId, validateMessageContent, validateSearchQuery } from '../src/chat-validation.js';

test('requires a valid MongoDB object ID for direct chat participants', () => {
  assert.equal(isObjectId('507f1f77bcf86cd799439011'), true);
  assert.equal(isObjectId('not-an-id'), false);
  assert.equal(isObjectId({ $ne: null }), false);
});

test('bounds and escapes user search input', () => {
  assert.equal(validateSearchQuery('ab'), 'ab');
  assert.equal(validateSearchQuery('a.'), 'a\\.');
  assert.equal(validateSearchQuery('a'), null);
  assert.equal(validateSearchQuery('x'.repeat(51)), null);
});

test('rejects empty or oversized messages and trims accepted content', () => {
  assert.equal(validateMessageContent('  hello  '), 'hello');
  assert.equal(validateMessageContent('  '), null);
  assert.equal(validateMessageContent('x'.repeat(4001)), null);
  assert.equal(validateMessageContent({ $ne: null }), null);
});
