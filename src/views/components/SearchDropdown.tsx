import {BasicMovie} from "@/models/movie";
import { ImageWithFallback} from "./ImageWithFallback";

interface SearchDropdownProps {
    results: BasicMovie[];
    onSelectMovie: (movie: BasicMovie) => void;
}

export function SearchDropdown({
                                   results,
                                   onSelectMovie
                               }: SearchDropdownProps) {

    if (results.length === 0) {
        return null;
    }

    return (
        <div className="absolute top-full left-0 right-0 mt-2 overflow-hidden rounded-xl border border-border bg-card shadow-lg z-50">
            {results.map((movie) => (
                <button
                    key={movie.id}
                    onClick={() => onSelectMovie(movie)}
                    className="w-full text-left p-3 flex gap-3 hover:bg-secondary/60 transition-colors border-b border-border last:border-b-0"
                >
                    {movie.posterUrl && (
                        <div className="w-12 h-16 flex-shrink-0 overflow-hidden rounded-md bg-secondary">
                            <ImageWithFallback
                                src={movie.posterUrl}
                                alt={movie.title}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}

                    <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                            {movie.title}
                        </p>

                        <p className="text-sm text-muted-foreground">
                            {movie.year}
                        </p>

                        <p className="text-xs text-muted-foreground truncate">
                            {movie.genre.join(" • ")}
                        </p>
                    </div>
                </button>
            ))}
        </div>
    );
}