import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncPreferences } from '@/controllers/useSyncPreferences';
import { useDisplayPrefsStore, defaultRatings } from '@/controllers/useDisplayPrefsStore';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  user: null as { id: string } | null,
}));

vi.mock('@/models/profileRepository', () => ({
  getEnabledRatings: mocks.get,
  saveEnabledRatings: mocks.save,
}));
vi.mock('@/controllers/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

describe('useSyncPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.save.mockResolvedValue(undefined);
    useDisplayPrefsStore.setState({ enabledRatings: defaultRatings });
  });

  it('loads the saved ratings into the store when logged in', async () => {
    mocks.user = { id: 'u1' };
    mocks.get.mockResolvedValue({ ...defaultRatings, imdb: false });
    renderHook(() => useSyncPreferences());
    await waitFor(() =>
      expect(useDisplayPrefsStore.getState().enabledRatings.imdb).toBe(false),
    );
    expect(mocks.get).toHaveBeenCalledWith('u1');
  });

  it('only updates the store when logged out', () => {
    const { result } = renderHook(() => useSyncPreferences());
    act(() => result.current({ ...defaultRatings, imdb: false }));
    expect(useDisplayPrefsStore.getState().enabledRatings.imdb).toBe(false);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('saves to the profile when logged in', () => {
    mocks.user = { id: 'u1' };
    mocks.get.mockResolvedValue(null);
    const { result } = renderHook(() => useSyncPreferences());
    const next = { ...defaultRatings, metacritic: false };
    act(() => result.current(next));
    expect(mocks.save).toHaveBeenCalledWith('u1', next);
  });
});