import { describe, expect, it, vi } from 'vitest';
import { TasteService } from '../../../server/ai/tasteService';
import { TmdbRepository } from '../../../server/ai/tmdbRepository';
import type { AiClient, HunchDraft, RecommendDraft } from '../../../server/ai/aiClient';
import type { Answer, Film, RecommendationsRequest, Verdict } from '../../../src/models/taste';

const film = (id: number): Film => ({ tmdbId: id, title: `Film ${id}`, year: 2000, genres: ['Drama'], posterPath: `/${id}.jpg` });
const answer = (id: number, verdict: Verdict): Answer => ({ film: film(id), verdict, source: 'anchor', answeredAt: '' });
const pick = (id: number) => ({ title: `Film ${id}`, year: 2000, reason: 'Fits your taste.' });
const request = (): RecommendationsRequest => ({ answers: [], hunches: [], reactions: [], vibe: { choices: [], refineChips: [] } });

function setup() {
  const ai = {
    mode: 'claude',
    proposeHunches: vi.fn<AiClient['proposeHunches']>().mockResolvedValue([]),
    recommend: vi.fn<AiClient['recommend']>().mockResolvedValue({ picks: [], note: { relevant: true, understood: '' } }),
  } satisfies AiClient;
  const tmdb = new TmdbRepository('https://tmdb.invalid', 'test-only');
  const director = vi.spyOn(tmdb, 'director').mockResolvedValue('A Director');
  const findFilm = vi.spyOn(tmdb, 'findFilm').mockImplementation(async (title) => film(Number(title.split(' ')[1])));
  return { ai, director, findFilm, service: new TasteService(ai, tmdb, []) };
}

describe('TasteService AI integration', () => {
  it('enriches hunch clues and removes answered, duplicate, invented and unresolvable films', async () => {
    const { ai, director, findFilm, service } = setup();
    const probe = (id: number) => ({ title: `Film ${id}`, year: 2000, role: 'confirm' as const, testing: 'Do you like this pace?' });
    const draft = (ids: number[]): HunchDraft => ({ label: 'Slow drama', basis: 'You liked the pace', films: ids.map(probe) });
    ai.proposeHunches.mockResolvedValue([draft([1, 2, 2, 90, 91]), draft([2, 3]), draft([1])]);
    findFilm.mockImplementation(async (title) => {
      const id = Number(title.split(' ')[1]);
      if (id === 90) return null;
      if (id === 91) throw new Error('TMDB unavailable');
      return film(id);
    });
    const result = await service.hunches([answer(1, 'unseen')]);
    expect(director).toHaveBeenCalledWith(1);
    expect(ai.proposeHunches).toHaveBeenCalledWith({ clues: [{ title: 'Film 1', year: 2000, genres: ['Drama'], director: 'A Director', verdict: 'unseen', hunchLabel: undefined }] });
    expect(result).toEqual({ mode: 'claude', hunches: [
      { id: 'h1', label: 'Slow drama', basis: 'You liked the pace', films: [{ ...film(2), role: 'confirm', testing: 'Do you like this pace?' }] },
      { id: 'h2', label: 'Slow drama', basis: 'You liked the pace', films: [{ ...film(3), role: 'confirm', testing: 'Do you like this pace?' }] },
    ] });
  });

  it('excludes ratings and all reacted picks while keeping unseen films eligible', async () => {
    const { ai, service } = setup();
    ai.recommend.mockResolvedValue({ picks: [1, 2, 3, 4, 5, 6, 7, 7, 8].map(pick), note: { relevant: true, understood: '' } });
    const req = request();
    req.answers = [answer(1, 'like'), answer(2, 'super'), answer(3, 'not'), answer(4, 'unseen')];
    req.reactions = ([['up', 5], ['down', 6], ['later', 7]] as const).map(([reaction, id]) => ({ film: film(id), reaction, reactedAt: '' }));
    expect((await service.recommendations(req)).picks).toEqual([4, 8].map((id) => ({ ...film(id), reason: 'Fits your taste.' })));
  });

  it('passes hunch labels, statuses, vibe and reactions to the AI', async () => {
    const { ai, service } = setup();
    const req = request();
    req.answers = [{ ...answer(1, 'super'), source: 'hunch', hunchId: 'h1' }];
    req.hunches = [{ hunch: { id: 'h1', label: 'Quiet drama', basis: '', films: [] }, status: 'narrowed' }];
    req.vibe = { choices: ['calm'], refineChips: ['short'], refineText: 'Hopeful' };
    req.reactions = [{ film: film(2), reaction: 'later', reactedAt: '' }];
    await service.recommendations(req);
    expect(ai.recommend).toHaveBeenCalledWith({
      clues: [{ title: 'Film 1', year: 2000, genres: ['Drama'], director: 'A Director', verdict: 'super', hunchLabel: 'Quiet drama' }],
      patterns: [{ label: 'Quiet drama', status: 'narrowed' }], vibe: req.vibe,
      reactions: [{ title: 'Film 2', year: 2000, genres: ['Drama'], reaction: 'later' }],
    });
  });

  it('drops failed verifications, deduplicates TMDB IDs, and caps picks and reasons', async () => {
    const { ai, findFilm, service } = setup();
    ai.recommend.mockResolvedValue({ picks: Array.from({ length: 16 }, (_, i) => ({ ...pick(i), reason: 'x'.repeat(201) })), note: { relevant: true, understood: '' } });
    findFilm.mockImplementation(async (title) => {
      const id = Number(title.split(' ')[1]);
      if (id === 0) return null;
      if (id === 1) throw new Error('TMDB unavailable');
      return film(id === 3 ? 2 : id);
    });
    const { picks } = await service.recommendations(request());
    expect(picks.map((p) => p.tmdbId)).toEqual([2, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(picks.every((p) => p.reason === `${'x'.repeat(199)}…`)).toBe(true);
  });

  it.each([
    [undefined, { relevant: true, understood: 'calm' }, undefined],
    ['   ', { relevant: true, understood: 'calm' }, undefined],
    ['unrelated question', { relevant: false, understood: 'discard this' }, { relevant: false, understood: '' }],
    ['calm', { relevant: true, understood: 'x'.repeat(90) }, { relevant: true, understood: 'x'.repeat(80) }],
  ])('handles the note for %s', async (refineText, note, expected) => {
    const { ai, service } = setup();
    ai.recommend.mockResolvedValue({ picks: [], note } as RecommendDraft);
    const req = request();
    req.vibe.refineText = refineText;
    expect((await service.recommendations(req)).note).toEqual(expected);
  });

  it('propagates AI failures for both operations', async () => {
    const { ai, service } = setup();
    const error = new Error('AI unavailable');
    ai.proposeHunches.mockRejectedValue(error);
    ai.recommend.mockRejectedValue(error);
    await expect(service.hunches([])).rejects.toBe(error);
    await expect(service.recommendations(request())).rejects.toBe(error);
  });
});
