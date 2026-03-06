'use client';

import { useEffect } from 'react';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useOfflineStore } from '@/stores/use-offline-store';
import {
  getPendingWorkouts,
  removePendingWorkout,
  getPendingWorkoutCount,
  type PendingLogPayload,
  type PendingCompletePayload,
} from '@/lib/indexed-db';
import { trpcClient } from '@/trpc/client';

// Bootstraps the pending count from IndexedDB on mount and drains the queue
// via the raw tRPC client whenever connectivity is restored. Mounted once in
// the dashboard shell via OfflineSyncMounter.
export function useOfflineSync(): void {
  const isOnline = useOnlineStatus();
  const { setPendingCount, decrementPendingCount, setIsSyncing, setLastSyncAt, isSyncing } =
    useOfflineStore();

  // Hydrate pending count from IDB on first mount so the banner shows correctly
  useEffect(() => {
    getPendingWorkoutCount().then(setPendingCount);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush the queue whenever connectivity is restored
  useEffect(() => {
    if (!isOnline || isSyncing) return;

    async function flush() {
      const pending = await getPendingWorkouts();
      if (pending.length === 0) return;

      setIsSyncing(true);
      try {
        for (const item of pending) {
          try {
            if (item.type === 'log') {
              await trpcClient.workout.log.mutate(item.payload as PendingLogPayload);
            } else {
              await trpcClient.workout.complete.mutate(item.payload as PendingCompletePayload);
            }
            await removePendingWorkout(item.id);
            decrementPendingCount();
          } catch (err) {
            // Stop on first error — item stays in queue for next reconnect attempt.
            // This prevents out-of-order sync and avoids swallowing errors silently.
            console.error('[offline-sync] Failed to sync workout, will retry later:', item.id, err);
            break;
          }
        }
        setLastSyncAt(Date.now());
      } finally {
        setIsSyncing(false);
        // Recount from IDB as source of truth after a partial or full flush
        getPendingWorkoutCount().then(setPendingCount);
      }
    }

    flush();
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Thin client component that mounts the sync hook exactly once in the dashboard shell
export function OfflineSyncMounter() {
  useOfflineSync();
  return null;
}
