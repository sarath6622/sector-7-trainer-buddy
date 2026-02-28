import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icons|firebase-messaging-sw.js|manifest.webmanifest|sw.js).*)',
  ],
};
