export interface AppUser {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
}

export type OAuthProvider = 'github';