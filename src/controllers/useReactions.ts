import { useCallback, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useReactionsStore } from './useReactionsStore';
import { getReactions, saveReaction, removeReaction } from '@/models/reactionRepository';
import type { Reaction } from '@/models/reaction';

/** Call once near the top of App: loads the user's reactions on login, clears them on logout. */
export function useSyncReactions() {
    const { user } = useAuth();
    const userId = user?.id;
    const setAll = useReactionsStore((s) => s.setAll);
    const clear = useReactionsStore((s) => s.clear);

    useEffect(() => {
        if (!userId) {
            clear();
            return;
        }
        let cancelled = false;
        getReactions(userId)
            .then((reactions) => {
                if (!cancelled) setAll(reactions);
            })
            .catch((e) => console.error('Failed to load reactions', e));
        return () => {
            cancelled = true;
        };
    }, [userId, setAll, clear]);
}

/** For one movie: the current reaction plus a toggle. Clicking the same reaction again removes it. */
export function useReaction(movieId: number | null) {
    const { user } = useAuth();
    const userId = user?.id;
    const current = useReactionsStore((s) => (movieId === null ? null : s.reactions[movieId] ?? null));
    const setLocal = useReactionsStore((s) => s.setReaction);

    const toggle = useCallback(
        async (reaction: Reaction) => {
            if (!userId || movieId === null) return;
            const previous = current;
            const next = previous === reaction ? null : reaction;
            setLocal(movieId, next); // optimistic: the UI updates immediately
            try {
                if (next === null) await removeReaction(userId, movieId);
                else await saveReaction(userId, movieId, next);
            } catch (e) {
                console.error('Failed to save reaction', e);
                setLocal(movieId, previous); // roll back if the save failed
            }
        },
        [userId, movieId, current, setLocal],
    );

    return { reaction: current, toggle, canReact: Boolean(userId) };
}