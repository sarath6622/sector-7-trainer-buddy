import { create } from 'zustand';

interface OfflineStore {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: number | null;

  setPendingCount: (count: number) => void;
  incrementPendingCount: () => void;
  // Prevents the pending badge from going negative on rapid syncs
  decrementPendingCount: () => void;
  setIsSyncing: (syncing: boolean) => void;
  setLastSyncAt: (ts: number) => void;
}

export const useOfflineStore = create<OfflineStore>((set) => ({
  pendingCount: 0,
  isSyncing: false,
  lastSyncAt: null,

  setPendingCount: (count) => set({ pendingCount: count }),
  incrementPendingCount: () => set((state) => ({ pendingCount: state.pendingCount + 1 })),
  decrementPendingCount: () =>
    set((state) => ({ pendingCount: Math.max(0, state.pendingCount - 1) })),
  setIsSyncing: (syncing) => set({ isSyncing: syncing }),
  setLastSyncAt: (ts) => set({ lastSyncAt: ts }),
}));
