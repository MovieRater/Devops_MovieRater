import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authRepository } from '../models/authRepository';
import type { AppUser, OAuthProvider } from '../models/user';

interface AuthState {
    user: AppUser | null;
    loading: boolean;
    signIn: (provider: OAuthProvider) => void;
    signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        authRepository.getCurrentUser()
            .then(setUser)
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
        return authRepository.onChange(setUser);
    }, []);

    const value: AuthState = {
        user,
        loading,
        signIn: async provider => { 
            const { error } = await authRepository.signInWithProvider(provider); 
            if (error) console.error('Sign-in failed:', error.message);
        },
        signOut: () => { authRepository.signOut(); },
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}