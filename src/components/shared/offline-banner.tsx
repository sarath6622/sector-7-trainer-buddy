'use client';

import { WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useOfflineStore } from '@/stores/use-offline-store';

// Sticky banner rendered at the top of the dashboard shell — communicates
// offline/syncing state globally without interrupting the user's workflow.
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const { pendingCount, isSyncing } = useOfflineStore();

  // Hidden when online and not actively syncing
  if (isOnline && !isSyncing) return null;

  const bannerClass = cn(
    'w-full px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors',
    !isOnline && 'bg-destructive text-destructive-foreground',
    isOnline && isSyncing && 'bg-amber-500 text-white dark:bg-amber-600',
  );

  if (!isOnline) {
    return (
      <div className={bannerClass} role="status" aria-live="polite">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>
          You&apos;re offline.
          {pendingCount > 0 &&
            ` ${pendingCount} workout${pendingCount > 1 ? 's' : ''} will sync when you reconnect.`}
        </span>
      </div>
    );
  }

  return (
    <div className={bannerClass} role="status" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
      <span>
        Syncing{' '}
        {pendingCount > 0
          ? `${pendingCount} workout${pendingCount > 1 ? 's' : ''}`
          : 'workouts'}
        &hellip;
      </span>
    </div>
  );
}
