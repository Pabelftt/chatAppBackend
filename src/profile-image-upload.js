import multer from 'multer';
import { HttpError } from './errors.js';

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function createProfileImageUpload() {
  return multer({
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
}
