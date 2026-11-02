import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { createApp, createSocketAuthenticator } from './app.js';
import { attachCallSignaling } from './call-signaling.js';
import { attachTypingSignaling } from './typing-signaling.js';
import { createFirebaseMessaging } from './firebase-admin.js';
import { createPushNotifier } from './push-notifications.js';
import {
  conversationParticipantId,
  getConversationForParticipant,
  createMessage
} from './chat-service.js';
import { loadConfig } from './config.js';
import { HttpError } from './errors.js';
import { User } from './models/user.js';

const config = loadConfig();
const firebaseMessaging = createFirebaseMessaging(
  config.firebaseServiceAccountJson,
  config.firebaseServiceAccountPath
);
const pushNotifier = createPushNotifier({ messaging: firebaseMessaging });
if (!firebaseMessaging) {
  console.warn('Firebase push notifications are disabled; configure FIREBASE_SERVICE_ACCOUNT_JSON');
}
if (!config.cloudinaryUrl) {
  console.warn('Profile photo uploads are disabled; configure CLOUDINARY_URL');
}
await mongoose.connect(config.mongoUri);
await User.updateMany(
  {
    $or: [
      { usernameSearch: { $exists: false } },
      { displayNameSearch: { $exists: false } }
    ]
  },
  [{
    $set: {
      usernameSearch: { $toLower: '$username' },
      displayNameSearch: { $toLower: { $trim: { input: '$displayName' } } }
    }
  }]
);

let io;
const httpServer = createServer(createApp(config, {
  emitMessage(_conversationId, message, participantIds) {
    for (const participantId of participantIds) {
      io?.to(`user:${participantId}`).emit('message:new', message);
    }
  },
  async notifyMessage(message, participantIds) {
    const recipientIds = participantIds.filter((participantId) =>
      participantId !== message.sender.id
    );
    await Promise.all(recipientIds.map((recipientId) => pushNotifier.sendToUser(recipientId, {
      title: `Message from ${message.sender.displayName}`,
      body: message.content.slice(0, 160),
      imageUrl: message.sender.profileImageUrl,
      channelId: 'chat_messages',
      data: {
        type: 'message',
        conversationId: message.conversationId
      }
    })));
  }
}));
io = new Server(httpServer, {
  cors: {
    origin: config.allowedOrigins
  }
});

io.use(createSocketAuthenticator(config));
const activeCalls = new Map();
const callAttempts = new Map();
io.on('connection', (socket) => {
  socket.join(`user:${socket.data.userId}`);
  attachTypingSignaling(io, socket, getConversationForParticipant);
  attachCallSignaling(io, socket, {
    getConversation: getConversationForParticipant,
    getPublicUser: async (id) => {
      const user = await User.findById(id).select('username displayName profileImageUrl');
      if (!user) throw new HttpError(404, 'User not found');
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        profileImageUrl: user.profileImageUrl ?? null
      };
    },
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      ...(config.turnServerUrl
        ? [{
            urls: config.turnServerUrl,
            username: config.turnUsername,
            credential: config.turnPassword
          }]
        : [])
    ],
    callRegistry: activeCalls,
    callAttempts,
    notifyCall: ({ recipientId, caller, conversationId, callId, mediaType }) =>
      pushNotifier.sendToUser(recipientId, {
        title: `Incoming ${mediaType} call`,
        body: caller.displayName,
        imageUrl: caller.profileImageUrl,
        channelId: 'incoming_calls',
        data: {
          type: 'call',
          conversationId,
          callId
        }
      })
  });
  const recentMessages = [];

  socket.on('conversation:join', async (payload, acknowledge = () => {}) => {
    try {
      const conversation = await getConversationForParticipant(
        socket.data.userId,
        payload?.conversationId
      );
      socket.join(`conversation:${conversation.id}`);
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({ ok: false, error: error.message });
    }
  });

  socket.on('message:send', async (payload, acknowledge = () => {}) => {
    const now = Date.now();
    while (recentMessages.length > 0 && now - recentMessages[0] > 10_000) {
      recentMessages.shift();
    }
    if (recentMessages.length >= 30) {
      acknowledge({ ok: false, error: 'Message rate limit exceeded' });
      return;
    }
    recentMessages.push(now);

    try {
      const message = await createMessage(
        socket.data.userId,
        payload?.conversationId,
        payload?.content
      );
      const conversation = await getConversationForParticipant(
        socket.data.userId,
        message.conversationId
      );
      for (const participant of conversation.participants) {
        io.to(`user:${conversationParticipantId(participant)}`).emit('message:new', message);
      }
      const recipientIds = conversation.participants
        .map(conversationParticipantId)
        .filter((participantId) => participantId !== message.sender.id);
      void Promise.all(recipientIds.map((recipientId) => pushNotifier.sendToUser(recipientId, {
        title: `Message from ${message.sender.displayName}`,
        body: message.content.slice(0, 160),
        channelId: 'chat_messages',
        data: {
          type: 'message',
          conversationId: message.conversationId
        }
      }))).catch((error) => console.error('Unable to send message push notification', error));
      acknowledge({ ok: true, message });
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof HttpError ? error.message : 'Unable to send message'
      });
    }
  });
});

httpServer.listen(config.port, () => {
  console.log(`ChatApp API listening on port ${config.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  await new Promise((resolve) => io.close(resolve));
  await mongoose.disconnect();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
