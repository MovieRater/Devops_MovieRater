import { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './views/components/Header';
import { RatingCard } from './views/components/RatingCard';
import { SearchResultsScreen } from './views/screens/SearchResultsScreen';
import { MovieDetailsScreen } from './views/screens/MovieDetailsScreen';
import { FilterBar, FilterOptions } from './views/components/FilterBar';
import { Movie, EnabledRatings, Screen } from './models/movie';
import { mockMovies, availableGenres, availableYears } from './models/mockMovies';
import { useAuth } from './controllers/AuthProvider';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [filters, setFilters] = useState<FilterOptions>({
    genres: [],
    years: [],
    minRating: 0,
    sortBy: 'views',
    sortOrder: 'desc'
  });
  const [enabledRatings, setEnabledRatings] = useState<EnabledRatings>({
    imdb: true,
    rottenTomatoes: true,
    metacritic: true
  });
  const { user, loading, signIn, signOut } = useAuth();

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

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setCurrentScreen('search');
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim() === '') {
      setCurrentScreen('home');
    } else {
      setCurrentScreen('search');
    }
  };

  const handleSelectMovie = (movie: Movie) => {
    setSelectedMovie(movie);
    setCurrentScreen('details');
  };

  const handleBack = () => {
    if (currentScreen === 'details') {
      setCurrentScreen(searchQuery.trim() ? 'search' : 'home');
    } else if (currentScreen === 'search') {
      setSearchQuery('');
      setCurrentScreen('home');
    }
  };

  // Apply filters and sorting
  const applyFilters = useCallback((movies: Movie[]) => {
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
        case 'views': {
          const aViews = parseFloat(a.views.replace('M', ''));
          const bViews = parseFloat(b.views.replace('M', ''));
          comparison = aViews - bViews;
          break;
        }
      }

      return filters.sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [filters]);

  // Filter movies for home screen (exclude The Dark Knight for variety)
  const homeMovies = useMemo(
    () => applyFilters(mockMovies.filter(movie => movie.id !== 5)),
    [applyFilters]
  );

  // Filter movies based on search
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const matches = mockMovies.filter(movie =>
      movie.title.toLowerCase().includes(query) ||
      movie.director.toLowerCase().includes(query)
    );
    return applyFilters(matches);
  }, [searchQuery, applyFilters]);

  // Screen routing
  if (currentScreen === 'details' && selectedMovie) {
    return <MovieDetailsScreen movie={selectedMovie} onBack={handleBack} enabledRatings={enabledRatings} />;
  }

  if (currentScreen === 'search') {
    return (
      <SearchResultsScreen
        searchQuery={searchQuery}
        results={searchResults}
        onBack={handleBack}
        onSelectMovie={handleSelectMovie}
        onSearchChange={handleSearchChange}
        enabledRatings={enabledRatings}
      />
    );
  }

  // Home screen
  return (
    <div className="min-h-screen bg-background">
      <Header
        onSearchFocus={handleSearch}
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        enabledRatings={enabledRatings}
        onRatingsChange={handleRatingsChange}
        user={user}
        authLoading={loading}
        onSignIn={() => signIn('github')}
        onSignOut={signOut}
      />

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
                onClick={() => handleSelectMovie(movie)}
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
