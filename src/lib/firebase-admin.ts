import 'server-only';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';

function createAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;

  return initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      // Vercel stores private keys with literal \n — replace with real newlines
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export const firebaseAdminApp = createAdminApp();
