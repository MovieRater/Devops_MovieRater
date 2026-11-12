import { useEffect, useRef, useState } from 'react';
import { Clock, EyeOff, Loader2, RotateCcw, Search, Sparkles, Star, ThumbsDown, ThumbsUp, Undo2, X } from 'lucide-react';
import type { AiMode, Answer, Film, Hunch, HunchFilm, NoteVerdict, Pick, PickReaction, Reaction, Verdict } from '@/models/taste';
import { useTasteStore } from '@/controllers/useTasteStore';
import { hunchStatus, nextAnchor, nextHunchFilm, picksMissed } from '@/controllers/tasteGame';
import { fetchAnchors, fetchHunches, fetchRecommendations } from '@/api/taste';

type Phase = 'intro' | 'anchors' | 'thinking' | 'hunches' | 'vibe' | 'picking' | 'picks' | 'error';

const VIBE_PAIRS: [string, string][] = [
  ['😂 Laugh', '😬 Tension'],
  ['🍿 Easy watch', '🧠 Something to chew on'],
  ['⏱ Under 2 hours', "🛋 Epic, I've got time"],
  ['🆕 Newer', '🎞 Classic'],
];
const REFINE_CHIPS = ['Lighter', 'Darker', 'Newer', 'Older', 'Less mainstream', 'Shorter'];
const MAX_HUNCH_ROUNDS = 2;

const poster = (f: Film) => (f.posterPath ? `https://image.tmdb.org/t/p/w342${f.posterPath}` : undefined);
const stripEmoji = (s: string) => s.replace(/^[^A-Za-z]+/, '');

const VERDICTS: { verdict: Verdict; label: string; Icon: typeof Star }[] = [
  { verdict: 'not', label: 'Not for me', Icon: ThumbsDown },
  { verdict: 'like', label: 'Like', Icon: ThumbsUp },
  { verdict: 'super', label: 'Super like', Icon: Star },
  { verdict: 'unseen', label: "Haven't seen", Icon: EyeOff },
];

function VerdictButtons({ onAnswer, current, compact = false, only }: {
  onAnswer: (v: Verdict) => void; current?: Verdict; compact?: boolean; only?: Verdict[];
}) {
  const shown = only ? VERDICTS.filter((v) => only.includes(v.verdict)) : VERDICTS;
  return (
    <div className={`grid ${shown.length === 3 ? 'grid-cols-3' : 'grid-cols-4'} gap-2 ${compact ? '' : 'mt-4'}`}>
      {shown.map(({ verdict, label, Icon }) => (
        <button
          key={verdict}
          onClick={() => onAnswer(verdict)}
          aria-pressed={current === verdict}
          className={`flex flex-col items-center gap-1 rounded-xl border px-2 ${compact ? 'py-1.5 text-[11px]' : 'py-3 text-xs'} transition-colors
            ${current === verdict ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary'}`}
        >
          <Icon className={compact ? 'w-3.5 h-3.5' : 'w-5 h-5'} />
          {label}
        </button>
      ))}
    </div>
  );
}

const REACTIONS: { reaction: Reaction; label: string; Icon: typeof Star }[] = [
  { reaction: 'up', label: 'Yes', Icon: ThumbsUp },
  { reaction: 'down', label: 'No', Icon: ThumbsDown },
  { reaction: 'later', label: 'Later', Icon: Clock },
];

function ReactionButtons({ onReact, current }: { onReact: (r: Reaction) => void; current?: Reaction }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {REACTIONS.map(({ reaction, label, Icon }) => (
        <button
          key={reaction}
          onClick={() => onReact(reaction)}
          aria-pressed={current === reaction}
          className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-xs transition-colors
            ${current === reaction ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary'}`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function FilmCard({ film, kicker, question, note, onAnswer }: {
  film: Film; kicker: React.ReactNode; question?: string; note?: string; onAnswer: (v: Verdict) => void;
}) {
  return (
    <div className="max-w-[260px] mx-auto">
      <div className="text-sm text-muted-foreground mb-2 min-h-5">{kicker}</div>
      {question && <h3 className="text-xl font-semibold mb-3">{question}</h3>}
      <div className="rounded-2xl overflow-hidden border border-border bg-secondary aspect-[2/3]">
        {poster(film) && <img src={poster(film)} alt={`${film.title} poster`} className="w-full h-full object-cover" />}
      </div>
      <div className="mt-3">
        <div className="text-lg font-semibold">{film.title} <span className="text-muted-foreground font-normal">({film.year})</span></div>
        <div className="text-xs text-muted-foreground">{film.genres.slice(0, 3).join(' · ')}</div>
        {note && <p className="text-sm mt-2 italic">{note}</p>}
      </div>
      <VerdictButtons onAnswer={onAnswer} />
    </div>
  );
}

const STATUS_STYLE = {
  confirmed: '✅ confirmed', narrowed: '🎯 narrowed', dropped: '✖ dropped', open: '… open',
};

function LaterList({ reactions, onRemove }: { reactions: PickReaction[]; onRemove: (film: Film) => void }) {
  const later = reactions.filter((r) => r.reaction === 'later');
  if (!later.length) return null;
  return (
    <aside className="rounded-2xl border border-border p-4 text-sm h-fit">
      <h4 className="font-semibold mb-2 flex items-center gap-2"><Clock className="w-4 h-4" /> Later ({later.length})</h4>
      <ul className="space-y-1">
        {later.map((r) => (
          <li key={r.film.tmdbId} className="flex items-start gap-2">
            <span className="flex-1">{r.film.title} <span className="text-muted-foreground">({r.film.year})</span></span>
            <button
              onClick={() => onRemove(r.film)}
              className="text-muted-foreground hover:text-foreground mt-0.5"
              aria-label={`Remove ${r.film.title} from Later`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function CluesBoard({ hunches, answers }: { hunches: Hunch[]; answers: Answer[] }) {
  const counts = { super: 0, like: 0, not: 0, unseen: 0 };
  answers.forEach((a) => counts[a.verdict]++);
  return (
    <aside className="rounded-2xl border border-border p-4 text-sm h-fit">
      <h4 className="font-semibold mb-2 flex items-center gap-2"><Search className="w-4 h-4" /> Clues</h4>
      <p className="text-muted-foreground mb-3">
        ⭐ {counts.super} · 👍 {counts.like} · 👎 {counts.not} · unseen {counts.unseen}
      </p>
      {hunches.length > 0 && (
        <ul className="space-y-2">
          {hunches.map((h) => (
            <li key={h.id}>
              <div className="font-medium">{h.label}</div>
              <div className="text-xs text-muted-foreground">{STATUS_STYLE[hunchStatus(h, answers)]}</div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/** Everything Undo needs to step back one choice. */
interface Snapshot {
  phase: Phase;
  hunches: Hunch[];
  hunchRounds: number;
  vibeIndex: number;
  vibeChoices: string[];
  picks: Pick[];
  pickIndex: number;
  chosen: Pick | null;
  refineOpen: boolean;
  answers: Answer[];
  reactions: PickReaction[];
}

/** The Suggest now flow. Rendered inside the app, under the main header. */
export function TasteScreen() {
  const answers = useTasteStore((s) => s.answers);
  const answer = useTasteStore((s) => s.answer);
  const reactions = useTasteStore((s) => s.reactions);
  const react = useTasteStore((s) => s.react);
  const reset = useTasteStore((s) => s.reset);
  const restore = useTasteStore((s) => s.restore);

  const [phase, setPhase] = useState<Phase>('intro');
  const [mode, setMode] = useState<AiMode | null>(null);
  const [error, setError] = useState('');
  const [anchors, setAnchors] = useState<Film[]>([]);
  const [hunches, setHunches] = useState<Hunch[]>([]);
  const [hunchRounds, setHunchRounds] = useState(0);
  const [vibeIndex, setVibeIndex] = useState(0);
  const [vibeChoices, setVibeChoices] = useState<string[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [noteVerdict, setNoteVerdict] = useState<NoteVerdict | undefined>();
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineChips, setRefineChips] = useState<string[]>([]);
  const [refineText, setRefineText] = useState('');
  /** Picks are shown one at a time: the one at this index. */
  const [pickIndex, setPickIndex] = useState(0);
  /** The pick the user said yes to. */
  const [chosen, setChosen] = useState<Pick | null>(null);
  /** "Seen it?" opened on the current pick, to rate it instead. */
  const [ratingOpen, setRatingOpen] = useState(false);
  /** Undo history: one snapshot per choice. */
  const [history, setHistory] = useState<Snapshot[]>([]);
  /** Bumped to cancel an AI request whose answer is no longer wanted (after Undo or Start over). */
  const requestId = useRef(0);

  /** Call before every user choice, so Undo can step back to here. */
  function checkpoint() {
    const { answers: a, reactions: r } = useTasteStore.getState();
    setHistory((h) => [...h, {
      phase, hunches, hunchRounds, vibeIndex, vibeChoices, picks, pickIndex, chosen, refineOpen, answers: a, reactions: r,
    }]);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    requestId.current++;
    setHistory(history.slice(0, -1));
    restore(last.answers, last.reactions);
    setPhase(last.phase); setHunches(last.hunches); setHunchRounds(last.hunchRounds);
    setVibeIndex(last.vibeIndex); setVibeChoices(last.vibeChoices);
    setPicks(last.picks); setPickIndex(last.pickIndex); setChosen(last.chosen);
    setRefineOpen(last.refineOpen); setRatingOpen(false);
  }

  const fail = (err: unknown) => {
    setError(err instanceof Error ? err.message : String(err));
    setPhase('error');
  };

  const latest = () => useTasteStore.getState().answers;

  async function start(fresh: boolean) {
    if (fresh) reset();
    const id = ++requestId.current;
    setHistory([]);
    setHunches([]); setHunchRounds(0); setPicks([]); setVibeIndex(0); setVibeChoices([]);
    setRefineOpen(false); setRefineChips([]); setRefineText('');
    setPhase('anchors');
    try {
      const res = await fetchAnchors();
      if (id !== requestId.current) return;
      setMode(res.mode);
      setAnchors(res.anchors);
      if (!nextAnchor(res.anchors, latest())) await loadHunches([], 0);
    } catch (err) { fail(err); }
  }

  async function loadHunches(existing: Hunch[], rounds: number) {
    setPhase('thinking');
    const id = ++requestId.current;
    try {
      const res = await fetchHunches({ answers: latest() });
      if (id !== requestId.current) return;
      setMode(res.mode);
      // Keep ids unique across rounds.
      const fresh = res.hunches.map((h) => ({ ...h, id: `r${rounds + 1}-${h.id}` }));
      const all = [...existing, ...fresh];
      setHunches(all);
      setHunchRounds(rounds + 1);
      setPhase(nextHunchFilm(all, latest()) ? 'hunches' : 'vibe');
    } catch (err) { if (id === requestId.current) fail(err); }
  }

  function onAnchorAnswer(film: Film, verdict: Verdict) {
    checkpoint();
    answer(film, verdict, 'anchor');
    if (!nextAnchor(anchors, latest())) loadHunches([], 0);
  }

  function onHunchAnswer(hunch: Hunch, film: HunchFilm, verdict: Verdict) {
    checkpoint();
    answer(film, verdict, 'hunch', hunch.id);
    if (nextHunchFilm(hunches, latest())) return;
    const anyLead = hunches.some((h) => ['confirmed', 'narrowed'].includes(hunchStatus(h, latest())));
    if (!anyLead && hunchRounds < MAX_HUNCH_ROUNDS) loadHunches(hunches, hunchRounds);
    else setPhase('vibe');
  }

  async function loadPicks(choices: string[], chips: string[], text: string) {
    setPhase('picking');
    const id = ++requestId.current;
    try {
      const res = await fetchRecommendations({
        answers: latest(),
        hunches: hunches.map((h) => ({ hunch: h, status: hunchStatus(h, latest()) })),
        vibe: { choices: choices.map(stripEmoji), refineChips: chips, refineText: text || undefined },
        reactions: useTasteStore.getState().reactions,
      });
      if (id !== requestId.current) return;
      setMode(res.mode);
      setPicks(res.picks);
      setNoteVerdict(res.note);
      setPickIndex(0);
      setChosen(null);
      setRatingOpen(false);
      setRefineOpen(false);
      setPhase('picks');
    } catch (err) { if (id === requestId.current) fail(err); }
  }

  function chooseVibe(choice: string | null) {
    checkpoint();
    const choices = choice ? [...vibeChoices, choice] : vibeChoices;
    setVibeChoices(choices);
    if (vibeIndex + 1 < VIBE_PAIRS.length) setVibeIndex(vibeIndex + 1);
    else loadPicks(choices, [], '');
  }

  // Arrow keys for "would you rather".
  useEffect(() => {
    if (phase !== 'vibe') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') chooseVibe(VIBE_PAIRS[vibeIndex][0]);
      if (e.key === 'ArrowRight') chooseVibe(VIBE_PAIRS[vibeIndex][1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Next pick; when the list runs out, ask for more (reacted films are never suggested again). */
  function nextPick() {
    setRatingOpen(false);
    if (pickIndex + 1 < picks.length) setPickIndex(pickIndex + 1);
    else loadPicks(vibeChoices, refineChips, refineText);
  }

  function onPickReact(pick: Pick, reaction: Reaction) {
    checkpoint();
    react(pick, reaction);
    if (reaction === 'up') {
      setChosen(pick);
      return;
    }
    nextPick();
    if (picksMissed(picks.map((p) => p.tmdbId), useTasteStore.getState().reactions)) setRefineOpen(true);
  }

  /** A suggestion the user has already seen becomes a rating (a clue), and the next pick shows. */
  function onPickSeen(pick: Pick, verdict: Verdict) {
    checkpoint();
    answer(pick, verdict, 'pick');
    nextPick();
  }

  const currentPick = phase === 'picks' && !chosen ? picks[pickIndex] : undefined;

  const anchorOpinions = answers.filter((a) => a.source === 'anchor' && a.verdict !== 'unseen').length;
  const currentAnchor = phase === 'anchors' ? nextAnchor(anchors, answers) : null;
  const currentHunch = phase === 'hunches' ? nextHunchFilm(hunches, answers) : null;

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold flex items-center gap-2"><Sparkles className="w-5 h-5" /> Suggest now</h1>
        {mode && (
          <span className={`text-xs rounded-full px-2.5 py-1 border ${mode === 'fake' ? 'border-amber-500 text-amber-600' : 'border-border text-muted-foreground'}`}>
            {{ fake: 'Fake AI (no Claude key)', relay: 'AI: Claude Code (live)', claude: 'AI: Claude' }[mode]}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {phase !== 'intro' && (
            <button
              onClick={undo}
              disabled={!history.length}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-border text-sm hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none"
            >
              <Undo2 className="w-4 h-4" /> Undo
            </button>
          )}
          {phase !== 'intro' && (
            <button
              onClick={() => start(true)}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-border text-sm hover:bg-secondary"
            >
              <RotateCcw className="w-4 h-4" /> Start over
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-[1fr_220px]">
        <section>
          {phase === 'intro' && (
            <div className="max-w-md">
              <h2 className="text-2xl font-semibold mb-2">Let's find a film for right now</h2>
              <p className="text-muted-foreground mb-6">
                Rate a few films, and we'll follow the clues. No typing needed.
              </p>
              <div className="flex flex-wrap gap-3">
                {answers.length > 0 && (
                  <button onClick={() => start(false)} className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5">
                    Continue with my {answers.length} clues
                  </button>
                )}
                <button
                  onClick={() => start(true)}
                  className={`rounded-xl px-4 py-2.5 ${answers.length ? 'border border-border hover:bg-secondary' : 'bg-primary text-primary-foreground'}`}
                >
                  {answers.length ? 'Start over' : 'Start'}
                </button>
              </div>
            </div>
          )}

          {phase === 'anchors' && !currentAnchor && <Spinner text="Getting films…" />}
          {currentAnchor && (
            <FilmCard
              key={currentAnchor.tmdbId}
              film={currentAnchor}
              kicker={`Warm-up · ${Math.min(anchorOpinions + 1, 5)} of 5`}
              onAnswer={(v) => onAnchorAnswer(currentAnchor, v)}
            />
          )}

          {phase === 'thinking' && <Spinner text="Looking for patterns in your answers…" relay={mode === 'relay'} />}

          {currentHunch && (
            <>
              <FilmCard
                key={currentHunch.film.tmdbId}
                film={currentHunch.film}
                kicker={<><Search className="inline w-3.5 h-3.5 mr-1" />Hunch: <b>{currentHunch.hunch.label}</b> · {currentHunch.hunch.basis}</>}
                question={currentHunch.film.role === 'confirm' && currentHunch.film === currentHunch.hunch.films[0] ? 'Is this your style?' : undefined}
                note={currentHunch.film.testing}
                onAnswer={(v) => onHunchAnswer(currentHunch.hunch, currentHunch.film, v)}
              />
              <div className="max-w-[260px] mx-auto mt-6 text-center">
                <button onClick={() => { checkpoint(); setPhase('vibe'); }} className="text-sm underline text-muted-foreground hover:text-foreground">
                  Enough, show me films
                </button>
              </div>
            </>
          )}

          {phase === 'vibe' && (
            <div className="max-w-lg mx-auto text-center">
              <div className="text-sm text-muted-foreground mb-2">Your mood · {vibeIndex + 1} of {VIBE_PAIRS.length}</div>
              <h2 className="text-2xl font-semibold mb-6">Right now, would you rather…</h2>
              <div className="grid grid-cols-2 gap-4">
                {VIBE_PAIRS[vibeIndex].map((option, i) => (
                  <button
                    key={option}
                    onClick={() => chooseVibe(option)}
                    className="rounded-2xl border border-border py-10 text-lg hover:bg-secondary hover:border-primary transition-colors"
                  >
                    {i === 0 ? '← ' : ''}{option}{i === 1 ? ' →' : ''}
                  </button>
                ))}
              </div>
              <button onClick={() => chooseVibe(null)} className="mt-4 text-sm underline text-muted-foreground hover:text-foreground">
                Either is fine
              </button>
            </div>
          )}

          {phase === 'picking' && <Spinner text="Picking films for right now…" relay={mode === 'relay'} />}

          {phase === 'picks' && (
            <div>
              <div className="flex items-end justify-between gap-4 mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">Vibe: {vibeChoices.map(stripEmoji).join(', ') || 'anything'}</p>
                  {noteVerdict && (noteVerdict.relevant ? (
                    <p className="text-sm text-muted-foreground">Your note: “{noteVerdict.understood || refineText}”</p>
                  ) : (
                    <p className="text-sm text-amber-600">We couldn't use your note. It doesn't seem to be about films.</p>
                  ))}
                </div>
                <button onClick={() => setRefineOpen(true)} className="text-sm rounded-xl border border-border px-3 py-2 hover:bg-secondary">
                  Not quite right?
                </button>
              </div>

              {refineOpen && (
                <div className="rounded-2xl border border-primary/50 p-4 mb-6">
                  <h3 className="font-semibold mb-3">What's off?</h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {REFINE_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        onClick={() => setRefineChips((c) => (c.includes(chip) ? c.filter((x) => x !== chip) : [...c, chip]))}
                        className={`rounded-full border px-3 py-1 text-sm ${refineChips.includes(chip) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  <input
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                    maxLength={200}
                    placeholder="…or tell us (optional)"
                    className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => loadPicks(vibeChoices, refineChips, refineText)}
                    className="mt-3 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm"
                  >
                    Try again
                  </button>
                </div>
              )}

              {picks.length === 0 && <p className="text-muted-foreground">No picks came back. Try "Not quite right?".</p>}

              {chosen && (
                <div className="max-w-[300px] mx-auto text-center">
                  <div className="rounded-2xl overflow-hidden border border-border bg-secondary aspect-[2/3] mb-4">
                    {poster(chosen) && <img src={poster(chosen)} alt={`${chosen.title} poster`} className="w-full h-full object-cover" />}
                  </div>
                  <h3 className="text-2xl font-semibold mb-1">Enjoy {chosen.title}! 🍿</h3>
                  <p className="text-sm text-muted-foreground mb-4">{chosen.year} · {chosen.genres.slice(0, 3).join(' · ')}</p>
                  <button
                    onClick={() => { checkpoint(); setChosen(null); nextPick(); }}
                    className="text-sm underline text-muted-foreground hover:text-foreground"
                  >
                    Show me another
                  </button>
                </div>
              )}

              {currentPick && (
                <div key={currentPick.tmdbId} className="max-w-[300px] mx-auto">
                  <div className="text-sm text-muted-foreground mb-2">
                    {pickIndex === 0 ? 'Our pick for you' : `Next pick · ${pickIndex + 1}`}
                  </div>
                  <div className="rounded-2xl overflow-hidden border border-border bg-secondary aspect-[2/3]">
                    {poster(currentPick) && <img src={poster(currentPick)} alt={`${currentPick.title} poster`} className="w-full h-full object-cover" />}
                  </div>
                  <div className="mt-3 mb-3">
                    <div className="text-lg font-semibold">{currentPick.title} <span className="text-muted-foreground font-normal">({currentPick.year})</span></div>
                    <div className="text-xs text-muted-foreground">{currentPick.genres.slice(0, 3).join(' · ')}</div>
                    <p className="text-sm mt-2">{currentPick.reason}</p>
                  </div>
                  <ReactionButtons onReact={(r) => onPickReact(currentPick, r)} />
                  {ratingOpen ? (
                    <div className="mt-3">
                      <div className="text-xs text-muted-foreground mb-1">Already seen it? Rate it:</div>
                      <VerdictButtons compact only={['not', 'like', 'super']} onAnswer={(v) => onPickSeen(currentPick, v)} />
                    </div>
                  ) : (
                    <div className="text-center mt-3">
                      <button onClick={() => setRatingOpen(true)} className="text-xs underline text-muted-foreground hover:text-foreground">
                        Seen it?
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {phase === 'error' && (
            <div className="rounded-2xl border border-destructive/50 p-4">
              <p className="font-semibold mb-1">Something went wrong</p>
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <button onClick={() => setPhase('intro')} className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-secondary">
                Back to start
              </button>
            </div>
          )}
        </section>

        {phase !== 'intro' && (
          <div className="space-y-3">
            <CluesBoard hunches={hunches} answers={answers} />
            <LaterList reactions={reactions} onRemove={(film) => react(film, 'later')} />
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner({ text, relay = false }: { text: string; relay?: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="py-16 text-center text-muted-foreground">
      <div className="flex items-center gap-3 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> {text}
      </div>
      {relay && (
        <p className="text-xs mt-3">
          Claude Code is answering by hand. This usually takes 30–60 seconds · {seconds}s
        </p>
      )}
    </div>
  );
}
