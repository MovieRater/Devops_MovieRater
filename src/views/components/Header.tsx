import { Search, Moon, Sun, Settings, Film } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '../ui/dropdown-menu';
import { Checkbox } from '../ui/checkbox';
import { EnabledRatings } from '../../models/movie';
import { AccountMenu } from './AccountMenu';
import type { AppUser } from '../../models/user';


interface HeaderProps {
  onSearchFocus?: () => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  enabledRatings?: EnabledRatings;
  onRatingsChange?: (ratings: EnabledRatings) => void;
  user?: AppUser | null;
  authLoading?: boolean;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

export function Header({ 
  onSearchFocus, searchValue = '', onSearchChange, enabledRatings, onRatingsChange, 
  user = null, authLoading = false, onSignIn, onSignOut,
 }: HeaderProps) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    setIsDarkMode(shouldBeDark);
    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleRatingToggle = (source: keyof EnabledRatings) => {
    if (enabledRatings && onRatingsChange) {
      const newRatings = { ...enabledRatings, [source]: !enabledRatings[source] };
      const enabledCount = Object.values(newRatings).filter(Boolean).length;
      if (enabledCount > 0) {
        onRatingsChange(newRatings);
      }
    }
  };

  return (
    <header className="bg-background/95 backdrop-blur-sm border-b border-border px-6 py-3 sticky top-0 z-50">
      <div className="flex items-center gap-6 max-w-7xl mx-auto">
        {/* Logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0 select-none">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Film className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-base font-semibold tracking-tight">MovieRater</span>
        </div>

        {/* Search bar - centered and prominent */}
        <div className="flex-1 max-w-2xl mx-auto">
          <div className="bg-secondary/50 rounded-xl border border-border px-4 py-2.5 flex items-center gap-3 hover:border-primary/40 focus-within:border-primary/60 transition-colors">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Search for movies, directors..."
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              onFocus={onSearchFocus}
              className="bg-transparent text-foreground placeholder-muted-foreground flex-1 outline-none text-sm min-w-0"
            />
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-secondary transition-colors"
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Moon className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {/* Settings dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-secondary transition-colors"
                aria-label="Settings"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-3">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal uppercase tracking-wider mb-2">
                Rating Sources
              </DropdownMenuLabel>

              {enabledRatings && (
                <div className="space-y-2">
                  {(['imdb', 'rottenTomatoes', 'metacritic'] as const).map((source) => {
                    const labels = { imdb: 'IMDb', rottenTomatoes: 'Rotten Tomatoes', metacritic: 'Metacritic' };
                    return (
                      <div
                        key={source}
                        className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-secondary/60 cursor-pointer transition-colors"
                        onClick={() => handleRatingToggle(source)}
                      >
                        <Checkbox
                          id={source}
                          checked={enabledRatings[source]}
                          onCheckedChange={() => handleRatingToggle(source)}
                        />
                        <label htmlFor={source} className="text-sm cursor-pointer flex-1">
                          {labels[source]}
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}

            </DropdownMenuContent>
          </DropdownMenu>
          {/* Account */}
          <AccountMenu
            user={user}
            loading={authLoading}
            onSignIn={() => onSignIn?.()}
            onSignOut={() => onSignOut?.()}
          />
        </div>
      </div>
    </header>
  );
}
