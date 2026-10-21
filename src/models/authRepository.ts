import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { AppUser, OAuthProvider } from './user';

function toAppUser(u: User): AppUser {
    const meta = u.user_metadata ?? {};
    return {
        id: u.id,
        email: u.email ?? '',
        name: meta.full_name ?? meta.name ?? meta.user_name ?? u.email ?? '',
        avatarUrl: meta.avatar_url ?? null,
    };
}

export const authRepository = {
    signInWithProvider: (provider: OAuthProvider) =>
        supabase.auth.signInWithOAuth({
            provider,
            options: { redirectTo: window.location.origin },
        }),

    signOut: () => supabase.auth.signOut(),

    async getCurrentUser(): Promise<AppUser | null> {
        const { data } = await supabase.auth.getSession();
        return data.session ? toAppUser(data.session.user) : null;
    },

    onChange(callback: (user: AppUser | null) => void): () => void {
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            callback(session ? toAppUser(session.user) : null);
        });
        return () => data.subscription.unsubscribe();
    },
};
