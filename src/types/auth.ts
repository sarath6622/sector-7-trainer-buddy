import type { UserRole } from '@/generated/prisma/enums';
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    role: UserRole;
  }
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession['user'];
  }
}

// JWT augmentation - next-auth v5 beta stores custom fields on the token
// Access via session.user after the session callback maps them

