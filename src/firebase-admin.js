import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export function createFirebaseMessaging(serviceAccountJson, serviceAccountPath = null) {
  if (serviceAccountJson && serviceAccountPath) {
    throw new Error('Configure only one Firebase service-account source');
  }
  const credentials = serviceAccountPath
    ? readFileSync(serviceAccountPath, 'utf8')
    : serviceAccountJson;
  if (!credentials) return null;

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(credentials);
  } catch (error) {
    throw new Error('Firebase Admin service-account credential must contain valid JSON', {
      cause: error
    });
  }
  if (serviceAccount.type !== 'service_account') {
    throw new Error('Firebase Admin credential must be a service account');
  }

  const app = getApps()[0] ?? initializeApp({
    credential: cert(serviceAccount)
  });
  return getMessaging(app);
}
