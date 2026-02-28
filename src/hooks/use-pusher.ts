'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getPusherClient } from '@/lib/pusher-client';
import { useNotificationStore } from '@/stores/use-notification-store';

export function usePusher() {
  const { data: session } = useSession();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const incrementUnread = useNotificationStore((s) => s.incrementUnread);

  useEffect(() => {
    if (!session?.user?.id) return;

    const pusher = getPusherClient();
    const channel = pusher.subscribe(`private-user-${session.user.id}`);

    channel.bind('new-notification', (data: {
      id: string;
      type: string;
      title: string;
      message: string;
      createdAt: string;
      data?: Record<string, unknown>;
    }) => {
      addNotification({ ...data, isRead: false });
      incrementUnread();
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`private-user-${session.user.id}`);
    };
  }, [session?.user?.id, addNotification, incrementUnread]);
}
