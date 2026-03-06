'use client';

import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/use-push-notifications';

// Renders nothing on Android/Chrome (permission is requested automatically).
// On iOS, shows a top banner with an "Enable" button that triggers the
// permission dialog — iOS requires requestPermission() from a user tap.
export function PushNotificationMounter() {
  const { showBanner, enable, dismiss } = usePushNotifications();

  if (!showBanner) return null;

  return (
    <div className="fixed top-16 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm rounded-xl border border-border bg-card shadow-lg p-3 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bell className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold leading-snug">Enable notifications</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Get alerts for messages and workout updates.
          </p>
        </div>
        <Button size="sm" className="h-7 text-xs shrink-0" onClick={enable}>
          Enable
        </Button>
        <button
          onClick={dismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
