import { User } from './models/user.js';

const MAX_TOKENS_PER_USER = 10;

export function validatePushToken(rawToken) {
  if (typeof rawToken !== 'string') return null;
  const token = rawToken.trim();
  return token.length >= 20 && token.length <= 4096 ? token : null;
}

export async function registerPushToken(userId, token) {
  await User.updateMany(
    { _id: { $ne: userId }, fcmTokens: token },
    { $pull: { fcmTokens: token } }
  );
  const result = await User.updateOne({ _id: userId }, [{
    $set: {
      fcmTokens: {
        $slice: [
          {
            $concatArrays: [
              {
                $filter: {
                  input: { $ifNull: ['$fcmTokens', []] },
                  as: 'existing',
                  cond: { $ne: ['$$existing', { $literal: token }] }
                }
              },
              [{ $literal: token }]
            ]
          },
          -MAX_TOKENS_PER_USER
        ]
      }
    }
  }]);
  return result.matchedCount > 0;
}

export async function unregisterPushToken(userId, token) {
  const result = await User.updateOne(
    { _id: userId },
    { $pull: { fcmTokens: token } }
  );
  return result.matchedCount > 0;
}

export function createPushNotifier({ messaging, userModel = User }) {
  return {
    async sendToUser(userId, {
      title,
      body,
      data = {},
      imageUrl,
      dataOnly = false,
      channelId = 'chat_messages'
    }) {
      if (!messaging) return;
      const user = await userModel.findById(userId).select('+fcmTokens');
      const tokens = user?.fcmTokens ?? [];
      if (tokens.length === 0) return;

      for (let offset = 0; offset < tokens.length; offset += 500) {
        const batch = tokens.slice(offset, offset + 500);
        const notificationData = { ...data };
        if (dataOnly) {
          notificationData.title = title;
          notificationData.body = body;
        }
        const notification = { title, body };
        const androidNotification = { channelId, sound: 'default' };
        if (typeof imageUrl === 'string' && imageUrl.startsWith('https://')) {
          notification.imageUrl = imageUrl;
          androidNotification.imageUrl = imageUrl;
          notificationData.imageUrl = imageUrl;
        }
        const message = {
          tokens: batch,
          android: {
            priority: 'high'
          },
          data: notificationData
        };
        if (!dataOnly) {
          message.notification = notification;
          message.android.notification = androidNotification;
        }
        const result = await messaging.sendEachForMulticast(message);
        const invalidTokens = result.responses.flatMap((response, index) =>
          response.error?.code === 'messaging/registration-token-not-registered'
            ? [batch[index]]
            : []
        );
        if (invalidTokens.length > 0) {
          await userModel.updateOne(
            { _id: userId },
            { $pull: { fcmTokens: { $in: invalidTokens } } }
          );
        }
      }
    }
  };
}
