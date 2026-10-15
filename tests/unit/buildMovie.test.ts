import { describe, it, expect, vi } from 'vitest';
import { buildMovie } from '@/api/movies';

describe('buildMovie', () => {
    it('enriches a movie with TMDB + OMDB data', async () => {
        global.fetch = vi.fn(async (url: string) => {

            console.log("FETCH URL:", url);

            // TMDB: details
            if (url.includes('movie/123') && !url.includes('credits') && !url.includes('external_ids')) {
                return new Response(JSON.stringify({
                    runtime: 148,
                    overview: 'A mind-bending thriller',
                    original_language: 'en',
                    origin_country: ['US']
                }));
            }

            // TMDB: credits
            if (url.includes('movie/123/credits')) {
                return new Response(JSON.stringify({
                    crew: [{ job: 'Director', name: 'Christopher Nolan' }],
                    cast: [{ name: 'Leonardo DiCaprio' }]
                }));
            }

            // TMDB: external IDs
            if (url.includes('movie/123/external_ids')) {
                return new Response(JSON.stringify({
                    imdb_id: 'tt1375666'
                }));
            }

            // OMDB: mock
            if (url.includes('omdb')) {
                console.log("OMDB URL MATCHED:", url);

                return new Response(JSON.stringify({
                    Ratings: [
                        { Source: "Internet Movie Database", Value: "8.8/10" },
                        { Source: "Rotten Tomatoes", Value: "87%" },
                        { Source: "Metacritic", Value: "74/100" }
                    ]
                }));
            }

            throw new Error(`Unexpected URL: ${url}`);
        });

        // Simulate mapTmdbMovie output
        const baseMovie = {
            id: 123,
            title: 'Inception',
            year: 2010,
            posterUrl: '/poster.jpg',
            genre: ['Sci-Fi'],
            ratings: { imdb: 0, rottenTomatoes: 0, metacritic: 0 }
        };

        const movie = await buildMovie(baseMovie as any);

        // TMDB enrichments
        expect(movie.director).toBe('Christopher Nolan');
        expect(movie.cast).toEqual(['Leonardo DiCaprio']);
        expect(movie.duration).toBe(148);
        expect(movie.summary).toBe('A mind-bending thriller');
        expect(movie.language).toBe('en');
        expect(movie.country).toBe('US');
        expect(movie.imdbId).toBe('tt1375666');

        // OMDB enrichment
        expect(movie.ratings.imdb).toBe(8.8);
        expect(movie.ratings.rottenTomatoes).toBe(87);
        expect(movie.ratings.metacritic).toBe(74);

        // Fields buildMovie should NOT modify
        expect(movie.title).toBe('Inception');
        expect(movie.year).toBe(2010);
    });
});
