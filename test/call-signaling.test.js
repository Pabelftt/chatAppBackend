import test from 'node:test';
import assert from 'node:assert/strict';
import { attachCallSignaling } from '../src/call-signaling.js';

function createHarness(registry = new Map()) {
  const emitted = [];
  const socketEvents = [];
  const notifiedCalls = [];
  const callAttempts = new Map();
  const io = {
    to(room) {
      return {
        emit(event, payload) {
          emitted.push({ room, event, payload });
        }
      };
    }
  };
  return {
    emitted,
    socketEvents,
    notifiedCalls,
    registry,
    attach(userId) {
      const handlers = new Map();
      attachCallSignaling(io, {
        data: { userId },
        on(event, handler) {
          handlers.set(event, handler);
        },
        emit(event, payload) {
          socketEvents.push({ event, payload });
        }
      }, {
        getConversation: async (id, conversationId) => {
          if (conversationId !== 'conversation-1' || !['caller', 'recipient'].includes(id)) {
            const error = new Error('Conversation not found');
            error.status = 404;
            throw error;
          }
          return {
            id: 'conversation-1',
            participants: [{ id: 'caller' }, { id: 'recipient' }]
          };
        },
        getPublicUser: async (id) => ({ id, displayName: 'Caller', username: 'caller' }),
        iceServers: [{ urls: 'stun:example.org' }],
        callRegistry: registry,
        callAttempts,
        notifyCall: async (notification) => notifiedCalls.push(notification)
      });
      return handlers;
    }
  };
}

const offer = { type: 'offer', sdp: 'v=0\r\n' };
const answer = { type: 'answer', sdp: 'v=0\r\n' };

test('routes an authenticated offer and answer to the other participant', async () => {
  const registry = new Map();
  const harness = createHarness(registry);
  const caller = harness.attach('caller');
  const recipient = harness.attach('recipient');
  let prepareResult;
  await caller.get('call:prepare')(
    { conversationId: 'conversation-1' },
    (result) => { prepareResult = result; }
  );
  assert.deepEqual(prepareResult, {
    ok: true,
    iceServers: [{ urls: 'stun:example.org' }]
  });
  let startResult;

  await caller.get('call:start')(
    { conversationId: 'conversation-1', mediaType: 'video', offer },
    (result) => { startResult = result; }
  );

  assert.equal(startResult.ok, true);
  const incoming = harness.emitted.find(({ event }) => event === 'call:incoming');
  assert.equal(incoming.room, 'user:recipient');
  assert.equal(incoming.payload.offer, offer);
  assert.equal(incoming.payload.iceServers.length, 1);
  assert.deepEqual(harness.notifiedCalls, [{
    recipientId: 'recipient',
    caller: { id: 'caller', displayName: 'Caller', username: 'caller' },
    conversationId: 'conversation-1',
    callId: startResult.callId,
    mediaType: 'video'
  }]);
  await recipient.get('call:resume')({}, (response) => {
    assert.deepEqual(response, { ok: true, resumed: 1 });
  });
  assert.deepEqual(harness.socketEvents, [{
    event: 'call:incoming',
    payload: incoming.payload
  }]);
  let duplicateResult;
  await caller.get('call:start')(
    { conversationId: 'conversation-1', mediaType: 'audio', offer },
    (result) => { duplicateResult = result; }
  );
  assert.deepEqual(duplicateResult, {
    ok: false,
    error: 'One participant already has an active call'
  });
  const callId = startResult.callId;
  let acceptResult;
  await recipient.get('call:accept')(
    { callId, answer },
    (result) => { acceptResult = result; }
  );
  assert.deepEqual(acceptResult, { ok: true });
  assert.deepEqual(harness.emitted.at(-1), {
    room: 'user:caller',
    event: 'call:accepted',
    payload: { callId, answer }
  });
  let iceResult;
  await caller.get('call:ice')(
    { callId, candidate: { candidate: 'candidate:1 1 UDP 1 10.0.0.1 5000 typ host' } },
    (result) => { iceResult = result; }
  );
  assert.deepEqual(iceResult, { ok: true });
  assert.equal(harness.emitted.at(-1).room, 'user:recipient');
  assert.equal(harness.emitted.at(-1).event, 'call:ice');
  let endResult;
  await recipient.get('call:end')({ callId }, (result) => { endResult = result; });
  assert.deepEqual(endResult, { ok: true });
  assert.equal(harness.emitted.at(-1).event, 'call:ended');
  assert.equal(registry.size, 0);
});

test('rejects invalid offers and does not create calls', async () => {
  const harness = createHarness();
  const caller = harness.attach('caller');
  let result;
  await caller.get('call:start')(
    { conversationId: 'conversation-1', mediaType: 'video', offer: { type: 'offer', sdp: '' } },
    (response) => { result = response; }
  );
  assert.deepEqual(result, { ok: false, error: 'Invalid call offer' });
  assert.equal(harness.registry.size, 0);
});

test('does not send an offer for a conversation the socket user cannot access', async () => {
  const harness = createHarness();
  const attacker = harness.attach('attacker');
  let result;
  let prepareResult;
  await attacker.get('call:prepare')(
    { conversationId: 'conversation-1' },
    (response) => { prepareResult = response; }
  );
  assert.deepEqual(prepareResult, { ok: false, error: 'Conversation not found' });
  await attacker.get('call:start')(
    { conversationId: 'conversation-1', mediaType: 'audio', offer },
    (response) => { result = response; }
  );
  assert.deepEqual(result, { ok: false, error: 'Conversation not found' });
  assert.deepEqual(harness.emitted, []);
});
