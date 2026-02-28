import type { NextAuthConfig } from 'next-auth';
import type { UserRole } from '@/generated/prisma/enums';

export const authConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnAuth =
        nextUrl.pathname.startsWith('/login') || nextUrl.pathname.startsWith('/register');
      const isOnDashboard =
        nextUrl.pathname.startsWith('/admin') ||
        nextUrl.pathname.startsWith('/trainer') ||
        nextUrl.pathname.startsWith('/client');

      if (isOnDashboard) {
        if (!isLoggedIn) return false;

        const role = auth?.user?.role as UserRole;
        if (nextUrl.pathname.startsWith('/admin') && role !== 'ADMIN') {
          return Response.redirect(new URL(`/${role.toLowerCase()}`, nextUrl));
        }
        if (nextUrl.pathname.startsWith('/trainer') && role !== 'TRAINER') {
          return Response.redirect(new URL(`/${role.toLowerCase()}`, nextUrl));
        }
        if (nextUrl.pathname.startsWith('/client') && role !== 'CLIENT') {
          return Response.redirect(new URL(`/${role.toLowerCase()}`, nextUrl));
        }
        return true;
      }

      if (isOnAuth && isLoggedIn) {
        const role = auth?.user?.role as UserRole;
        return Response.redirect(new URL(`/${role.toLowerCase()}`, nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
