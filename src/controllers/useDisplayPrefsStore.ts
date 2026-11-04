import { create } from 'zustand';
import type { EnabledRatings } from '@/models/movie';

const STORAGE_KEY = 'enabledRatings'; // same key as before, so saved settings carry over

export const defaultRatings: EnabledRatings = {
  imdb: true,
  rottenTomatoes: true,
  metacritic: true,
};

function loadRatings(): EnabledRatings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultRatings, ...JSON.parse(raw) } : defaultRatings;
  } catch {
    return defaultRatings; // missing storage or corrupt JSON must not crash the application
  }
}

function saveRatings(ratings: EnabledRatings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ratings));
  } catch {
    /* storage unavailable: keep the in-memory value */
  }
}

interface DisplayPrefsState {
  enabledRatings: EnabledRatings;
  setEnabledRatings: (ratings: EnabledRatings) => void;
}

export const useDisplayPrefsStore = create<DisplayPrefsState>((set) => ({
  enabledRatings: loadRatings(),
  setEnabledRatings: (ratings) => {
    saveRatings(ratings);
    set({ enabledRatings: ratings });
  },
}));