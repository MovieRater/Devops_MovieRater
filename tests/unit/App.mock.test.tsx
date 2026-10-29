import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';

// Movie UI tests use a signed-out session and never initialize real authentication.
vi.mock('@/controllers/AuthProvider', () => ({
  useAuth: () => ({ user: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }),
}));

// The data layer is mocked, so no test touches TMDB, OMDB or the network.
vi.mock('@/api/movies', async () => {
  const { fixtureTrending } = await import('../helpers/tmdbFixtures');
  return {
    loadTrendingMovies: vi.fn(async () => fixtureTrending),
    loadMovieDetails: vi.fn(async (id: number) => fixtureTrending.find((m) => m.id === id)),
  };
});

vi.mock('@/api/tmdb', async () => {
  const { fixtureGenres } = await import('../helpers/tmdbFixtures');
  return { getGenres: vi.fn(async () => ({ genres: fixtureGenres })) };
});

const SEARCH_PLACEHOLDER = 'Search for movies, directors...';
const TOTAL_MOVIES = 6; // the five originals plus The Dark Knight, which is no longer excluded


const search = (query: string) => {
  fireEvent.change(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), {
    target: { value: query },
  });
};

const titles = () => 
  screen.queryAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);

// Movies and genres load asynchronously, so every test starts by waiting for the home screen.
const renderLoaded = async () => {
  render(<App />);
  await waitFor(() => expect(titles()).toHaveLength(TOTAL_MOVIES));
};

describe('MovieRater existing UI integration', () => {
  it('searches titles and directors case-insensitively, then restores the home screen', async () => {
    await renderLoaded();
    search('sUPERman');
    await waitFor(() => expect(titles()).toEqual(['Superman']));
    search('christopher nolan');
    await waitFor(() => expect(titles()).toEqual(['The Dark Knight', 'Inception']));
    search('');
    expect(screen.getByRole('heading', { name: 'Trending Movies' })).toBeTruthy();
    await waitFor(() => expect(titles()).toHaveLength(TOTAL_MOVIES));
  });

  it('shows the empty search message when no title or director matches', async () => {
    await renderLoaded();
    search('a movie that does not exist');
    await waitFor(() => expect(titles()).toEqual([]));
    expect(screen.getByText('Try a different title or director name')).toBeTruthy();
  });

  it('combines genre, year and minimum rating, and clears the filters', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    // Genre and year buttons come from async state, so wait for them to appear.
    fireEvent.click(await screen.findByRole('button', { name: 'Action' }));
    fireEvent.click(await screen.findByRole('button', { name: '2025' }));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '7.5' } });
    await waitFor(() => expect(titles()).toEqual(['Superman']));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '9.5' } });
    expect(await screen.findByText('No movies match your filters')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(titles()).toHaveLength(TOTAL_MOVIES));
  });

  it('opens movie details and returns to the current search', async () => {
    await renderLoaded();
    search('Inception');
    fireEvent.click(await screen.findByRole('button', { name: /Inception.*Directed by/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Inception' })).toBeTruthy();
    expect(screen.getAllByText('148 min')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(titles()).toEqual(['Inception']));
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toHaveProperty('value', 'Inception');
  });
});
