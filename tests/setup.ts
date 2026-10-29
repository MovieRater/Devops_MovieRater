import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node's built-in localStorage can shadow jsdom's and lacks clear(), so tests use an in-memory one.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => { store.delete(key); },
    setItem: (key, value) => { store.set(key, String(value)); },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
  document.documentElement.classList.remove('dark');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  vi.stubGlobal('scrollTo', vi.fn());
  // Any accidental real API call fails the test instead of reaching Supabase.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network requests are forbidden in unit tests.'))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});