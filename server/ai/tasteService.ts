import type {
  Answer, Film, Hunch, HunchesResponse, Pick, RecommendationsRequest, RecommendationsResponse,
} from '../../src/models/taste';
import type { AiClient, ClueLine } from './aiClient';
import type { TmdbRepository } from './tmdbRepository';
import starterPool from './starterPool.json';

const ANCHOR_COUNT = 12; // the browser stops after 5 answered (not "haven't seen") anchors
const MAX_PICKS = 10;
/** Reasons are one sentence; a cap leaves no room to smuggle anything else to the user. */
const MAX_REASON_CHARS = 200;

interface PoolFilm { id: number; title: string; year: number; genres: string[]; votes: number; poster: string | null }

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function capReason(reason: string): string {
  return reason.length <= MAX_REASON_CHARS ? reason : `${reason.slice(0, MAX_REASON_CHARS - 1).trimEnd()}…`;
}

export class TasteService {
  constructor(
    private ai: AiClient,
    private tmdb: TmdbRepository,
    private pool: PoolFilm[] = starterPool,
    private random: () => number = Math.random,
  ) {}

  get mode() {
    return this.ai.mode;
  }

  /**
   * Anchors: widely seen films, one per main genre, most-seen first so early cards are
   * ones people can answer. Varies between sessions.
   */
  anchors(): Film[] {
    const byGenre = new Map<string, PoolFilm[]>();
    for (const f of shuffle(this.pool, this.random)) {
      const g = f.genres[0];
      byGenre.set(g, [...(byGenre.get(g) ?? []), f]);
    }
    const picked: PoolFilm[] = [];
    // Round-robin over genres so the first cards cover different genres.
    while (picked.length < ANCHOR_COUNT && [...byGenre.values()].some((l) => l.length)) {
      const round = [...byGenre.values()].map((l) => l.shift()).filter((f): f is PoolFilm => !!f);
      picked.push(...round.sort((a, b) => b.votes - a.votes));
    }
    return picked.slice(0, ANCHOR_COUNT).map((f) => ({
      tmdbId: f.id, title: f.title, year: f.year, genres: f.genres, posterPath: f.poster,
    }));
  }

  private async toClues(answers: Answer[], hunches: Hunch[] = []): Promise<ClueLine[]> {
    const labels = new Map(hunches.map((h) => [h.id, h.label]));
    return Promise.all(answers.map(async (a) => ({
      title: a.film.title,
      year: a.film.year,
      genres: a.film.genres,
      director: await this.tmdb.director(a.film.tmdbId),
      verdict: a.verdict,
      hunchLabel: a.hunchId ? labels.get(a.hunchId) : undefined,
    })));
  }

  /** Verifies AI-suggested films on TMDB; drops invented, already answered and duplicate films. */
  private async verify<T extends { title: string; year: number }>(
    drafts: T[], exclude: Set<number>,
  ): Promise<(T & { film: Film })[]> {
    const found: ((T & { film: Film }) | null)[] = await Promise.all(drafts.map(async (d) => {
      const film = await this.tmdb.findFilm(d.title, d.year).catch(() => null);
      return film ? { ...d, film } : null;
    }));
    const seen = new Set(exclude);
    const result: (T & { film: Film })[] = [];
    for (const f of found) {
      if (!f || seen.has(f.film.tmdbId)) continue;
      seen.add(f.film.tmdbId);
      result.push(f);
    }
    return result;
  }

  async hunches(answers: Answer[]): Promise<HunchesResponse> {
    const drafts = await this.ai.proposeHunches({ clues: await this.toClues(answers) });
    const exclude = new Set(answers.map((a) => a.film.tmdbId));
    const hunches: Hunch[] = [];
    for (const [i, draft] of drafts.entries()) {
      // Shared exclude set: a film used by one hunch can't reappear in another.
      const films = await this.verify(draft.films, exclude);
      films.forEach((f) => exclude.add(f.film.tmdbId));
      if (!films.length) continue;
      hunches.push({
        id: `h${i + 1}`,
        label: draft.label,
        basis: draft.basis,
        films: films.map((f) => ({ ...f.film, role: f.role, testing: f.testing })),
      });
    }
    return { mode: this.ai.mode, hunches };
  }

  async recommendations(req: RecommendationsRequest): Promise<RecommendationsResponse> {
    const draft = await this.ai.recommend({
      clues: await this.toClues(req.answers, req.hunches.map((h) => h.hunch)),
      patterns: req.hunches.map((h) => ({ label: h.hunch.label, status: h.status })),
      vibe: req.vibe,
      reactions: req.reactions.map((r) => ({
        title: r.film.title, year: r.film.year, genres: r.film.genres, reaction: r.reaction,
      })),
    });
    // "Haven't seen" films may come back as suggestions; everything else answered is excluded,
    // and so is every film already suggested and reacted to (yes, no or later).
    const exclude = new Set([
      ...req.answers.filter((a) => a.verdict !== 'unseen').map((a) => a.film.tmdbId),
      ...req.reactions.map((r) => r.film.tmdbId),
    ]);
    const verified = await this.verify(draft.picks, exclude);
    const picks: Pick[] = verified.slice(0, MAX_PICKS).map((p) => ({ ...p.film, reason: capReason(p.reason) }));
    const note = req.vibe.refineText?.trim()
      ? (draft.note?.relevant === false
        ? { relevant: false, understood: '' }
        : { relevant: true, understood: (draft.note?.understood ?? '').slice(0, 80) })
      : undefined;
    return { mode: this.ai.mode, picks, note };
  }
}
