import { describe, expect, it } from 'vitest';
import { validateSupabaseConfig } from './supabaseConfig';

const valid = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ci-test',
};

describe('Supabase public configuration', () => {
  it('trims public values and allows a local isolated HTTP endpoint', () => {
    expect(validateSupabaseConfig({
      VITE_SUPABASE_URL: ' http://127.0.0.1:54321 ',
      VITE_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_ci-test ',
    })).toEqual({ url: 'http://127.0.0.1:54321', key: valid.VITE_SUPABASE_PUBLISHABLE_KEY });
  });

  it.each(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const)(
    'fails clearly when %s is missing', (name) => {
      expect(() => validateSupabaseConfig({ ...valid, [name]: ' ' })).toThrow(name);
    },
  );

  it.each(['not-a-url', 'file:///database', 'https://user:password@example.supabase.co'])(
    'rejects an invalid or credential-bearing URL: %s', (url) => {
      expect(() => validateSupabaseConfig({ ...valid, VITE_SUPABASE_URL: url })).toThrow('VITE_SUPABASE_URL');
    },
  );

  it.each(['sb_secret_test', 'service_role', 'eyJhbGciOiJIUzI1NiJ9.test.signature'])(
    'rejects a non-publishable frontend key: %s', (key) => {
      expect(() => validateSupabaseConfig({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: key }))
        .toThrow('offentlig publishable key');
    },
  );
});
