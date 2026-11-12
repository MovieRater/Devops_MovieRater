import { describe, expect, it } from 'vitest';
import type { Answer, Film, Hunch, PickReaction, Reaction, Verdict } from '@/models/taste';
import { hunchStatus, nextAnchor, nextHunchFilm, picksMissed } from '@/controllers/tasteGame';

const film = (tmdbId: number): Film => ({ tmdbId, title: `Film ${tmdbId}`, year: 2000, genres: [], posterPath: null });
const ans = (tmdbId: number, verdict: Verdict, source: Answer['source'] = 'hunch'): Answer =>
  ({ film: film(tmdbId), verdict, source, answeredAt: '' });

const react = (tmdbId: number, reaction: Reaction): PickReaction => ({ film: film(tmdbId), reaction, reactedAt: '' });

const hunch = (id: string, ids: number[]): Hunch => ({
  id, label: id, basis: '',
  films: ids.map((tmdbId, i) => ({ ...film(tmdbId), role: i === 0 ? 'confirm' : 'split', testing: '' })),
});

describe('nextAnchor', () => {
  const anchors = [1, 2, 3, 4, 5, 6, 7].map(film);

  it('skips answered anchors and stops after 5 real opinions', () => {
    const four = [1, 2, 3, 4].map((id) => ans(id, 'like', 'anchor'));
    expect(nextAnchor(anchors, four)?.tmdbId).toBe(5);
    expect(nextAnchor(anchors, [...four, ans(5, 'not', 'anchor')])).toBeNull();
  });

  it('does not count "haven\'t seen" as an opinion', () => {
    const answers = [ans(1, 'unseen', 'anchor'), ...[2, 3, 4, 5].map((id) => ans(id, 'super', 'anchor'))];
    expect(nextAnchor(anchors, answers)?.tmdbId).toBe(6);
  });
});

describe('nextHunchFilm', () => {
  const hunches = [hunch('a', [10, 11]), hunch('b', [20, 21])];

  it('walks films in order, hunch by hunch', () => {
    expect(nextHunchFilm(hunches, [])?.film.tmdbId).toBe(10);
    expect(nextHunchFilm(hunches, [ans(10, 'like')])?.film.tmdbId).toBe(11);
    expect(nextHunchFilm(hunches, [ans(10, 'like'), ans(11, 'not')])?.film.tmdbId).toBe(20);
  });

  it('drops a hunch when its confirm film is "not for me"', () => {
    expect(nextHunchFilm(hunches, [ans(10, 'not')])?.film.tmdbId).toBe(20);
  });

  it('tries the next film when the first is unseen', () => {
    expect(nextHunchFilm(hunches, [ans(10, 'unseen')])?.film.tmdbId).toBe(11);
  });

  it('returns null when every hunch is done', () => {
    expect(nextHunchFilm(hunches, [ans(10, 'not'), ans(20, 'like'), ans(21, 'like')])).toBeNull();
  });
});

describe('hunchStatus', () => {
  const h = hunch('a', [10, 11]);
  it.each([
    [[ans(10, 'super'), ans(11, 'like')], 'confirmed'],
    [[ans(10, 'like'), ans(11, 'not')], 'narrowed'],
    [[ans(10, 'not')], 'dropped'],
    [[ans(10, 'unseen'), ans(11, 'unseen')], 'open'],
    [[ans(10, 'unseen'), ans(11, 'like')], 'confirmed'],
  ] as [Answer[], string][])('%#: %s', (answers, expected) => {
    expect(hunchStatus(h, answers)).toBe(expected);
  });
});

describe('picksMissed', () => {
  const ids = [1, 2, 3, 4, 5, 6];
  it('is true after 3 thumbs down among the first 5 reacted picks', () => {
    expect(picksMissed(ids, [react(1, 'down'), react(2, 'down'), react(3, 'up')])).toBe(false);
    expect(picksMissed(ids, [react(1, 'down'), react(2, 'down'), react(3, 'later'), react(4, 'down')])).toBe(true);
  });

  it('ignores reactions to films that are not in the current picks', () => {
    expect(picksMissed(ids, [react(7, 'down'), react(8, 'down'), react(9, 'down')])).toBe(false);
  });
});
