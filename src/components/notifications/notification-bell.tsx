'use client';

import { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NotificationCenter } from './notification-center';
import { useNotificationStore } from '@/stores/use-notification-store';
import { usePusher } from '@/hooks/use-pusher';
import { useFcm } from '@/hooks/use-fcm';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';

export function NotificationBell() {
  usePusher();
  useFcm();

  const trpc = useTRPC();
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  // Fetch the true unread count from the DB on mount so the badge is correct
  // even for notifications that arrived before the current session started
  const { data: serverCount } = useQuery(trpc.notification.unreadCount.queryOptions());

  useEffect(() => {
    if (serverCount !== undefined) {
      setUnreadCount(serverCount);
    }
  }, [serverCount, setUnreadCount]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground"
              aria-label={`${unreadCount} unread notifications`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <NotificationCenter />
      </PopoverContent>
    </Popover>
  );
}
