import { Router } from 'express';
import multer from 'multer';
import { login, register, rotateRefreshToken, revokeRefreshToken } from '../auth.js';
import { HttpError } from '../errors.js';
import { validateRegistration } from '../auth-validation.js';

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function createAuthRouter(config, authenticate, {
  profileImageService,
  registerAccount = register
}) {
  const router = Router();
  const uploadProfileImage = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PROFILE_IMAGE_BYTES, files: 1 },
    fileFilter(_request, file, callback) {
      if (!PROFILE_IMAGE_TYPES.has(file.mimetype)) {
        callback(new HttpError(400, 'Profile image must be JPEG, PNG, or WebP'));
        return;
      }
      callback(null, true);
    }
  }).single('profileImage');

  router.post('/register', uploadProfileImage, async (request, response, next) => {
    if (!request.file) {
      next(new HttpError(400, 'A profile image is required'));
      return;
    }
    const validationErrors = validateRegistration(request.body);
    if (validationErrors.length > 0) {
      next(new HttpError(400, validationErrors.join('; ')));
      return;
    }

    let uploadedImage;
    try {
      uploadedImage = await profileImageService.upload(request.file.buffer);
    } catch (error) {
      next(error);
      return;
    }

    let result;
    try {
      result = await registerAccount(request.body, config, uploadedImage.secureUrl);
    } catch (error) {
      if (uploadedImage?.publicId) {
        try {
          await profileImageService.destroy(uploadedImage.publicId);
        } catch {
          console.error('Unable to remove unused Cloudinary profile image');
        }
      }
      next(error);
      return;
    }
    response.status(201).json(result);
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
