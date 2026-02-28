'use client';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NotificationItem } from './notification-item';
import { useNotificationStore } from '@/stores/use-notification-store';
import { useTRPC } from '@/trpc/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function NotificationCenter() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data } = useQuery(trpc.notification.list.queryOptions({ limit: 20 }));

  const markRead = useMutation(
    trpc.notification.markRead.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.notification.list.queryKey() });
      },
    }),
  );

  const markAllRead = useMutation(
    trpc.notification.markAllRead.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.notification.list.queryKey() });
        useNotificationStore.getState().resetUnread();
      },
    }),
  );

  const handleMarkRead = (id: string) => {
    markRead.mutate({ id });
    useNotificationStore.getState().markRead(id);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold">Notifications</h3>
        <Button variant="ghost" size="sm" onClick={() => markAllRead.mutate()} className="text-xs">
          Mark all read
        </Button>
      </div>
      <ScrollArea className="h-80">
        {data?.notifications && data.notifications.length > 0 ? (
          data.notifications.map((n: { id: string; type: string; title: string; message: string; isRead: boolean; createdAt: Date }) => (
            <NotificationItem key={n.id} notification={{ ...n, createdAt: n.createdAt.toISOString() }} onMarkRead={handleMarkRead} />
          ))
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            No notifications yet
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
