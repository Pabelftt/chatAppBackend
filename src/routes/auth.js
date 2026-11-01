import { Router } from 'express';
import { login, register, rotateRefreshToken, revokeRefreshToken } from '../auth.js';

export function createAuthRouter(config, authenticate) {
  const router = Router();

  router.post('/register', async (request, response, next) => {
    try {
      response.status(201).json(await register(request.body, config));
    } catch (error) {
      next(error);
    }
  });

  router.post('/login', async (request, response, next) => {
    try {
      response.json(await login(request.body, config));
    } catch (error) {
      next(error);
    }
  });

  router.post('/refresh', async (request, response, next) => {
    try {
      response.json(await rotateRefreshToken(request.body?.refreshToken, config));
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', authenticate, async (request, response, next) => {
    try {
      await revokeRefreshToken(request.body?.refreshToken, request.user.id);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
