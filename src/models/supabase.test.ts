import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(() => ({ mocked: true })) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

describe('Supabase client initialization', () => {
  it('passes only validated public configuration to the mocked client', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', ' https://example.supabase.co ');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', ' sb_publishable_ci-test ');
    const { supabase } = await import('./supabase');
    expect(mocks.createClient).toHaveBeenCalledWith('https://example.supabase.co', 'sb_publishable_ci-test');
    expect(supabase).toEqual({ mocked: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops initialization before creating a client when configuration is missing', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_ci-test');
    await expect(import('./supabase')).rejects.toThrow('VITE_SUPABASE_URL');
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
