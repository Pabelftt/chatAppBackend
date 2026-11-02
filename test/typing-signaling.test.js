import test from 'node:test';
import assert from 'node:assert/strict';
import { attachTypingSignaling } from '../src/typing-signaling.js';

function createHarness() {
  const emitted = [];
  const handlers = new Map();
  const io = {
    to(room) {
      return {
        emit(event, payload) {
          emitted.push({ room, event, payload });
        }
      };
    }
  };
  attachTypingSignaling(io, {
    data: { userId: 'caller' },
    on(event, handler) {
      handlers.set(event, handler);
    }
  }, async (userId, conversationId) => {
    if (conversationId !== 'conversation-1' || userId !== 'caller') {
      const error = new Error('Conversation not found');
      error.status = 404;
      throw error;
    }
    return { participants: [{ id: 'caller' }, { id: 'recipient' }] };
  });
  return { emitted, handlers };
}

test('typing events are authorized and sent only to the other participant', async () => {
  const { emitted, handlers } = createHarness();
  let startResult;
  await handlers.get('typing:start')(
    { conversationId: 'conversation-1' },
    (result) => { startResult = result; }
  );
  assert.deepEqual(startResult, { ok: true });
  assert.deepEqual(emitted[0], {
    room: 'user:recipient',
    event: 'typing:started',
    payload: { conversationId: 'conversation-1', userId: 'caller' }
  });

  let stopResult;
  await handlers.get('typing:stop')(
    { conversationId: 'conversation-1' },
    (result) => { stopResult = result; }
  );
  assert.deepEqual(stopResult, { ok: true });
  assert.equal(emitted[1].event, 'typing:stopped');
});

test('typing events reject users who are not conversation participants', async () => {
  const { emitted, handlers } = createHarness();
  let result;
  await handlers.get('typing:start')(
    { conversationId: 'other-conversation' },
    (response) => { result = response; }
  );
  assert.deepEqual(result, { ok: false, error: 'Conversation not found' });
  assert.deepEqual(emitted, []);
});
