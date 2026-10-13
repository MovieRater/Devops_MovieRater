import { Movie } from "../models/movie";

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

export async function getMovieDetails(id: number) {
    return tmdbFetch(`movie/${id}`);
}

export async function getMovieCredits(id: number) {
    return tmdbFetch(`movie/${id}/credits`);
}

export async function getExternalIds(id: number) {
    return tmdbFetch(`movie/${id}/external_ids`);
}

// -------------------------------------------------------------
// SAFE WRAPPER FOR EXTERNAL IDS (RETRY DETECTION)
// -------------------------------------------------------------

export async function safeGetExternalIds(id: number) {
    try {
        return await getExternalIds(id);
    } catch (err: any) {
        // Detect TMDB rate limit (429)
        if (err.message?.includes("429")) {
            console.warn(`TMDB rate limit hit for movie ${id}, will retry later.`);
            return { imdb_id: null, retryNeeded: true };
        }

        // Other errors should still throw
        throw err;
    }
}

export async function searchMovies(query: string) {
    return tmdbFetch(`search/movie?query=${encodeURIComponent(query)}`);
}

export async function getGenres() {
    return tmdbFetch("genre/movie/list");
}

// -------------------------------------------------------------
// MAPPING (TMDB → Movie)
// -------------------------------------------------------------

export function mapTmdbMovie(tmdb: any): Movie {
    return {
        id: tmdb.id,
        title: tmdb.title,
        year: parseInt(tmdb.release_date?.slice(0, 4)) || 0,

        // TMDB-only fields (placeholders until enrichment)
        director: "Unknown",
        duration: 0,
        rating: "N/A",
        views: "0M",
        summary: "",
        cast: [],
        language: "",
        country: "",
        imdbId: null,

        // Ratings will be filled by OMDB in movies.ts
        ratings: {
            imdb: 0,
            rottenTomatoes: 0,
            metacritic: 0,
        },

        posterUrl: tmdb.poster_path
            ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
            : "",

        genre: tmdb.genre_ids?.map((id: number) => id.toString()) || [],
    };
}

// -------------------------------------------------------------
// ENRICHMENT (TMDB DETAILS + CREDITS)
// -------------------------------------------------------------

export async function enrichTmdbMovie(movie: Movie): Promise<Movie> {
    const [details, credits, externalIds] = await Promise.all([
        getMovieDetails(movie.id),
        getMovieCredits(movie.id),
        getExternalIds(movie.id),
    ]);

    const director = credits.crew?.find((c: any) => c.job === "Director");
    const cast = credits.cast?.slice(0, 10).map((c: any) => c.name) || [];

    return {
        ...movie,
        director: director?.name || "Unknown",
        duration: details.runtime || 0,
        summary: details.overview || "",
        cast,
        language: details.original_language || "",
        country: details.origin_country?.[0] || "",
        imdbId: externalIds.imdb_id || null,
    };
}
