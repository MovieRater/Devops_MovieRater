import type { Film } from '../../src/models/taste';

interface TmdbSearchResult {
  id: number;
  title: string;
  release_date?: string;
  genre_ids: number[];
  poster_path: string | null;
  vote_count: number;
}

interface TmdbDetails {
  credits?: { crew: { job: string; name: string }[] };
}

/** TMDB access for the AI server: verifies titles the AI suggests and adds details for prompts. */
export class TmdbRepository {
  private genreNames: Promise<Record<number, string>> | null = null;
  private directors = new Map<number, Promise<string | null>>();

  constructor(private baseUrl: string, private apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}/${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`TMDB ${res.status} for ${path.split('?')[0]}`);
    return res.json() as Promise<T>;
  }

  private genres(): Promise<Record<number, string>> {
    this.genreNames ??= this.get<{ genres: { id: number; name: string }[] }>('genre/movie/list')
      .then((r) => Object.fromEntries(r.genres.map((g) => [g.id, g.name])));
    return this.genreNames;
  }

  /**
   * Finds the film the AI meant. Returns null for films that don't exist, so invented
   * titles are dropped. The year may be off by one (festival vs. release year).
   */
  async findFilm(title: string, year?: number): Promise<Film | null> {
    const q = encodeURIComponent(title);
    const { results } = await this.get<{ results: TmdbSearchResult[] }>(`search/movie?query=${q}`);
    const yearOf = (r: TmdbSearchResult) => Number(r.release_date?.slice(0, 4)) || 0;
    const candidates = results.filter((r) => !year || Math.abs(yearOf(r) - year) <= 1);
    const best = candidates.sort((a, b) => b.vote_count - a.vote_count)[0];
    if (!best) return null;
    const names = await this.genres();
    return {
      tmdbId: best.id,
      title: best.title,
      year: yearOf(best),
      genres: best.genre_ids.map((id) => names[id]).filter(Boolean),
      posterPath: best.poster_path,
    };
  }

  /** Director name for prompt context; cached, and never fails the request. */
  director(tmdbId: number): Promise<string | null> {
    if (!this.directors.has(tmdbId)) {
      this.directors.set(
        tmdbId,
        this.get<TmdbDetails>(`movie/${tmdbId}?append_to_response=credits`)
          .then((d) => d.credits?.crew.find((c) => c.job === 'Director')?.name ?? null)
          .catch(() => null),
      );
    }
    return this.directors.get(tmdbId)!;
  }
}
