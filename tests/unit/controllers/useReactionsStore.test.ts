import { beforeEach, describe, expect, it } from 'vitest';
import { useReactionsStore } from '@/controllers/useReactionsStore';

describe('useReactionsStore', () => {
  beforeEach(() => {
    useReactionsStore.getState().clear();
  });

  it('replaces all reactions with setAll', () => {
    useReactionsStore.getState().setAll({ 10: 2, 20: 0 });
    expect(useReactionsStore.getState().reactions).toEqual({ 10: 2, 20: 0 });
  });

  it('adds and changes the reaction for a single movie', () => {
    const { setReaction } = useReactionsStore.getState();
    setReaction(10, 1);
    setReaction(20, 0);
    setReaction(10, 2);
    expect(useReactionsStore.getState().reactions).toEqual({ 10: 2, 20: 0 });
  });

  it('removes a reaction when it is set to null', () => {
    const { setAll, setReaction } = useReactionsStore.getState();
    setAll({ 10: 1, 20: 0 });
    setReaction(10, null);
    expect(useReactionsStore.getState().reactions).toEqual({ 20: 0 });
  });

  it('clear empties the store', () => {
    useReactionsStore.getState().setAll({ 10: 1 });
    useReactionsStore.getState().clear();
    expect(useReactionsStore.getState().reactions).toEqual({});
  });
});