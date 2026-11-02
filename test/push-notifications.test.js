import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPushNotifier,
  validatePushToken
} from '../src/push-notifications.js';

test('push tokens are bounded strings and whitespace is normalized', () => {
  assert.equal(validatePushToken(`  ${'a'.repeat(32)}  `), 'a'.repeat(32));
  assert.equal(validatePushToken(null), null);
  assert.equal(validatePushToken('short'), null);
  assert.equal(validatePushToken('a'.repeat(4097)), null);
});

test('sends notifications to registered devices and removes expired tokens', async () => {
  const removed = [];
  let sent;
  const notifier = createPushNotifier({
    messaging: {
      async sendEachForMulticast(message) {
        sent = message;
        return {
          responses: [
            { success: true },
            { success: false, error: { code: 'messaging/registration-token-not-registered' } }
          ]
        };
      }
    },
    userModel: {
      findById() {
        return { select: async () => ({ fcmTokens: ['active-token-123456789', 'expired-token-123456789'] }) };
      },
      async updateOne(...args) {
        removed.push(args);
      }
    }
  });

  await notifier.sendToUser('recipient-id', {
    title: 'New message',
    body: 'Hello',
    data: { type: 'message', conversationId: 'conversation-id' }
  });
  assert.deepEqual(sent.tokens, ['active-token-123456789', 'expired-token-123456789']);
  assert.deepEqual(sent.notification, { title: 'New message', body: 'Hello' });
  assert.deepEqual(sent.android, {
    priority: 'high',
    notification: { channelId: 'chat_messages', sound: 'default' }
  });
  assert.deepEqual(removed, [[
    { _id: 'recipient-id' },
    { $pull: { fcmTokens: { $in: ['expired-token-123456789'] } } }
  ]]);
});

test('does not contact Firebase when push delivery is not configured', async () => {
  const notifier = createPushNotifier({ messaging: null });
  await notifier.sendToUser('recipient-id', { title: 'Call', body: 'Caller' });
});

test('includes HTTPS profile photos for Android rich push notifications', async () => {
  let sent;
  const notifier = createPushNotifier({
    messaging: {
      async sendEachForMulticast(message) {
        sent = message;
        return { responses: [{ success: true }] };
      }
    },
    userModel: {
      findById() {
        return { select: async () => ({ fcmTokens: ['active-token-123456789'] }) };
      }
    }
  });

  await notifier.sendToUser('recipient-id', {
    title: 'Message from Person',
    body: 'Hello',
    imageUrl: 'https://res.cloudinary.com/example/profile.jpg',
    data: { type: 'message', conversationId: 'conversation-id' }
  });

  assert.deepEqual(sent.notification, {
    title: 'Message from Person',
    body: 'Hello',
    imageUrl: 'https://res.cloudinary.com/example/profile.jpg'
  });
  assert.equal(sent.android.notification.imageUrl, 'https://res.cloudinary.com/example/profile.jpg');
  assert.equal(sent.data.imageUrl, 'https://res.cloudinary.com/example/profile.jpg');
});

test('does not forward non-HTTPS profile image URLs to push notifications', async () => {
  let sent;
  const notifier = createPushNotifier({
    messaging: {
      async sendEachForMulticast(message) {
        sent = message;
        return { responses: [{ success: true }] };
      }
    },
    userModel: {
      findById() {
        return { select: async () => ({ fcmTokens: ['active-token-123456789'] }) };
      }
    }
  });

  await notifier.sendToUser('recipient-id', {
    title: 'Message',
    body: 'Hello',
    imageUrl: 'http://example.test/profile.jpg'
  });
  assert.deepEqual(sent.notification, { title: 'Message', body: 'Hello' });
  assert.equal(sent.data.imageUrl, undefined);
});

test('sends high-priority data-only messages so Android can render image and call actions', async () => {
  let sent;
  const notifier = createPushNotifier({
    messaging: {
      async sendEachForMulticast(message) {
        sent = message;
        return { responses: [{ success: true }] };
      }
    },
    userModel: {
      findById() {
        return { select: async () => ({ fcmTokens: ['active-token-123456789'] }) };
      }
    }
  });

  await notifier.sendToUser('recipient-id', {
    title: 'Incoming audio call',
    body: 'Person',
    imageUrl: 'https://res.cloudinary.com/example/profile.jpg',
    dataOnly: true,
    channelId: 'incoming_calls',
    data: { type: 'call', callId: 'call-id', conversationId: 'conversation-id' }
  });

  assert.equal(sent.notification, undefined);
  assert.equal(sent.android.priority, 'high');
  assert.deepEqual(sent.data, {
    type: 'call',
    callId: 'call-id',
    conversationId: 'conversation-id',
    title: 'Incoming audio call',
    body: 'Person',
    imageUrl: 'https://res.cloudinary.com/example/profile.jpg'
  });
});
