import type { AiMode, HunchStatus, NoteVerdict, ProbeRole, Reaction, Verdict, Vibe } from '../../src/models/taste';

/** One answered film, enriched for the AI (genres + director). */
export interface ClueLine {
  title: string;
  year: number;
  genres: string[];
  director: string | null;
  verdict: Verdict;
  hunchLabel?: string;
}

export interface HunchInput {
  clues: ClueLine[];
}

export interface RecommendInput {
  clues: ClueLine[];
  patterns: { label: string; status: HunchStatus }[];
  vibe: Vibe;
  /** Earlier suggestions and how the user reacted (they haven't seen these films). */
  reactions: { title: string; year: number; genres: string[]; reaction: Reaction }[];
}

/** What the AI returns before we verify it on TMDB. Titles may be wrong or invented. */
export interface HunchDraft {
  label: string;
  basis: string;
  films: { title: string; year: number; role: ProbeRole; testing: string }[];
}

export interface PickDraft {
  title: string;
  year: number;
  reason: string;
}

export interface RecommendDraft {
  picks: PickDraft[];
  note: NoteVerdict;
}

/** The only thing the service knows about the AI, so tests and the fake can stand in for Claude. */
export interface AiClient {
  readonly mode: AiMode;
  proposeHunches(input: HunchInput): Promise<HunchDraft[]>;
  recommend(input: RecommendInput): Promise<RecommendDraft>;
}
