CREATE TABLE public.movie_reactions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id INTEGER NOT NULL,
  reaction SMALLINT NOT NULL CHECK (reaction in (0, 1, 2)),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, movie_id)
);

ALTER TABLE public.movie_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage own reactions" ON public.movie_reactions
  FOR all TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);