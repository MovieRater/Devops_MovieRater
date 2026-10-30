export interface Rating {
  imdb: number;
  rottenTomatoes: number;
  metacritic: number;
}

export interface Movie {
  id: number;
  title: string;
  year: number;
  director: string;
  duration: number;
  rating: string;
  views: string;
  summary: string;
  genre: string[];
  cast: string[];
  language: string;
  country: string;
  ratings: Rating;
  posterUrl: string;
  imdbId: string | null;
  retryNeeded?: boolean;
}

export interface EnabledRatings {
  imdb: boolean;
  rottenTomatoes: boolean;
  metacritic: boolean;
}

export interface MoviePreview {
  id: number;
  title: string;
  year: number;
  posterUrl: string;
}

export type Screen = 'home' | 'details';
