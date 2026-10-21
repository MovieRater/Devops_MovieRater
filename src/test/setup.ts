import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  vi.stubGlobal('scrollTo', vi.fn());
  // Any accidental real API call fails the test instead of reaching Supabase.
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network requests are forbidden in unit tests.'); }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
