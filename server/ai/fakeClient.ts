import type { AiClient, ClueLine, HunchDraft, HunchInput, PickDraft, RecommendDraft, RecommendInput } from './aiClient';

// Stand-in for Claude so the whole flow can be clicked through without an API key.
// Simple genre rules, nothing clever: the point is the flow, not the taste.

type FakeHunch = Omit<HunchDraft, 'basis'>;

const HUNCHES: Record<string, FakeHunch> = {
  Comedy: { label: 'Comedy with craft', films: [
    { title: 'Moonrise Kingdom', year: 2012, role: 'confirm', testing: 'Do you like stylized, whimsical comedy?' },
    { title: 'Step Brothers', year: 2008, role: 'split', testing: 'Or is broad, silly comedy just as good?' },
  ] },
  Crime: { label: 'Crime with depth', films: [
    { title: 'Heat', year: 1995, role: 'confirm', testing: 'Is it slow-burn crime drama you like?' },
    { title: 'The Rock', year: 1996, role: 'split', testing: 'Or is it the action that does it?' },
  ] },
  Drama: { label: 'Big emotional drama', films: [
    { title: 'Good Will Hunting', year: 1997, role: 'confirm', testing: 'Do character-driven dramas land for you?' },
    { title: 'Requiem for a Dream', year: 2000, role: 'split', testing: 'Hopeful drama only, or dark too?' },
  ] },
  'Science Fiction': { label: 'Thoughtful sci-fi', films: [
    { title: 'Arrival', year: 2016, role: 'confirm', testing: 'Is it the ideas in sci-fi you like?' },
    { title: 'Transformers', year: 2007, role: 'split', testing: 'Or the spectacle?' },
  ] },
  Animation: { label: 'Animation for grown-ups', films: [
    { title: 'Princess Mononoke', year: 1997, role: 'confirm', testing: 'Ghibli beyond Spirited Away?' },
    { title: 'Up', year: 2009, role: 'split', testing: 'Or Pixar-style family films too?' },
  ] },
  Horror: { label: 'Smart horror', films: [
    { title: 'Hereditary', year: 2018, role: 'confirm', testing: 'Slow, unsettling horror?' },
    { title: 'Final Destination', year: 2000, role: 'split', testing: 'Or fun, gory horror?' },
  ] },
  Action: { label: 'Stylish action', films: [
    { title: 'Kill Bill: Vol. 1', year: 2003, role: 'confirm', testing: 'Do you like action with style?' },
    { title: 'Taken', year: 2008, role: 'split', testing: 'Or straightforward action?' },
  ] },
  Romance: { label: 'Romance with bite', films: [
    { title: 'Before Sunrise', year: 1995, role: 'confirm', testing: 'Talky, real romance?' },
    { title: 'The Proposal', year: 2009, role: 'split', testing: 'Or feel-good romcoms?' },
  ] },
};

const PICKS: Record<string, PickDraft[]> = {
  Comedy: [
    { title: 'The Intouchables', year: 2011, reason: 'Warm and very funny, like the comedies you loved.' },
    { title: 'Hot Fuzz', year: 2007, reason: 'Sharp comedy that turns into an action film.' },
    { title: 'Booksmart', year: 2019, reason: 'Big-hearted teen comedy, newer.' },
  ],
  Crime: [
    { title: 'Goodfellas', year: 1990, reason: 'Classic crime, faster and funnier than most.' },
    { title: 'Prisoners', year: 2013, reason: 'A gripping crime drama with weight.' },
  ],
  Drama: [
    { title: 'The Green Mile', year: 1999, reason: 'Big emotional drama from the Shawshank team.' },
    { title: 'Dead Poets Society', year: 1989, reason: 'A character drama that hits hard.' },
  ],
  'Science Fiction': [
    { title: 'The Prestige', year: 2006, reason: 'A puzzle box with an emotional payoff.' },
    { title: 'Ex Machina', year: 2014, reason: 'Small, smart sci-fi.' },
  ],
  Animation: [
    { title: "Howl's Moving Castle", year: 2004, reason: 'More Ghibli magic.' },
    { title: 'Coco', year: 2017, reason: 'Animation with real emotional weight.' },
  ],
  Horror: [
    { title: 'A Quiet Place', year: 2018, reason: 'Tense horror that is easy to get into.' },
  ],
  Action: [
    { title: 'Edge of Tomorrow', year: 2014, reason: 'Action with a clever twist.' },
  ],
  Romance: [
    { title: 'About Time', year: 2013, reason: 'Romance with heart and humour.' },
  ],
};

function likedGenres(clues: ClueLine[]): string[] {
  const score: Record<string, number> = {};
  for (const c of clues) {
    const w = { super: 2, like: 1, not: -2, unseen: 0 }[c.verdict];
    for (const g of c.genres) score[g] = (score[g] ?? 0) + w;
  }
  return Object.entries(score).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([g]) => g);
}

export class FakeClient implements AiClient {
  readonly mode = 'fake' as const;

  async proposeHunches({ clues }: HunchInput): Promise<HunchDraft[]> {
    const genres = likedGenres(clues).filter((g) => HUNCHES[g]);
    const chosen = (genres.length ? genres : ['Drama', 'Comedy', 'Crime']).slice(0, 3);
    return chosen.map((g) => {
      const example = clues.find((c) => c.genres.includes(g) && (c.verdict === 'super' || c.verdict === 'like'));
      return { ...HUNCHES[g], basis: example ? `You liked ${example.title}.` : `A guess to get started.` };
    });
  }

  async recommend({ clues, vibe, reactions }: RecommendInput): Promise<RecommendDraft> {
    // Reactions nudge genres a little: yes counts like a "like", no like a "not for me".
    const nudges: ClueLine[] = reactions
      .filter((r) => r.reaction !== 'later')
      .map((r) => ({ ...r, director: null, verdict: r.reaction === 'up' ? 'like' : 'not' }));
    const genres = likedGenres([...clues, ...nudges]);
    const order = [...genres, ...Object.keys(PICKS)].filter((g, i, all) => PICKS[g] && all.indexOf(g) === i);
    const vibeText = vibe.choices[0] ? `${vibe.choices[0]} right now. ` : '';
    const picks = order.flatMap((g) => PICKS[g]).map((p) => ({ ...p, reason: vibeText + p.reason }));
    // The fake can't judge a note: it accepts it as written.
    const text = vibe.refineText?.trim() ?? '';
    return { picks, note: { relevant: true, understood: text.slice(0, 60) } };
  }
}
