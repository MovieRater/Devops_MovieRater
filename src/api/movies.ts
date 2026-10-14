import {
    getTrendingMovies,
    mapTmdbMovie,
    getMovieDetails,
    getMovieCredits,
    safeGetExternalIds
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

async function enrichMovieWithRetry(movie: Movie): Promise<Movie> {
    // Fetch TMDB details + credits
    const [details, credits] = await Promise.all([
        getMovieDetails(movie.id),
        getMovieCredits(movie.id)
    ]);

    // Fetch external IDs with retry detection
    const externalIds = await safeGetExternalIds(movie.id);

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
        retryNeeded: externalIds.retryNeeded || false
    };
}


// -------------------------------------------------------------
// MERGE TMDB + OMDB (INTERNAL ONLY)
// -------------------------------------------------------------

async function mergeMovieData(movie: Movie): Promise<Movie> {
    if (!movie.imdbId) {
        return movie;
    }

    try {
        const ratings = await getOmdbRatingsCached(movie.imdbId);
        return { ...movie, ratings };
    } catch (err) {
        console.error("OMDB merge failed:", err);
        return movie;
    }
}

// -------------------------------------------------------------
// SINGLE MOVIE PIPELINE (FOR MOVIE DETAILS SCREEN)
// -------------------------------------------------------------

export async function loadMovieDetails(id: number): Promise<Movie> {
    const [details, credits, externalIds] = await Promise.all([
        getMovieDetails(id),
        getMovieCredits(id),
        safeGetExternalIds(id)
    ]);

    const base = mapTmdbMovie(details);

    const enriched = {
        ...base,
        director: credits.crew?.find((c: any) => c.job === "Director")?.name || "Unknown",
        duration: details.runtime || 0,
        summary: details.overview || "",
        cast: credits.cast?.slice(0, 10).map((c: any) => c.name) || [],
        language: details.original_language || "",
        country: details.origin_country?.[0] || "",
        imdbId: externalIds.imdb_id || null,
        retryNeeded: externalIds.retryNeeded || false
    };

    return await mergeMovieData(enriched);
}


// -------------------------------------------------------------
// FULL TRENDING PIPELINE
// -------------------------------------------------------------

export async function loadTrendingMovies(): Promise<Movie[]> {
    // 1. Try cache
    const cached = loadCachedTrending();

    if (cached) {
        // Retry only incomplete movies
        const retryMovies = cached.filter(m => m.retryNeeded);

        if (retryMovies.length > 0) {
            console.log("Retrying incomplete movies:", retryMovies.length);

            for (const movie of retryMovies) {
                // Avoid rate limit
                await new Promise(r => setTimeout(r, 500));

                const externalIds = await safeGetExternalIds(movie.id);

                if (externalIds.imdb_id) {
                    const updated = await mergeMovieData({
                        ...movie,
                        imdbId: externalIds.imdb_id,
                        retryNeeded: false
                    });

                    const index = cached.findIndex(m => m.id === movie.id);
                    cached[index] = updated;
                }
            }

            saveTrendingCache(cached);
        }

        return cached;
    }

    // 2. Fetch TMDB trending
    const tmdbTrending = await getTrendingMovies();

    // 3. Map TMDB → Movie
    const mapped = tmdbTrending.results.map(mapTmdbMovie);

    // 4. Enrich TMDB details + external IDs (with retry detection)
    const enriched = await Promise.all(mapped.map(enrichMovieWithRetry));

    // 5. Merge OMDB ratings
    const merged = await Promise.all(enriched.map(mergeMovieData));

    // 6. Cache final merged movies
    saveTrendingCache(merged);

    return merged;
}
