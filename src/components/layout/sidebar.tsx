'use client';

import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
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
  TrendingUp,
  ChevronLeft,
  ScrollText,
  Megaphone,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, APP_NAME } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import type { UserRole } from '@/generated/prisma/enums';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  Users,
  Dumbbell,
  Trophy,
  Calendar,
  Library,
  Heart,
  TrendingUp,
  ScrollText,
  Megaphone,
  MessageSquare,
};

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ isCollapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;

  if (!role) return null;

  const items = NAV_ITEMS[role];

  return (
    <aside
      className={cn(
        'relative hidden h-svh flex-col border-r bg-background transition-all duration-300 md:flex',
        isCollapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex h-14 items-center justify-between border-b px-3">
        {!isCollapsed && (
          <Link href={`/${role.toLowerCase()}`} className="flex items-center">
            <Logo className="scale-[0.85] origin-left" />
          </Link>
        )}
        {isCollapsed && (
          <Link href={`/${role.toLowerCase()}`} className="flex items-center justify-center w-full pr-2">
            <Logo collapsed className="scale-90" />
          </Link>
        )}
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className={cn("shrink-0 h-8 w-8 z-50", isCollapsed && "absolute -right-4 top-3 bg-background border rounded-full")}>
          <ChevronLeft
            className={cn('h-4 w-4 transition-transform', isCollapsed && 'rotate-180')}
          />
        </Button>
      </div>

      <nav className="flex-1 space-y-1 p-2">
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
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                isCollapsed && 'justify-center px-2',
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
