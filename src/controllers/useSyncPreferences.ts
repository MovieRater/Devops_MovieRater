import { useCallback, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useDisplayPrefsStore, defaultRatings } from './useDisplayPrefsStore';
import { getEnabledRatings, saveEnabledRatings } from '@/models/profileRepository';
import type { EnabledRatings } from '@/models/movie';

export function useSyncPreferences() {
  const { user } = useAuth();
  const userId = user?.id;
  const setEnabledRatings = useDisplayPrefsStore((s) => s.setEnabledRatings);

  // On login: the account's saved choice replaces the local one
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getEnabledRatings(userId)
      .then((ratings) => {
        if (!cancelled && ratings) setEnabledRatings({ ...defaultRatings, ...ratings });
      })
      .catch((e) => console.error('Failed to load preferences', e));
    return () => {
      cancelled = true;
    };
  }, [userId, setEnabledRatings]);

  // Use this instead of setEnabledRatings in the UI
  return useCallback(
    (ratings: EnabledRatings) => {
      setEnabledRatings(ratings); // updates the screen and localStorage immediately
      if (userId) {
        saveEnabledRatings(userId, ratings).catch((e) =>
          console.error('Failed to save preferences', e),
        );
      }
    },
    [userId, setEnabledRatings],
  );
}