export interface Rating {
  imdb: number;
  rottenTomatoes: number;
  metacritic: number;
}

export interface BasicMovie {
  id: number;
  title: string;
  year: number;
  posterUrl: string;
  genre: string[];
}

export interface TrendingMovie extends BasicMovie {
  director: string;
  ratings: Rating;
  imdbId: string | null;
  retryNeeded?: boolean;
}

export interface Movie extends TrendingMovie {
  duration: number;
  ageRating: string;
  summary: string;
  cast: string[];
  language: string;
  country: string;
}

export interface EnabledRatings {
  imdb: boolean;
  rottenTomatoes: boolean;
  metacritic: boolean;
}

export type Screen = 'home' | 'details';
