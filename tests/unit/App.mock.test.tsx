import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';

// Movie UI tests use a signed-out session and never initialize real authentication.
vi.mock('@/controllers/AuthProvider', () => ({
  useAuth: () => ({ user: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }),
}));

const search = (query: string) => {
  fireEvent.change(screen.getByPlaceholderText('Search for movies, directors...'), {
    target: { value: query },
  });
};
const titles = () => screen.queryAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);

describe('MovieRater existing UI integration', () => {
  it('searches titles and directors case-insensitively, then restores the home screen', () => {
    render(<App />);
    expect(titles()).toEqual(['Superman', 'The Fantastic 4: First Steps', 'Inception', 'Nobody 2', 'Weapons']);
    search('sUPERman');
    expect(titles()).toEqual(['Superman']);
    search('christopher nolan');
    expect(titles()).toEqual(['The Dark Knight', 'Inception']);
    search('');
    expect(screen.getByRole('heading', { name: 'Trending Movies' })).toBeTruthy();
    expect(titles()).toHaveLength(5);
  });

  it('shows the empty search message when no title or director matches', () => {
    render(<App />);
    search('a movie that does not exist');
    expect(titles()).toEqual([]);
    expect(screen.getByText('Try a different title or director name')).toBeTruthy();
  });

  it('combines genre, year and minimum rating, and clears the filters', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Action' }));
    fireEvent.click(screen.getByRole('button', { name: '2025' }));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '7.5' } });
    expect(titles()).toEqual(['Superman']);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '9.5' } });
    expect(screen.getByText('No movies match your filters')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(titles()).toHaveLength(5);
  });

  it('opens movie details and returns to the current search', () => {
    render(<App />);
    search('Inception');
    fireEvent.click(screen.getByRole('button', { name: /Inception.*Directed by/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Inception' })).toBeTruthy();
    expect(screen.getAllByText('148 min')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(titles()).toEqual(['Inception']);
    expect(screen.getByPlaceholderText('Search for movies, directors...')).toHaveProperty('value', 'Inception');
  });
});
