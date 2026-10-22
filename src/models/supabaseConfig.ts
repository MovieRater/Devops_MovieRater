export interface SupabaseEnvironment {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

// Public browser configuration only; shared by the build and startup checks.
export function validateSupabaseConfig(env: SupabaseEnvironment) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url) {
    throw new Error('VITE_SUPABASE_URL mangler. Udfyld variablen før build eller opstart.');
  }
  if (!key) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY mangler. Udfyld variablen før build eller opstart.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('VITE_SUPABASE_URL skal være en gyldig HTTP- eller HTTPS-URL.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
    throw new Error('VITE_SUPABASE_URL skal være en HTTP- eller HTTPS-URL uden loginoplysninger.');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error(
      'VITE_SUPABASE_PUBLISHABLE_KEY skal være en offentlig publishable key ' +
      '(sb_publishable_...). Secret keys og service_role må ikke bruges i frontend.',
    );
  }
  return { url, key };
}
