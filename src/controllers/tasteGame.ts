import type { Answer, Film, Hunch, HunchFilm, HunchStatus, PickReaction, Verdict } from '@/models/taste';

/** Anchors answered with a real opinion (not "haven't seen") before hunches start. */
export const ANCHORS_NEEDED = 5;
/** Thumbs down on this many picks (out of the first 5 reacted to) opens the refine step. */
export const MISSES_FOR_REFINE = 3;

const liked = (v: Verdict) => v === 'like' || v === 'super';

export function answerFor(answers: Answer[], tmdbId: number): Answer | undefined {
  return answers.find((a) => a.film.tmdbId === tmdbId);
}

/** Next anchor card, or null once enough anchors have a real answer (or the list runs out). */
export function nextAnchor(anchors: Film[], answers: Answer[]): Film | null {
  const opinions = answers.filter((a) => a.source === 'anchor' && a.verdict !== 'unseen').length;
  if (opinions >= ANCHORS_NEEDED) return null;
  return anchors.find((f) => !answerFor(answers, f.tmdbId)) ?? null;
}

/**
 * Walks the hunch tree. Within a hunch the films come in order; if the user says
 * "not for me" to the first (confirm) film, the hunch is dropped and its other films are skipped.
 */
export function nextHunchFilm(hunches: Hunch[], answers: Answer[]): { hunch: Hunch; film: HunchFilm } | null {
  for (const hunch of hunches) {
    const first = hunch.films[0];
    const firstAnswer = first && answerFor(answers, first.tmdbId);
    const droppedEarly = first?.role === 'confirm' && firstAnswer?.verdict === 'not';
    for (const film of hunch.films) {
      if (answerFor(answers, film.tmdbId)) continue;
      if (droppedEarly) break;
      return { hunch, film };
    }
  }
  return null;
}

/** confirmed = liked every film seen; dropped = liked none; narrowed = mixed; open = none seen. */
export function hunchStatus(hunch: Hunch, answers: Answer[]): HunchStatus {
  const seen = hunch.films
    .map((f) => answerFor(answers, f.tmdbId)?.verdict)
    .filter((v): v is Verdict => !!v && v !== 'unseen');
  if (!seen.length) return 'open';
  const likes = seen.filter(liked).length;
  if (likes === seen.length) return 'confirmed';
  if (likes === 0) return 'dropped';
  return 'narrowed';
}

/** True when the current picks clearly missed: mostly thumbs down. "Later" counts as a reaction, not a miss. */
export function picksMissed(pickIds: number[], reactions: PickReaction[]): boolean {
  const reacted = pickIds
    .map((id) => reactions.find((r) => r.film.tmdbId === id)?.reaction)
    .filter((r) => !!r)
    .slice(0, 5);
  return reacted.filter((r) => r === 'down').length >= MISSES_FOR_REFINE;
}
