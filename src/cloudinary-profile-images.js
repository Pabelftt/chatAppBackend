import { v2 as cloudinary } from 'cloudinary';
import { HttpError } from './errors.js';

const PROFILE_IMAGE_OPTIONS = {
  folder: 'chatapp/profile-images',
  resource_type: 'image',
  transformation: [{
    width: 512,
    height: 512,
    crop: 'fill',
    gravity: 'auto',
    quality: 'auto',
    fetch_format: 'auto'
  }]
};

function parseCloudinaryUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('CLOUDINARY_URL must be a valid Cloudinary URL');
  }

  if (
    url.protocol !== 'cloudinary:'
    || !url.username
    || !url.password
    || !url.hostname
  ) {
    throw new Error('CLOUDINARY_URL must include Cloudinary API credentials');
  }

  return {
    cloud_name: url.hostname,
    api_key: decodeURIComponent(url.username),
    api_secret: decodeURIComponent(url.password),
    secure: true
  };
}

export function createCloudinaryProfileImageService(cloudinaryUrl) {
  if (!cloudinaryUrl) {
    return {
      async upload() {
        throw new HttpError(503, 'Profile image upload is not configured');
      },
      async destroy() {
        throw new Error('Profile image storage is not configured');
      }
    };
  }

  cloudinary.config(parseCloudinaryUrl(cloudinaryUrl));

  return {
    upload(buffer) {
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(PROFILE_IMAGE_OPTIONS, (error, result) => {
          if (error) {
            console.error('Cloudinary profile image upload failed');
            reject(new HttpError(502, 'Unable to upload profile image'));
            return;
          }
          if (!result?.secure_url || !result.public_id) {
            reject(new HttpError(502, 'Cloudinary did not return a profile image'));
            return;
          }
          resolve({ secureUrl: result.secure_url, publicId: result.public_id });
        }).end(buffer);
      });
    },
    async destroy(publicId) {
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      if (result.result !== 'ok' && result.result !== 'not found') {
        throw new Error('Cloudinary did not delete the unused profile image');
      }
    }
  };
}
