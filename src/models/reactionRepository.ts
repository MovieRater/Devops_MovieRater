import { supabase } from './supabase';
import type { Reaction, ReactionMap } from './reaction';

export async function getReactions(userId: string): Promise<ReactionMap> {
    const { data, error } = await supabase
        .from('movie_reactions')
        .select('movie_id, reaction')
        .eq('user_id', userId);
    if (error) throw error;
    return Object.fromEntries(
        (data ?? []).map((row) => [row.movie_id, row.reaction as Reaction]),
    );
}

export async function saveReaction(userId: string, movieId: number, reaction: Reaction): Promise<void> {
    const { error } = await supabase.from('movie_reactions').upsert({
        user_id: userId,
        movie_id: movieId,
        reaction,
        updated_at: new Date().toISOString(),
    });
    if (error) throw error;
}

export async function removeReaction(userId: string, movieId: number): Promise<void> {
    const { error } = await supabase
        .from('movie_reactions')
        .delete()
        .eq('user_id', userId)
        .eq('movie_id', movieId);
    if (error) throw error;
}