import {BasicMovie} from "../models/movie";


export interface TmdbExternalIdsResponse {
    imdb_id: string | null;
}

export interface SafeExternalIdsResponse
    extends TmdbExternalIdsResponse {
    retryNeeded?: boolean;
}

export interface TmdbMovieDetails {
    runtime: number;
    overview: string;
    original_language: string;
    origin_country: string[];
}

export interface TmdbBasicMovie {
    id: number;
    title: string;
    release_date: string;
    poster_path: string | null;
    genre_ids: number[];
}

export interface TmdbSearchResponse
{
    results: TmdbBasicMovie[];
}

export interface TmdbCrewMember {
    name: string;
    job: string;
}

export interface TmdbCastMember {
    name: string;
}

export interface TmdbCreditsResponse {
    crew: TmdbCrewMember[];
    cast: TmdbCastMember[];
}

export interface TmdbGenre {
    id: number;
    name: string;
}

export interface TmdbGenreResponse {
    genres: TmdbGenre[];
}

// -------------------------------------------------------------
// CONFIG
// -------------------------------------------------------------

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB_BASE_URL = import.meta.env.VITE_TMDB_BASE_URL;

if (!TMDB_API_KEY) {
    console.error("TMDB_API_KEY is missing. Check your .env.");
}

if (!TMDB_BASE_URL) {
    console.error("TMDB_BASE_URL is missing. Check your .env.");
}

// -------------------------------------------------------------
// BASE FETCH WRAPPER
// -------------------------------------------------------------

async function tmdbFetch(endpoint: string) {
    const url = `${TMDB_BASE_URL}/${endpoint}`;

    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${TMDB_API_KEY}`,
            "Content-Type": "application/json",
        },
    });

    if (!res.ok) {
        throw new Error(`TMDB error: ${res.status} ${res.statusText}`);
    }

    return res.json();
}

// -------------------------------------------------------------
// PUBLIC API FUNCTIONS (TMDB ONLY)
// -------------------------------------------------------------

export async function getTrendingMovies() {
    return tmdbFetch("trending/movie/week");
}

export async function getMovieDetails(
    id: number
): Promise<TmdbMovieDetails> {
    return tmdbFetch(`movie/${id}`);
}

export async function getMovieCredits(
    id: number
): Promise<TmdbCreditsResponse> {
    return tmdbFetch(`movie/${id}/credits`);
}

export async function getExternalIds(
    id: number
): Promise<TmdbExternalIdsResponse> {
    return tmdbFetch(`movie/${id}/external_ids`);
}

export async function searchMovies(
    query: string
): Promise<TmdbSearchResponse> {
    return tmdbFetch(`search/movie?query=${encodeURIComponent(query)}`);
}

export async function getGenres(): Promise<TmdbGenreResponse> {
    return tmdbFetch("genre/movie/list");
}

// -------------------------------------------------------------
// SAFE WRAPPER FOR EXTERNAL IDS (RETRY DETECTION)
// -------------------------------------------------------------

export async function safeGetExternalIds(
    id: number
): Promise<SafeExternalIdsResponse> {
    try {
        return await getExternalIds(id);
    } catch (err: unknown) {
        // Detect TMDB rate limit (429)
        if (
            err instanceof Error &&
            err.message.includes("429")
        ) {
            console.warn(`TMDB rate limit hit for movie ${id}, will retry later.`);
            return { imdb_id: null, retryNeeded: true };
        }

        // Other errors should still throw
        throw err;
    }
}

// -------------------------------------------------------------
// MAPPING (TMDB → Movie)
// -------------------------------------------------------------

export function mapTmdbBasicMovie(
    tmdb: TmdbBasicMovie
): BasicMovie {
    return {
        id: tmdb.id,
        title: tmdb.title,
        year: parseInt(
            tmdb.release_date?.slice(0, 4)) || 0,
        posterUrl: tmdb.poster_path
            ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
            : "",
        genre: tmdb.genre_ids?.map((id: number) => id.toString()) || [],
    };
}
