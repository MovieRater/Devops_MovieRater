import { createClient } from '@supabase/supabase-js';
import { validateSupabaseConfig } from './supabaseConfig';

const { url, key } = validateSupabaseConfig(import.meta.env);
export const supabase = createClient(url, key);
