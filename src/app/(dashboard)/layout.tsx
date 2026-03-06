'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { TopNav } from '@/components/layout/top-nav';
import { MobileNav } from '@/components/layout/mobile-nav';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { OfflineBanner } from '@/components/shared/offline-banner';
import { OfflineSyncMounter } from '@/hooks/use-offline-sync';
import { PushNotificationMounter } from '@/hooks/use-push-notifications';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex h-svh overflow-hidden">
      {/* Mounts the offline sync hook — renders nothing */}
      <OfflineSyncMounter />
      {/* Requests push notification permission + registers FCM token — renders nothing */}
      <PushNotificationMounter />

      <Sidebar isCollapsed={isCollapsed} onToggleCollapse={() => setIsCollapsed(!isCollapsed)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Null when online+synced; red when offline; amber when syncing */}
        <OfflineBanner />

        <TopNav
          notificationSlot={<NotificationBell />}
          themeToggleSlot={<ThemeToggle />}
        />

        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">{children}</main>

        <MobileNav />
      </div>
    </div>
  );
}
