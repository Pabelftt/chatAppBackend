import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createAuthRouter } from './routes/auth.js';
import { verifyAccessToken } from './auth.js';
import { HttpError, errorHandler } from './errors.js';
import { User } from './models/user.js';

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

export function createApp(config) {
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
    createAuthRouter(config, authenticate)
  );

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/api/users/me', authenticate, async (request, response, next) => {
    try {
      const user = await User.findById(request.user.id).select('email username displayName');
      if (!user) {
        throw new HttpError(401, 'Account no longer exists');
      }
      response.json({
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName
      });
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
