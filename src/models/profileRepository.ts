import { supabase } from './supabase';
import type { EnabledRatings } from './movie';

export async function getEnabledRatings(userId: string): Promise<EnabledRatings | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('enabled_ratings')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.enabled_ratings as EnabledRatings) ?? null;
}

export async function saveEnabledRatings(userId: string, ratings: EnabledRatings): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ enabled_ratings: ratings, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}