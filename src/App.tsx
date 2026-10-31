import { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './views/components/Header';
import { RatingCard } from './views/components/RatingCard';
import { MovieDetailsScreen } from './views/screens/MovieDetailsScreen';
import { FilterBar, FilterOptions } from './views/components/FilterBar';
import { BasicMovie, TrendingMovie, Movie, EnabledRatings, Screen } from './models/movie';
import { useAuth } from './controllers/AuthProvider';
import { loadTrendingMovies, loadSearchResults, loadMovieDetails, setGenreMap as setMovieGenreMap } from "@/api/movies";
import { getGenres, TmdbGenre } from "@/api/tmdb";






export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BasicMovie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [filters, setFilters] = useState<FilterOptions>({
    genres: [],
    years: [],
    minRating: 0,
    sortBy: 'year',
    sortOrder: 'desc'
  });
  const [enabledRatings, setEnabledRatings] = useState<EnabledRatings>({
    imdb: true,
    rottenTomatoes: true,
    metacritic: true
  });
  const { user, loading, signIn, signOut } = useAuth();
  const [trendingMovies, setTrendingMovies] = useState<TrendingMovie[]>([]);
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);
  const [genreMap, setGenreMap] = useState<Record<number, string>>({});



  // Load enabled ratings from localStorage on mount
  useEffect(() => {
    const savedRatings = localStorage.getItem('enabledRatings');
    if (savedRatings) {
      setEnabledRatings(JSON.parse(savedRatings));
    }
  }, []);

  // Save enabled ratings to localStorage when changed
  const handleRatingsChange = (newRatings: EnabledRatings) => {
    setEnabledRatings(newRatings);
    localStorage.setItem('enabledRatings', JSON.stringify(newRatings));
  };

  // Scroll to top when screen changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentScreen]);


  useEffect(() => {
    async function loadTrending() {
      const movies = await loadTrendingMovies();

      setTrendingMovies(movies);
    }

    loadTrending();
  }, [genreMap]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const results = await loadSearchResults(searchQuery);
        setSearchResults(results);
      } catch (err) {
        console.error("Search failed:", err);
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    async function loadGenres() {
      const data = await getGenres();

      const map: Record<number, string> = {};
      data.genres.forEach((g: TmdbGenre) => {
        map[g.id] = g.name;
      });

      setGenreMap(map);
      setMovieGenreMap(map);
      setAvailableGenres(data.genres.map((g: TmdbGenre) => g.name));
    }

    loadGenres();
  }, []);


  const availableYears = useMemo(() => {
    const years = trendingMovies
      .map(m => m.year)
      .filter(y => y > 0);

    return Array.from(new Set(years)).sort((a, b) => b - a);
  }, [trendingMovies]);




  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleSelectTrendingMovie = async (
    movie: TrendingMovie
  ) => {

    const fullMovie =
        await loadMovieDetails(movie);

    setSelectedMovie(fullMovie);
    setCurrentScreen('details');
  };

  const handleSelectSearchResult = async (
    preview: BasicMovie
  ) => {
    const movie = await loadMovieDetails(preview);

    console.log(movie);

    setSelectedMovie(movie);
    setCurrentScreen('details')
  };

  const handleBack = () => {
    if (currentScreen === 'details') {
      setCurrentScreen('home');
    }
  };

  // Apply filters and sorting
  const applyFilters = useCallback((movies: TrendingMovie[]) => {
    let filtered = [...movies];

    if (filters.genres.length > 0) {
      filtered = filtered.filter(movie =>
        movie.genre.some(g => filters.genres.includes(g))
      );
    }

    if (filters.years.length > 0) {
      filtered = filtered.filter(movie => filters.years.includes(movie.year));
    }

    if (filters.minRating > 0) {
      filtered = filtered.filter(movie => movie.ratings.imdb >= filters.minRating);
    }

    filtered.sort((a, b) => {
      let comparison = 0;

      switch (filters.sortBy) {
        case 'imdb':
          comparison = a.ratings.imdb - b.ratings.imdb;
          break;
        case 'rottenTomatoes':
          comparison = a.ratings.rottenTomatoes - b.ratings.rottenTomatoes;
          break;
        case 'metacritic':
          comparison = a.ratings.metacritic - b.ratings.metacritic;
          break;
        case 'year':
          comparison = a.year - b.year;
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
      }

      return filters.sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [filters]);

  // Filter trending movies for home screen
  const homeMovies = useMemo(
    () => applyFilters(trendingMovies),
    [trendingMovies, applyFilters]
  );

  // Screen routing
  if (currentScreen === 'details' && selectedMovie) {
    return <MovieDetailsScreen movie={selectedMovie} onBack={handleBack} enabledRatings={enabledRatings} />;
  }

  //  Home screen
  return (
    <div className="min-h-screen bg-background">
      <Header
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        enabledRatings={enabledRatings}
        onRatingsChange={handleRatingsChange}
        user={user}
        authLoading={loading}
        onSignIn={() => signIn('github')}
        onSignOut={signOut}
      />

      {/* Temorarily search show */}

      {searchResults.length > 0 && (
          <div className="px-6 py-2">
            <div className="max-w-7xl mx-auto">
              {searchResults.map((movie) => (
                  <button
                      key={movie.id}
                      onClick={() => handleSelectSearchResult(movie)}
                      className="block"
                  >
                    {movie.title} ({movie.year})
                  </button>
              ))}
            </div>
          </div>
      )}

      <main className="px-6 py-6 pb-10">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="mb-6">
            <h2 className="text-3xl mb-1.5 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
              Trending Movies
            </h2>
            <p className="text-muted-foreground">
              Compare ratings from IMDb, Rotten Tomatoes and Metacritic
            </p>
          </div>

          {/* Filter Bar */}
          <FilterBar
            filters={filters}
            onFilterChange={setFilters}
            availableGenres={availableGenres}
            availableYears={availableYears}
          />

          {/* Movie list */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {homeMovies.map((movie) => (
              <RatingCard
                key={movie.id}
                title={movie.title}
                director={movie.director}
                year={movie.year}
                ratings={movie.ratings}
                posterUrl={movie.posterUrl}
                onClick={() => handleSelectTrendingMovie(movie)}
                enabledRatings={enabledRatings}
              />
            ))}
          </div>

          {homeMovies.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No movies match your filters</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
