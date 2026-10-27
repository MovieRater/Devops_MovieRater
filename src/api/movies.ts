import {
    getTrendingMovies,
    mapTmdbMovie,
    getMovieDetails,
    getMovieCredits,
    safeGetExternalIds,
    TmdbCrewMember,
    TmdbCastMember,
    TmdbMovieDetails,
    SafeExternalIdsResponse
} from "./tmdb";

import { getOmdbRatingsCached } from "./omdb";

import { Movie } from "@/models/movie";

import {
    loadCache,
    saveCache,
    isCacheExpired,
    updateCacheTimestamp
} from "./cache";


// -------------------------------------------------------------
// UNIFIED MOVIE PIPELINE (TMDB + OMDB + RETRY)
// -------------------------------------------------------------

export async function buildMovie(movie: Movie): Promise<Movie> {
    let retryNeeded = false;

    // 1. TMDB enrichment (details + credits + external IDs)
    let details:
        TmdbMovieDetails;
    let credits;
    let externalIds:
        SafeExternalIdsResponse

    try {
        [details, credits] = await Promise.all([
            getMovieDetails(movie.id),
            getMovieCredits(movie.id)
        ]);

        externalIds = await safeGetExternalIds(movie.id);

        if (externalIds.retryNeeded) {
            retryNeeded = true;
        }
    } catch (err) {
        console.warn(`TMDB failed for movie ${movie.id}:`, err);
        retryNeeded = true;

        // Return partial movie, retry later
        return { ...movie, retryNeeded };
    }

    const director = credits.crew?.find((c: TmdbCrewMember) => c.job === "Director")?.name || "Unknown";
    const cast = credits.cast?.slice(0, 10).map((c: TmdbCastMember) => c.name) || [];

    let enriched: Movie = {
        ...movie,
        director,
        duration: details.runtime || 0,
        summary: details.overview || "",
        cast,
        language: details.original_language || "",
        country: details.origin_country?.[0] || "",
        imdbId: externalIds.imdb_id || null,
        retryNeeded
    };

    // 2. OMDB enrichment (ratings)
    if (!enriched.imdbId) {
        // No IMDB ID → cannot fetch OMDB → retry later
        return enriched;
    }

    try {
        const ratings = await getOmdbRatingsCached(enriched.imdbId);
        enriched = { ...enriched, ratings };
    } catch (err) {
        console.warn(`OMDB failed for movie ${movie.id}:`, err);
        enriched.retryNeeded = true;
    }

    return enriched;
}


// -------------------------------------------------------------
// TRENDING CACHE CONFIG
// -------------------------------------------------------------

const TRENDING_CACHE_KEY = "tmdb_trending_cache";
const TRENDING_CACHE_TIME_KEY = "tmdb_trending_cache_time";
const TRENDING_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadCachedTrending(): Movie[] | null {
    if (isCacheExpired(TRENDING_CACHE_TIME_KEY, TRENDING_TTL_MS)) {
        return null;
    }

    return loadCache<Movie[]>(TRENDING_CACHE_KEY);
}

function saveTrendingCache(movies: Movie[]) {
    saveCache(TRENDING_CACHE_KEY, movies);
    updateCacheTimestamp(TRENDING_CACHE_TIME_KEY);
}

// -------------------------------------------------------------
// SINGLE MOVIE PIPELINE (DETAILS SCREEN)
// -------------------------------------------------------------

export async function loadMovieDetails(id: number): Promise<Movie> {
    const base = { id } as Movie;
    return await buildMovie(base);
}


// -------------------------------------------------------------
// FULL TRENDING PIPELINE
// -------------------------------------------------------------

export async function loadTrendingMovies(): Promise<Movie[]> {
    // 1. Try cache
    const cached = loadCachedTrending();

    if (cached) {
        const retryMovies = cached.filter(m => m.retryNeeded);

        if (retryMovies.length > 0) {
            console.log("Retrying incomplete movies:", retryMovies.length);

            for (const movie of retryMovies) {
                await new Promise(r => setTimeout(r, 500)); // avoid rate limit

                const updated = await buildMovie(movie);

                const index = cached.findIndex(m => m.id === movie.id);
                cached[index] = updated;
            }

            saveTrendingCache(cached);
        }

        return cached;
    }

    // 2. Fetch TMDB trending
    const tmdbTrending = await getTrendingMovies();

    // 3. Map TMDB → Movie
    const mapped = tmdbTrending.results.map(mapTmdbMovie);

    // 4. Build complete movies (TMDB + OMDB)
    const finalMovies = await Promise.all(mapped.map(buildMovie));

    // 5. Cache final movies
    saveTrendingCache(finalMovies);

    return finalMovies;
}
