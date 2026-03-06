import { describe, it, expect, beforeEach } from 'vitest';
import { useOfflineStore } from '../use-offline-store';

describe('useOfflineStore', () => {
  beforeEach(() => {
    useOfflineStore.setState({
      pendingCount: 0,
      isSyncing: false,
      lastSyncAt: null,
    });
  });

  it('initialises with zero pending count, not syncing, and no lastSyncAt', () => {
    const state = useOfflineStore.getState();
    expect(state.pendingCount).toBe(0);
    expect(state.isSyncing).toBe(false);
    expect(state.lastSyncAt).toBeNull();
  });

  it('setPendingCount sets the count to the provided value', () => {
    useOfflineStore.getState().setPendingCount(5);
    expect(useOfflineStore.getState().pendingCount).toBe(5);
  });

  it('incrementPendingCount increments by 1', () => {
    useOfflineStore.getState().incrementPendingCount();
    expect(useOfflineStore.getState().pendingCount).toBe(1);
    useOfflineStore.getState().incrementPendingCount();
    expect(useOfflineStore.getState().pendingCount).toBe(2);
  });

  it('decrementPendingCount decrements by 1', () => {
    useOfflineStore.setState({ pendingCount: 3 });
    useOfflineStore.getState().decrementPendingCount();
    expect(useOfflineStore.getState().pendingCount).toBe(2);
  });

  it('decrementPendingCount clamps at 0 and does not go negative', () => {
    useOfflineStore.getState().decrementPendingCount();
    expect(useOfflineStore.getState().pendingCount).toBe(0);
    useOfflineStore.getState().decrementPendingCount();
    expect(useOfflineStore.getState().pendingCount).toBe(0);
  });

  it('setIsSyncing toggles syncing state', () => {
    useOfflineStore.getState().setIsSyncing(true);
    expect(useOfflineStore.getState().isSyncing).toBe(true);
    useOfflineStore.getState().setIsSyncing(false);
    expect(useOfflineStore.getState().isSyncing).toBe(false);
  });

  it('setLastSyncAt stores the provided timestamp', () => {
    const ts = Date.now();
    useOfflineStore.getState().setLastSyncAt(ts);
    expect(useOfflineStore.getState().lastSyncAt).toBe(ts);
  });

  it('multiple increments accumulate correctly', () => {
    for (let i = 0; i < 5; i++) {
      useOfflineStore.getState().incrementPendingCount();
    }
    expect(useOfflineStore.getState().pendingCount).toBe(5);
  });
});
