'use client';

import { useSession } from 'next-auth/react';
import type { UserRole } from '@/generated/prisma/enums';

export function useCurrentUser() {
  const { data: session, status } = useSession();

  return {
    user: session?.user
      ? {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          role: session.user.role as UserRole,
          image: session.user.image,
        }
      : null,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
  };
}
