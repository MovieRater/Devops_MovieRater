import { create } from 'zustand';
import type { Reaction, ReactionMap } from '@/models/reaction';

interface ReactionsState {
    reactions: ReactionMap;
    setAll: (reactions: ReactionMap) => void;
    setReaction: (movieId: number, reaction: Reaction | null) => void;
    clear: () => void;
}

export const useReactionsStore = create<ReactionsState>((set) => ({
    reactions: {},
    setAll: (reactions) => set({ reactions }),
    setReaction: (movieId, reaction) =>
        set((state) => {
            const next = { ...state.reactions };
            if (reaction === null) delete next[movieId];
            else next[movieId] = reaction;
            return { reactions: next };
        }),
    clear: () => set({ reactions: {} }),
}));