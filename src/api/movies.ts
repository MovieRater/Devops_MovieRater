import {
    getTrendingMovies,
    getMovieCredits,
    safeGetExternalIds,
    TmdbCrewMember,
    SafeExternalIdsResponse,
    mapTmdbBasicMovie
} from "./tmdb";

import { getOmdbRatingsCached } from "./omdb";

import {
    BasicMovie,
    TrendingMovie
} from "@/models/movie";

import {
    loadCache,
    saveCache,
    isCacheExpired,
    updateCacheTimestamp
} from "./cache";


// -------------------------------------------------------------
// UNIFIED MOVIE PIPELINE (TMDB + OMDB + RETRY)
// -------------------------------------------------------------

export async function buildTrendingMovie(movie: BasicMovie): Promise<TrendingMovie> {

    let retryNeeded = false;
    let credits;
    let externalIds:
        SafeExternalIdsResponse

    try {
        [credits, externalIds] = await Promise.all([
            getMovieCredits(movie.id),
            safeGetExternalIds(movie.id)
        ]);

        if (externalIds.retryNeeded) {
            retryNeeded = true;
        }
    } catch (err) {
        console.warn(`TMDB failed for movie ${movie.id}:`, err);

        // Return partial movie, retry later
        return {
            ...movie,
            director: "Unknown",

            imdbId: null,

            ratings: {
                imdb: 0,
                rottenTomatoes: 0,
                metacritic: 0
            },
            retryNeeded: true
        };
    }

    const director =
        credits.crew?.find(
            (c: TmdbCrewMember) => c.job === "Director"
        )?.name || "Unknown";

    let enriched: TrendingMovie = {
        ...movie,
        director,
        imdbId: externalIds.imdb_id || null,

        ratings: {
            imdb: 0,
            rottenTomatoes: 0,
            metacritic: 0
        },

        retryNeeded
    };

    // 2. OMDB enrichment (ratings)
    if (!enriched.imdbId) {
        // No IMDB ID → cannot fetch OMDB → retry later
        return enriched;
    }

    try {
        const ratings =
            await getOmdbRatingsCached(
                enriched.imdbId
            );

        enriched = {
            ...enriched,
            ratings
        };

    } catch {
        console.warn(`OMDB failed for movie ${movie.id}:`);
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

function loadCachedTrending(): TrendingMovie[] | null {
    if (isCacheExpired(TRENDING_CACHE_TIME_KEY, TRENDING_TTL_MS)) {
        return null;
    }

    return loadCache<TrendingMovie[]>(TRENDING_CACHE_KEY);
}

function saveTrendingCache(movies: TrendingMovie[]) {
    saveCache(TRENDING_CACHE_KEY, movies);
    updateCacheTimestamp(TRENDING_CACHE_TIME_KEY);
}

// -------------------------------------------------------------
// FULL TRENDING PIPELINE
// -------------------------------------------------------------

export async function loadTrendingMovies(): Promise<TrendingMovie[]> {
    // 1. Try cache
    const cached = loadCachedTrending();

    if (cached) {
        const retryMovies = cached.filter(m => m.retryNeeded);

        if (retryMovies.length > 0) {
            console.log("Retrying incomplete movies:", retryMovies.length);

            for (const movie of retryMovies) {
                await new Promise(r => setTimeout(r, 500)); // avoid rate limit

                const updated = await buildTrendingMovie(movie);

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
    const mapped = tmdbTrending.results.map(mapTmdbBasicMovie);

    // 4. Build complete movies (TMDB + OMDB)
    const finalMovies = await Promise.all(mapped.map(buildTrendingMovie));

    // 5. Cache final movies
    saveTrendingCache(finalMovies);

    return finalMovies;
}

