import { mockMovies } from '@/models/mockMovies';
import type { Movie } from '@/models/movie';

// Derive a genre id for every genre name used in the existing mock data
const names = Array.from(new Set(mockMovies.flatMap((m) => m.genre)));
export const fixtureGenres = names.map((name, i) => ({ id: i + 1, name }));

const idOf = (name: string) => String(fixtureGenres.find((g) => g.name === name)!.id);

// Same movies as before, but in the shape loadTrendingMovies returns them (genre ids)
export const fixtureTrending: Movie[] = mockMovies.map((m) => ({
  ...m,
  genre: m.genre.map(idOf),
}));