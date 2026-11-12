import { ArrowLeft, Film, Clock, Globe } from 'lucide-react';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { ImdbLogo } from '../components/logos/ImdbLogo';
import { RottenTomatoesLogo } from '../components/logos/RottenTomatoesLogo';
import { MetacriticLogo } from '../components/logos/MetacriticLogo';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '../ui/dialog';
import { useState, useEffect } from 'react';
import { Movie, EnabledRatings } from '../../models/movie';

interface MovieDetailsProps {
  movie: Movie;
  onBack: () => void;
  enabledRatings?: EnabledRatings;
}

function getRatingColor(value: number, platform: 'imdb' | 'rt' | 'metacritic') {
  if (platform === 'imdb') {
    if (value >= 7) return { text: 'text-green-400' };
    if (value >= 5) return { text: 'text-yellow-400' };
    return { text: 'text-red-400' };
  } else if (platform === 'rt') {
    if (value >= 60) return { text: 'text-green-400' };
    if (value >= 40) return { text: 'text-yellow-400' };
    return { text: 'text-red-400' };
  } else {
    if (value >= 61) return { text: 'text-green-400' };
    if (value >= 40) return { text: 'text-yellow-400' };
    return { text: 'text-red-400' };
  }
}

export function MovieDetailsScreen({ movie, onBack, enabledRatings }: MovieDetailsProps) {
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [fullMovie, setFullMovie] = useState<Movie>(movie);

  useEffect(() => {
    setFullMovie(movie);
  }, [movie]);

  const imdbRating = fullMovie.ratings.imdb.toFixed(1);
  const imdbColor = getRatingColor(fullMovie.ratings.imdb, 'imdb');
  const rtColor = getRatingColor(fullMovie.ratings.rottenTomatoes, 'rt');
  const metacriticColor = getRatingColor(fullMovie.ratings.metacritic, 'metacritic');

  const ratingsToShow = enabledRatings || { imdb: true, rottenTomatoes: true, metacritic: true };

  return (
    <div className="min-h-screen bg-background">
      {/* PC Header */}
      <header className="bg-background/95 backdrop-blur-sm border-b border-border px-6 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-4 max-w-7xl mx-auto">
          <button
            onClick={onBack}
            className="flex items-center gap-2.5 flex-shrink-0 hover:opacity-70 transition-opacity"
            aria-label="Back to home"
          >
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Film className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-base font-semibold tracking-tight">MovieRater</span>
          </button>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>/</span>
            <button onClick={onBack} className="hover:text-foreground transition-colors">
              Trending
            </button>
            <span>/</span>
            <span className="text-foreground truncate max-w-xs">{fullMovie.title}</span>
          </div>

          <button
            onClick={onBack}
            className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-secondary transition-colors text-sm text-muted-foreground flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      </header>

      {/* Hero — poster + key info side by side, above the fold */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex gap-8 items-start">

            {/* Poster — fixed height so it never pushes content below fold */}
            <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
              <DialogTrigger asChild>
                <div
                  className="relative w-52 flex-shrink-0 rounded-xl overflow-hidden shadow-2xl shadow-black/30 border border-border cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ height: '312px' }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setIsFullscreenOpen(true);
                    }
                  }}
                >
                  <ImageWithFallback
                    src={fullMovie.posterUrl}
                    alt={fullMovie.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  <div className="absolute bottom-2 left-0 right-0 text-center text-white/60 text-xs">
                    Click to enlarge
                  </div>
                </div>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto h-auto p-0 border-0 bg-transparent">
                <DialogTitle className="sr-only">{fullMovie.title} Poster</DialogTitle>
                <DialogDescription className="sr-only">
                  Full screen view of the movie poster for {fullMovie.title}
                </DialogDescription>
                <div className="relative flex items-center justify-center">
                  <ImageWithFallback
                    src={fullMovie.posterUrl}
                    alt={fullMovie.title}
                    className="max-w-full max-h-[95vh] object-contain rounded-lg"
                  />
                </div>
              </DialogContent>
            </Dialog>

            {/* Key info — all visible without scrolling */}
            <div className="flex-1 min-w-0 flex flex-col gap-5">
              {/* Title + meta */}
              <div>
                <h1 className="text-4xl font-semibold leading-tight mb-3">{fullMovie.title}</h1>
                <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                  <span className="text-foreground font-medium">{fullMovie.year}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {fullMovie.duration} min
                  </span>
                  <span>•</span>
                  <span className="px-2 py-0.5 bg-secondary border border-border rounded text-xs font-medium text-foreground">
                    {fullMovie.ageRating}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Directed by <span className="text-foreground">{fullMovie.director}</span>
                </p>
              </div>

              {/* Platform ratings — the main value prop, prominently shown */}
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Ratings</p>
                <div className="flex items-center gap-8 flex-wrap">
                  {ratingsToShow.imdb && (
                    <div className="flex items-center gap-3">
                      <ImdbLogo className="w-14 h-14 flex-shrink-0" />
                      <div>
                        <div className={`text-3xl font-semibold ${imdbColor.text}`}>{imdbRating}</div>
                        <div className="text-xs text-muted-foreground">out of 10</div>
                      </div>
                    </div>
                  )}
                  {ratingsToShow.rottenTomatoes && (
                    <div className="flex items-center gap-3">
                      <RottenTomatoesLogo className="w-14 h-14 flex-shrink-0" />
                      <div>
                        <div className={`text-3xl font-semibold ${rtColor.text}`}>{fullMovie.ratings.rottenTomatoes}%</div>
                        <div className="text-xs text-muted-foreground">Tomatometer</div>
                      </div>
                    </div>
                  )}
                  {ratingsToShow.metacritic && (
                    <div className="flex items-center gap-3">
                      <MetacriticLogo className="w-12 h-12 flex-shrink-0" />
                      <div>
                        <div className={`text-3xl font-semibold ${metacriticColor.text}`}>{fullMovie.ratings.metacritic}</div>
                        <div className="text-xs text-muted-foreground">Metascore</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Genre tags */}
              <div className="flex flex-wrap gap-2">
                {fullMovie.genre.map((g) => (
                  <span key={g} className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-sm">
                    {g}
                  </span>
                ))}
              </div>

              {/* Summary preview */}
              <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">
                {fullMovie.summary}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Details — below the fold */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-[1fr,280px] gap-8">
          {/* Left: full overview + cast */}
          <div className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium mb-3">Overview</h2>
              <p className="text-muted-foreground leading-relaxed">{fullMovie.summary}</p>
            </div>

            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium mb-3">Cast</h2>
              <div className="flex flex-wrap gap-2">
                {fullMovie.cast.map((actor) => (
                  <span key={actor} className="px-3 py-1.5 bg-secondary rounded-lg text-sm">
                    {actor}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right: extra metadata */}
          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border p-5">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Details</h2>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground mb-0.5">Director</dt>
                  <dd className="text-foreground">{fullMovie.director}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-0.5">Language</dt>
                  <dd className="text-foreground flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    {fullMovie.language}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-0.5">Country</dt>
                  <dd className="text-foreground">{fullMovie.country}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-0.5">Runtime</dt>
                  <dd className="text-foreground">{fullMovie.duration} min</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-0.5">Rating</dt>
                  <dd className="text-foreground">{fullMovie.ageRating}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
