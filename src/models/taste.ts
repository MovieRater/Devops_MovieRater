// Shared between the browser and the local AI server (server/ai).

/** The four quick-rating buttons. */
export type Verdict = 'not' | 'like' | 'super' | 'unseen';

/** Quick ratings count as real ratings on the 1–10 scale; "unseen" is not a rating. */
export const VERDICT_SCORE: Record<Verdict, number | null> = {
  not: 3,
  like: 7,
  super: 9,
  unseen: null,
};

export interface Film {
  tmdbId: number;
  title: string;
  year: number;
  genres: string[];
  posterPath: string | null;
}

/** One clue: the user's answer to one film card. */
export interface Answer {
  film: Film;
  verdict: Verdict;
  /** Where the answer came from. Quick-taste ratings are kept out of trending. */
  source: 'anchor' | 'hunch' | 'pick';
  hunchId?: string;
  answeredAt: string;
}

export type ProbeRole = 'confirm' | 'split';

export interface HunchFilm extends Film {
  role: ProbeRole;
  /** What this film tests, shown under the card. */
  testing: string;
}

export interface Hunch {
  id: string;
  /** The suspected pattern, e.g. "Whimsical, stylized films". */
  label: string;
  /** Why the game suspects it, e.g. "You super-liked Grand Budapest Hotel". */
  basis: string;
  films: HunchFilm[];
}

export type HunchStatus = 'confirmed' | 'narrowed' | 'dropped' | 'open';

/** Right-now-only steering. Never saved as taste. */
export interface Vibe {
  choices: string[];
  refineChips: string[];
  refineText?: string;
}

export interface Pick extends Film {
  reason: string;
}

/**
 * Reaction to a suggestion (the user hasn't seen it, so this is not a rating):
 * up = sounds good, down = not interested, later = save for later.
 */
export type Reaction = 'up' | 'down' | 'later';

export interface PickReaction {
  film: Film;
  reaction: Reaction;
  reactedAt: string;
}

/** claude = Claude API, relay = a Claude Code session answers by hand, fake = no AI. */
export type AiMode = 'claude' | 'relay' | 'fake';

export interface AnchorsResponse { mode: AiMode; anchors: Film[] }
export interface HunchesRequest { answers: Answer[] }
export interface HunchesResponse { mode: AiMode; hunches: Hunch[] }
export interface RecommendationsRequest {
  answers: Answer[];
  hunches: { hunch: Hunch; status: HunchStatus }[];
  vibe: Vibe;
  /** Reactions to earlier suggestions. Those films are not suggested again. */
  reactions: PickReaction[];
}
/** How the AI read the user's free-text note. Only present when a note was sent. */
export interface NoteVerdict {
  /** False when the note isn't about what to watch (e.g. an unrelated question); it was ignored. */
  relevant: boolean;
  /** Short summary of how the note was understood; empty when not relevant. */
  understood: string;
}
export interface RecommendationsResponse { mode: AiMode; picks: Pick[]; note?: NoteVerdict }
