export const REACTION = { dislike: 0, like: 1, love: 2 } as const;
export type Reaction = (typeof REACTION)[keyof typeof REACTION];

/** movie id -> the user's reaction */
export type ReactionMap = Record<number, Reaction>;