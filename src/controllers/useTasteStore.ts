import { create } from 'zustand';
import type { Answer, Film, PickReaction, Reaction, Verdict } from '@/models/taste';

// Local prototype: clues and reactions live in localStorage until the backend stores them.
const ANSWERS_KEY = 'tasteClues';
const REACTIONS_KEY = 'tastePickReactions';

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(key: string, items: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* storage unavailable: keep the in-memory value */
  }
}

interface TasteState {
  /** Clues: every answer so far. Re-answering a film replaces the earlier answer. */
  answers: Answer[];
  /** Reactions to suggestions. Clicking the same reaction again removes it. */
  reactions: PickReaction[];
  answer: (film: Film, verdict: Verdict, source: Answer['source'], hunchId?: string) => void;
  react: (film: Film, reaction: Reaction) => void;
  /** Puts back an earlier state (used by Undo). */
  restore: (answers: Answer[], reactions: PickReaction[]) => void;
  /** Starts over. Films saved for later are kept. */
  reset: () => void;
}

export const useTasteStore = create<TasteState>((set) => ({
  answers: load<Answer>(ANSWERS_KEY),
  reactions: load<PickReaction>(REACTIONS_KEY),
  answer: (film, verdict, source, hunchId) =>
    set((state) => {
      const next: Answer = { film, verdict, source, hunchId, answeredAt: new Date().toISOString() };
      const answers = [...state.answers.filter((a) => a.film.tmdbId !== film.tmdbId), next];
      save(ANSWERS_KEY, answers);
      return { answers };
    }),
  react: (film, reaction) =>
    set((state) => {
      const previous = state.reactions.find((r) => r.film.tmdbId === film.tmdbId);
      const others = state.reactions.filter((r) => r.film.tmdbId !== film.tmdbId);
      const reactions = previous?.reaction === reaction
        ? others
        : [...others, { film, reaction, reactedAt: new Date().toISOString() }];
      save(REACTIONS_KEY, reactions);
      return { reactions };
    }),
  restore: (answers, reactions) => {
    save(ANSWERS_KEY, answers);
    save(REACTIONS_KEY, reactions);
    set({ answers, reactions });
  },
  reset: () => {
    const reactions = useTasteStore.getState().reactions.filter((r) => r.reaction === 'later');
    save(ANSWERS_KEY, []);
    save(REACTIONS_KEY, reactions);
    set({ answers: [], reactions });
  },
}));
