// -------------------------------------------------------------
// CONFIG
// -------------------------------------------------------------

const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY;
const OMDB_BASE_URL = "https://www.omdbapi.com";

if (!OMDB_API_KEY) {
    console.error("OMDB_API_KEY is missing. Check your .env.");
}

// -------------------------------------------------------------
// BASE FETCH WRAPPER
// -------------------------------------------------------------

async function omdbFetch(params: Record<string, string>) {
    const url = new URL(OMDB_BASE_URL);
    url.searchParams.set("apikey", OMDB_API_KEY);

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }

    const res = await fetch(url.toString());

    if (!res.ok) {
        throw new Error(`OMDB error: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();

    // OMDB returns { Response: "False", Error: "Movie not found!" }
    if (json.Response === "False") {
        throw new Error(json.Error || "Unknown OMDB error");
    }

    return json;
}

// -------------------------------------------------------------
// PUBLIC API FUNCTIONS
// -------------------------------------------------------------

export async function getOmdbByImdbId(imdbId: string) {
    return omdbFetch({ i: imdbId });
}

// -------------------------------------------------------------
// RATING PARSER
// -------------------------------------------------------------

export type OmdbRatings = {
    imdb: number;
    rottenTomatoes: number;
    metacritic: number;
};

export function mapOmdbRatings(omdb: any): OmdbRatings {
    const ratingsArray = omdb.Ratings || [];

    let imdb = 0;
    let rottenTomatoes = 0;
    let metacritic = 0;

    for (const r of ratingsArray) {
        if (r.Source === "Internet Movie Database") {
            imdb = parseFloat(r.Value.split("/")[0]) || 0;
        } else if (r.Source === "Rotten Tomatoes") {
            rottenTomatoes = parseFloat(r.Value.replace("%", "")) || 0;
        } else if (r.Source === "Metacritic") {
            metacritic = parseFloat(r.Value.split("/")[0]) || 0;
        }
    }

    return { imdb, rottenTomatoes, metacritic };
}

// -------------------------------------------------------------
// LOCAL CACHE (OMDB HAS STRICT LIMITS)
// -------------------------------------------------------------

const OMDB_CACHE_KEY = "omdb_cache";

function loadOmdbCache(): Record<string, OmdbRatings> {
    try {
        return JSON.parse(localStorage.getItem(OMDB_CACHE_KEY) || "{}");
    } catch {
        return {};
    }
}

function saveOmdbCache(cache: Record<string, OmdbRatings>) {
    localStorage.setItem(OMDB_CACHE_KEY, JSON.stringify(cache));
}

// -------------------------------------------------------------
// CACHED LOOKUP
// -------------------------------------------------------------

export async function getOmdbRatingsCached(imdbId: string): Promise<OmdbRatings> {
    const cache = loadOmdbCache();

    if (cache[imdbId]) {
        return cache[imdbId];
    }

    try {
        const omdb = await getOmdbByImdbId(imdbId);
        const ratings = mapOmdbRatings(omdb);

        cache[imdbId] = ratings;
        saveOmdbCache(cache);

        return ratings;
    } catch (err) {
        console.error(`OMDB fetch failed for ${imdbId}:`, err);

        // Fallback: return empty ratings
        return { imdb: 0, rottenTomatoes: 0, metacritic: 0 };
    }
}
