/**
 * Firebase Admin singleton — lazy init.
 *
 * We can't initialize at module load because Next.js collects page
 * data during `next build`, which imports every route module. If
 * FIREBASE_* env vars aren't present at build time, `cert()` throws
 * and the whole build fails. Instead, wrap the app / auth / firestore
 * accessors so init only happens on the first actual request.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let cachedApp = null;

function getAdminApp() {
  if (cachedApp) return cachedApp;
  if (getApps().length > 0) {
    cachedApp = getApps()[0];
    return cachedApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env.local.'
    );
  }

  cachedApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  return cachedApp;
}

/* Proxy objects so existing `adminDb.collection(...)` / `adminAuth.xxx(...)`
   call sites keep working without any refactor. Each property access
   resolves through the lazy getters. */
export const adminDb = new Proxy(
  {},
  {
    get(_target, prop) {
      const instance = getFirestore(getAdminApp());
      const value = instance[prop];
      return typeof value === 'function' ? value.bind(instance) : value;
    },
  }
);

export const adminAuth = new Proxy(
  {},
  {
    get(_target, prop) {
      const instance = getAuth(getAdminApp());
      const value = instance[prop];
      return typeof value === 'function' ? value.bind(instance) : value;
    },
  }
);

export default getAdminApp;
