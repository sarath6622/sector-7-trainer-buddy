'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  LayoutDashboard,
  Users,
  Dumbbell,
  Trophy,
  Calendar,
  Library,
  Heart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/constants';
import type { UserRole } from '@/generated/prisma/enums';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  Users,
  Dumbbell,
  Trophy,
  Calendar,
  Library,
  Heart,
};

export function MobileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;

  if (!role) return null;

  const items = NAV_ITEMS[role];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background safe-area-bottom md:hidden">
      <div className="flex items-center justify-around px-2 py-1">
        {items.map((item) => {
          const Icon = ICON_MAP[item.icon] || LayoutDashboard;
          const isActive =
            item.href === `/${role.toLowerCase()}`
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-xs transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
