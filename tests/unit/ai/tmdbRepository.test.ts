import { describe, expect, it, vi } from 'vitest';
import { TmdbRepository } from '../../../server/ai/tmdbRepository';

const result = (id: number, release_date: string, vote_count: number) => ({
  id, title: `Film ${id}`, release_date, vote_count, genre_ids: [18, 999], poster_path: `/${id}.jpg`,
});
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const repository = () => new TmdbRepository('https://tmdb.invalid/3/', 'test-token');

// The shared setup forbids network calls; each test supplies only its expected responses.
describe('TmdbRepository', () => {
  it('encodes titles, authenticates, and selects the most popular match within one year', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(ok({ results: [result(1, '1997-01-01', 1000), result(2, '1999-01-01', 50), result(3, '2001-01-01', 100)] }))
      .mockResolvedValueOnce(ok({ genres: [{ id: 18, name: 'Drama' }] }));
    expect(await repository().findFilm('A & B', 2000)).toEqual({ tmdbId: 3, title: 'Film 3', year: 2001, genres: ['Drama'], posterPath: '/3.jpg' });
    expect(fetch).toHaveBeenNthCalledWith(1, 'https://tmdb.invalid/3/search/movie?query=A%20%26%20B', { headers: { Authorization: 'Bearer test-token' } });
  });

  it.each([{ results: [] }, { results: [result(1, '1990-01-01', 100)] }, { results: [result(1, '', 100)] }])('returns null for results outside the requested year: $results', async ({ results }) => {
    vi.mocked(fetch).mockResolvedValueOnce(ok({ results }));
    expect(await repository().findFilm('Missing', 2000)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shares one genre lookup across concurrent film verifications', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(ok({ results: [result(1, '2000-01-01', 1)] }))
      .mockResolvedValueOnce(ok({ results: [result(2, '2000-01-01', 1)] }))
      .mockResolvedValueOnce(ok({ genres: [{ id: 18, name: 'Drama' }] }));
    const repo = repository();
    const films = await Promise.all([repo.findFilm('One', 2000), repo.findFilm('Two', 2000)]);
    expect(films.map((f) => f?.genres)).toEqual([['Drama'], ['Drama']]);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('genre/movie/list'))).toHaveLength(1);
  });

  it('reports HTTP errors without including the API token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(repository().findFilm('Film', 2000)).rejects.toThrow('TMDB 503 for search/movie');
  });

  it('finds the director among crew members and caches concurrent requests', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ok({ credits: { crew: [{ job: 'Writer', name: 'Writer' }, { job: 'Director', name: 'Director' }] } }));
    const repo = repository();
    expect(await Promise.all([repo.director(1), repo.director(1)])).toEqual(['Director', 'Director']);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('https://tmdb.invalid/3/movie/1?append_to_response=credits', { headers: { Authorization: 'Bearer test-token' } });
  });

  it('returns null when credits have no director', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ok({ credits: { crew: [] } }));
    expect(await repository().director(1)).toBeNull();
  });

  it('tolerates and caches failed director lookups', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Offline'));
    const repo = repository();
    expect(await repo.director(1)).toBeNull();
    expect(await repo.director(1)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
