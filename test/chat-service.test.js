import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { conversationParticipantId } from '../src/chat-service.js';

test('conversation participant IDs work for populated users and ObjectIds', () => {
  const objectId = new mongoose.Types.ObjectId();
  assert.equal(conversationParticipantId({ _id: objectId }), objectId.toString());
  assert.equal(conversationParticipantId({ id: objectId.toString() }), objectId.toString());
  assert.equal(conversationParticipantId(objectId), objectId.toString());
});
