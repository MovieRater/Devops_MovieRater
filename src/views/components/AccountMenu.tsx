import { LogIn, LogOut } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { ImageWithFallback } from './ImageWithFallback';
import type { AppUser } from '../../models/user';

interface AccountMenuProps {
    user: AppUser | null;
    loading: boolean;
    onSignIn: () => void;
    onSignOut: () => void;
}

function initialsOf(name: string) {
    return name.trim().slice(0, 2).toUpperCase() || '?';
}

export function AccountMenu({ user, loading, onSignIn, onSignOut }: AccountMenuProps) {
    // Placeholder for size to prevent header from jumping when doen with auth
    if (loading) {
        return <div className="w-9 h-9" aria-hidden="true" />;
    }

    if (!user) {
        return (
            <button
            onClick={onSignIn}
            className="h-9 flex items-center gap-2 px-3 rounded-lg border border-border hover:bg-secondary transition-colors text-sm"
            >
                <LogIn className="w-4 h-4 text-muted-foreground" />
                Sign in
            </button>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="w-9 h-9 rounded-full overflow-hidden border border-border hover:opacity-80 transition-opacity flex items-center justify-center bg-secondary text-xs font-medium"
                    aria-label="Account menu"
                >
                    {user.avatarUrl ? (
                        <ImageWithFallback src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                        initialsOf(user.name)
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                    <div className="text-sm font-medium truncate">{user.name}</div>
                    {user.email && (
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onSignOut}>
                    <LogOut className="w-4 h-4" />
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}