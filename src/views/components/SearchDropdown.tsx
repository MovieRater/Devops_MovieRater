import {MoviePreview} from "@/models/movie";

interface SearchDropdownProps {
    results: MoviePreview[];
    onSelectMovie: (movie: MoviePreview) => void;
}