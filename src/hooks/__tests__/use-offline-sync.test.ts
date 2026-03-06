import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOfflineStore } from '@/stores/use-offline-store';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetPendingWorkouts = vi.fn();
const mockGetPendingWorkoutCount = vi.fn();
const mockRemovePendingWorkout = vi.fn();

vi.mock('@/lib/indexed-db', () => ({
  getPendingWorkouts: () => mockGetPendingWorkouts(),
  getPendingWorkoutCount: () => mockGetPendingWorkoutCount(),
  removePendingWorkout: (id: string) => mockRemovePendingWorkout(id),
}));

const mockLogMutate = vi.fn();
const mockCompleteMutate = vi.fn();

vi.mock('@/trpc/client', () => ({
  trpcClient: {
    workout: {
      log: { mutate: (...args: unknown[]) => mockLogMutate(...args) },
      complete: { mutate: (...args: unknown[]) => mockCompleteMutate(...args) },
    },
  },
}));

let mockIsOnline = true;
vi.mock('@/hooks/use-online-status', () => ({
  useOnlineStatus: () => mockIsOnline,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePendingItem(type: 'log' | 'complete', id = 'item-1') {
  return {
    id,
    type,
    queuedAt: Date.now(),
    payload: type === 'log'
      ? { exercises: [{ exerciseId: 'ex-1', orderIndex: 0, sets: [{ setNumber: 1, reps: 10 }] }] }
      : { id: 'workout-1', exercises: [{ exerciseId: 'ex-1', orderIndex: 0, sets: [{ setNumber: 1, reps: 10 }] }] },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Late import so mocks are established first
async function importHook() {
  const mod = await import('@/hooks/use-offline-sync');
  return mod.useOfflineSync;
}

describe('useOfflineSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    useOfflineStore.setState({ pendingCount: 0, isSyncing: false, lastSyncAt: null });
    mockGetPendingWorkoutCount.mockResolvedValue(0);
    mockGetPendingWorkouts.mockResolvedValue([]);
    mockRemovePendingWorkout.mockResolvedValue(undefined);
    mockLogMutate.mockResolvedValue({});
    mockCompleteMutate.mockResolvedValue({});
  });

  it('bootstraps pendingCount from IndexedDB on mount', async () => {
    mockGetPendingWorkoutCount.mockResolvedValue(3);
    const useOfflineSync = await importHook();

    renderHook(() => useOfflineSync());

    await waitFor(() => {
      expect(useOfflineStore.getState().pendingCount).toBe(3);
    });
    expect(mockGetPendingWorkoutCount).toHaveBeenCalledOnce();
  });

  it('flushes pending log workouts when coming back online', async () => {
    mockIsOnline = true;
    mockGetPendingWorkouts.mockResolvedValue([makePendingItem('log')]);
    mockGetPendingWorkoutCount.mockResolvedValue(1);

    const useOfflineSync = await importHook();
    renderHook(() => useOfflineSync());

    await waitFor(() => {
      expect(mockLogMutate).toHaveBeenCalledOnce();
    });
    expect(mockRemovePendingWorkout).toHaveBeenCalledWith('item-1');
    expect(useOfflineStore.getState().isSyncing).toBe(false);
    expect(useOfflineStore.getState().lastSyncAt).not.toBeNull();
  });

  it('flushes pending complete workouts and calls complete.mutate', async () => {
    mockIsOnline = true;
    mockGetPendingWorkouts.mockResolvedValue([makePendingItem('complete')]);
    mockGetPendingWorkoutCount.mockResolvedValue(1);

    const useOfflineSync = await importHook();
    renderHook(() => useOfflineSync());

    await waitFor(() => {
      expect(mockCompleteMutate).toHaveBeenCalledOnce();
    });
    expect(mockLogMutate).not.toHaveBeenCalled();
    expect(mockRemovePendingWorkout).toHaveBeenCalledWith('item-1');
  });

  it('does not flush when queue is empty', async () => {
    mockIsOnline = true;
    mockGetPendingWorkouts.mockResolvedValue([]);

    const useOfflineSync = await importHook();
    renderHook(() => useOfflineSync());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockLogMutate).not.toHaveBeenCalled();
    expect(useOfflineStore.getState().isSyncing).toBe(false);
    expect(useOfflineStore.getState().lastSyncAt).toBeNull();
  });

  it('stops flushing on first mutation error and leaves item in queue', async () => {
    mockIsOnline = true;
    const items = [makePendingItem('log', 'item-1'), makePendingItem('log', 'item-2')];
    mockGetPendingWorkouts.mockResolvedValue(items);
    mockGetPendingWorkoutCount.mockResolvedValue(2);
    mockLogMutate.mockRejectedValue(new Error('Server error'));

    const useOfflineSync = await importHook();
    renderHook(() => useOfflineSync());

    await waitFor(() => {
      expect(mockLogMutate).toHaveBeenCalledOnce();
    });

    // First item failed — should NOT be removed from queue
    expect(mockRemovePendingWorkout).not.toHaveBeenCalled();
    // Second item should not have been attempted
    expect(mockLogMutate).toHaveBeenCalledTimes(1);
    // Sync should end cleanly
    expect(useOfflineStore.getState().isSyncing).toBe(false);
  });

  it('removes only successfully synced items in a partial flush', async () => {
    mockIsOnline = true;
    const items = [
      makePendingItem('log', 'item-1'),
      makePendingItem('log', 'item-2'),
      makePendingItem('log', 'item-3'),
    ];
    mockGetPendingWorkouts.mockResolvedValue(items);
    mockGetPendingWorkoutCount.mockResolvedValue(3);

    // First succeeds, second fails, third is never reached
    mockLogMutate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Network error'));

    const useOfflineSync = await importHook();
    renderHook(() => useOfflineSync());

    await waitFor(() => {
      expect(mockLogMutate).toHaveBeenCalledTimes(2);
    });

    expect(mockRemovePendingWorkout).toHaveBeenCalledTimes(1);
    expect(mockRemovePendingWorkout).toHaveBeenCalledWith('item-1');
    expect(mockRemovePendingWorkout).not.toHaveBeenCalledWith('item-2');
  });

  it('does not start a second flush while isSyncing is already true', async () => {
    mockIsOnline = true;
    useOfflineStore.setState({ isSyncing: true });
    mockGetPendingWorkouts.mockResolvedValue([makePendingItem('log')]);

    const useOfflineSync = await importHook();
    renderHook(() => useOfflineSync());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockLogMutate).not.toHaveBeenCalled();
  });
});
