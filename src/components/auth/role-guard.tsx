'use client';

import { useSession } from 'next-auth/react';
import type { UserRole } from '@/generated/prisma/enums';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children, fallback = null }: RoleGuardProps) {
  const { data: session } = useSession();
  if (!session?.user?.role || !allowedRoles.includes(session.user.role as UserRole)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
