import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createAuthRouter } from './routes/auth.js';
import { register, verifyAccessToken } from './auth.js';
import { HttpError, errorHandler } from './errors.js';
import { User } from './models/user.js';
import { createCloudinaryProfileImageService } from './cloudinary-profile-images.js';
import { createProfileImageUpload } from './profile-image-upload.js';
import {
  registerPushToken,
  unregisterPushToken,
  validatePushToken
} from './push-notifications.js';
import {
  createDirectConversation,
  createMessage,
  conversationParticipantId,
  getConversationForParticipant,
  listConversations,
  listMessages,
  searchUsers
} from './chat-service.js';

function createAuthenticator(config) {
  return (request, _response, next) => {
    const header = request.get('authorization');
    const match = header?.match(/^Bearer ([^\s]+)$/);
    if (!match) {
      return next(new HttpError(401, 'Authentication required'));
    }

    try {
      const payload = verifyAccessToken(match[1], config);
      request.user = { id: payload.sub };
      return next();
    } catch {
      return next(new HttpError(401, 'Invalid or expired access token'));
    }
  };
}

export function createApp(config, {
  emitMessage,
  notifyMessage,
  savePushToken = registerPushToken,
  deletePushToken = unregisterPushToken,
  profileImageService = createCloudinaryProfileImageService(config.cloudinaryUrl),
  registerAccount = register,
  userModel = User
} = {}) {
  const app = express();
  const authenticate = createAuthenticator(config);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Origin is not allowed by CORS'));
      }
    })
  );
  app.use(express.json({ limit: '16kb' }));
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false
    }),
    createAuthRouter(config, authenticate, { profileImageService, registerAccount })
  );

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/api/users/me', authenticate, async (request, response, next) => {
    try {
      const user = await userModel.findById(request.user.id)
        .select('email username displayName profileImageUrl');
      if (!user) {
        throw new HttpError(401, 'Account no longer exists');
      }
      response.json({
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        profileImageUrl: user.profileImageUrl ?? null
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch(
    '/api/users/me/profile-image',
    authenticate,
    createProfileImageUpload(),
    async (request, response, next) => {
      if (!request.file) {
        next(new HttpError(400, 'A profile image is required'));
        return;
      }

      let uploadedImage;
      try {
        uploadedImage = await profileImageService.upload(request.file.buffer);
      } catch (error) {
        next(error);
        return;
      }

      try {
        const user = await userModel.findById(request.user.id).select('+profileImagePublicId');
        if (!user) {
          throw new HttpError(401, 'Account no longer exists');
        }
        const previousPublicId = user.profileImagePublicId;
        user.profileImageUrl = uploadedImage.secureUrl;
        user.profileImagePublicId = uploadedImage.publicId;
        await user.save();

        if (previousPublicId && previousPublicId !== uploadedImage.publicId) {
          try {
            await profileImageService.destroy(previousPublicId);
          } catch {
            console.warn('Unable to remove previous Cloudinary profile image');
          }
        }

        response.json({ profileImageUrl: user.profileImageUrl });
      } catch (error) {
        try {
          await profileImageService.destroy(uploadedImage.publicId);
        } catch {
          console.error('Unable to remove unused Cloudinary profile image');
        }
        next(error);
      }
    }
  );

  app.post('/api/users/me/push-token', authenticate, async (request, response, next) => {
    try {
      const token = validatePushToken(request.body?.token);
      if (!token) {
        throw new HttpError(400, 'A valid push token is required');
      }
      const registered = await savePushToken(request.user.id, token);
      if (!registered) {
        throw new HttpError(401, 'Account no longer exists');
      }
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/users/me/push-token', authenticate, async (request, response, next) => {
    try {
      const token = validatePushToken(request.body?.token);
      if (!token) {
        throw new HttpError(400, 'A valid push token is required');
      }
      const registered = await deletePushToken(request.user.id, token);
      if (!registered) {
        throw new HttpError(401, 'Account no longer exists');
      }
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/users/search', authenticate, async (request, response, next) => {
    try {
      response.json(await searchUsers(request.user.id, request.query.q));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/conversations', authenticate, async (request, response, next) => {
    try {
      response.json(await listConversations(request.user.id));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/conversations', authenticate, async (request, response, next) => {
    try {
      const conversation = await createDirectConversation(
        request.user.id,
        request.body?.participantId
      );
      response.status(201).json(conversation);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/conversations/:conversationId/messages', authenticate, async (request, response, next) => {
    try {
      response.json(await listMessages(
        request.user.id,
        request.params.conversationId,
        request.query.limit
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/conversations/:conversationId/messages', authenticate, async (request, response, next) => {
    try {
      const message = await createMessage(
        request.user.id,
        request.params.conversationId,
        request.body?.content
      );
      const conversation = await getConversationForParticipant(request.user.id, message.conversationId);
      void notifyMessage?.(
        message,
        conversation.participants.map(conversationParticipantId)
      )
        ?.catch((error) => console.error('Unable to send message push notification', error));
      emitMessage?.(
        message.conversationId,
        message,
        conversation.participants.map(conversationParticipantId)
      );
      response.status(201).json(message);
    } catch (error) {
      next(error);
    }
  });

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);

  return app;
}

export function createSocketAuthenticator(config) {
  return (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length > 4096) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = verifyAccessToken(token, config);
      socket.data.userId = payload.sub;
      return next();
    } catch {
      return next(new Error('Invalid or expired access token'));
    }
  };
}
