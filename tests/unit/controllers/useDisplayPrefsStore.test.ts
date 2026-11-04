import { beforeEach, describe, expect, it } from 'vitest';
import { defaultRatings, useDisplayPrefsStore } from '@/controllers/useDisplayPrefsStore';

describe('useDisplayPrefsStore', () => {
  beforeEach(() => {
    useDisplayPrefsStore.setState({ enabledRatings: defaultRatings });
  });

  it('starts with all rating sources enabled', () => {
    expect(useDisplayPrefsStore.getState().enabledRatings).toEqual(defaultRatings);
  });

  it('updates state and saves to localStorage', () => {
    const next = { ...defaultRatings, imdb: false };
    useDisplayPrefsStore.getState().setEnabledRatings(next);

    expect(useDisplayPrefsStore.getState().enabledRatings).toEqual(next);
    expect(JSON.parse(localStorage.getItem('enabledRatings')!)).toEqual(next);
  });
});