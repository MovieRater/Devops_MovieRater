import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaction, useSyncReactions } from '@/controllers/useReactions';
import { useReactionsStore } from '@/controllers/useReactionsStore';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  user: null as { id: string } | null,
}));

vi.mock('@/models/reactionRepository', () => ({
  getReactions: mocks.get,
  saveReaction: mocks.save,
  removeReaction: mocks.remove,
}));
vi.mock('@/controllers/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
  mocks.get.mockResolvedValue({});
  mocks.save.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  useReactionsStore.getState().clear();
});

describe('useSyncReactions', () => {
  it('loads the reactions of the signed-in user', async () => {
    mocks.user = { id: 'u1' };
    mocks.get.mockResolvedValue({ 10: 2, 20: 0 });
    renderHook(() => useSyncReactions());
    await waitFor(() =>
      expect(useReactionsStore.getState().reactions).toEqual({ 10: 2, 20: 0 }),
    );
    expect(mocks.get).toHaveBeenCalledWith('u1');
  });

  it('clears the reactions and does not fetch when signed out', () => {
    useReactionsStore.getState().setAll({ 10: 1 });
    renderHook(() => useSyncReactions());
    expect(useReactionsStore.getState().reactions).toEqual({});
    expect(mocks.get).not.toHaveBeenCalled();
  });
});

describe('useReaction', () => {
  it('saves a new reaction and updates the store', async () => {
    mocks.user = { id: 'u1' };
    const { result } = renderHook(() => useReaction(10));
    await act(async () => {
      await result.current.toggle(1);
    });
    expect(mocks.save).toHaveBeenCalledWith('u1', 10, 1);
    expect(useReactionsStore.getState().reactions[10]).toBe(1);
    expect(result.current.reaction).toBe(1);
  });

  it('removes the reaction when the same one is clicked again', async () => {
    mocks.user = { id: 'u1' };
    useReactionsStore.getState().setAll({ 10: 1 });
    const { result } = renderHook(() => useReaction(10));
    await act(async () => {
      await result.current.toggle(1);
    });
    expect(mocks.remove).toHaveBeenCalledWith('u1', 10);
    expect(useReactionsStore.getState().reactions[10]).toBeUndefined();
  });

  it('rolls back the change when saving fails', async () => {
    mocks.user = { id: 'u1' };
    mocks.save.mockRejectedValue(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useReaction(10));
    await act(async () => {
      await result.current.toggle(2);
    });
    expect(useReactionsStore.getState().reactions[10]).toBeUndefined();
    spy.mockRestore();
  });

  it('does nothing when signed out', async () => {
    const { result } = renderHook(() => useReaction(10));
    expect(result.current.canReact).toBe(false);
    await act(async () => {
      await result.current.toggle(1);
    });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(useReactionsStore.getState().reactions).toEqual({});
  });
});