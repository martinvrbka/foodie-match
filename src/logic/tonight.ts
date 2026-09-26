// Tonight mode: what happens after each round, and the Borda count.
// Clients compute the next step; the server accepts only the first write
// (tonight_advance), so both phones may try and exactly one wins.

export type TonightStatus = 'swiping' | 'choosing' | 'shortlisting' | 'ranking' | 'done' | 'cancelled';
export const ACTIVE_STATUSES: readonly TonightStatus[] = ['swiping', 'choosing', 'shortlisting', 'ranking'];

/** Above this many recipes liked by both, each partner first picks a top 5. */
export const TOP_N = 5;

export type SwipeOutcome =
  | { next: 'done'; winner: number }
  | { next: 'ranking' | 'shortlisting' | 'choosing'; shortlist: number[] };

const sorted = (ids: Iterable<number>) => [...new Set(ids)].sort((a, b) => a - b);

/**
 * After both swiped: 0 liked by both → choose from anything either liked (may be
 * empty: then only reshuffle); 1 → winner; 2..5 → rank them; more → top 5 first.
 */
export function swipeOutcome(likes: readonly ReadonlySet<number>[]): SwipeOutcome {
  const [a, b] = likes;
  const both = sorted([...a].filter((id) => b.has(id)));
  if (both.length === 0) return { next: 'choosing', shortlist: sorted([...a, ...b]) };
  if (both.length === 1) return { next: 'done', winner: both[0] };
  return { next: both.length > TOP_N ? 'shortlisting' : 'ranking', shortlist: both };
}

/** The recipes both partners put in their top 5, combined (up to 10). */
export function unionOfTops(tops: readonly (readonly number[])[]): number[] {
  return sorted(tops.flat());
}

/**
 * Borda count: in a list of N, rank 1 gets N points … rank N gets 1. Highest total
 * wins; ties go to the shorter cook time (unknown counts as longest), then to the RNG.
 * Same inputs and same RNG ⇒ same winner.
 */
export function bordaWinner(
  rankings: readonly (readonly number[])[],
  cookTime: (recipeId: number) => number | null,
  rng: () => number,
): number {
  const points = new Map<number, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, i) => points.set(id, (points.get(id) ?? 0) + ranking.length - i));
  }
  if (points.size === 0) throw new Error('bordaWinner needs at least one ranked recipe');
  const best = Math.max(...points.values());
  const tied = sorted([...points].filter(([, p]) => p === best).map(([id]) => id));
  const time = (id: number) => cookTime(id) ?? Number.POSITIVE_INFINITY;
  const fastest = Math.min(...tied.map(time));
  const finalists = tied.filter((id) => time(id) === fastest);
  return finalists[Math.min(finalists.length - 1, Math.floor(rng() * finalists.length))];
}

export interface Participant {
  swipeDone: boolean;
  /** Tonight likes in this session. */
  likes: ReadonlySet<number>;
  topDone: boolean;
  topPicks: readonly number[];
  rankDone: boolean;
  /** Recipe ids in preference order (empty until submitted). */
  ranking: readonly number[];
}

export interface TonightState {
  status: TonightStatus;
  shortlist: readonly number[];
  participants: readonly Participant[];
}

export interface Advance {
  from: TonightStatus;
  to: TonightStatus;
  shortlist?: number[];
  winner?: number;
}

/**
 * The next step once both partners finished the current round, or null while
 * someone is still busy (or the stage ends by a tap, like choosing).
 */
export function tonightAdvance(
  state: TonightState,
  cookTime: (recipeId: number) => number | null,
  rng: () => number,
): Advance | null {
  const ps = state.participants;
  if (ps.length !== 2) return null;

  if (state.status === 'swiping' && ps.every((p) => p.swipeDone)) {
    const outcome = swipeOutcome(ps.map((p) => p.likes));
    return outcome.next === 'done'
      ? { from: 'swiping', to: 'done', winner: outcome.winner }
      : { from: 'swiping', to: outcome.next, shortlist: outcome.shortlist };
  }
  if (state.status === 'shortlisting' && ps.every((p) => p.topDone)) {
    return { from: 'shortlisting', to: 'ranking', shortlist: unionOfTops(ps.map((p) => p.topPicks)) };
  }
  if (state.status === 'ranking' && ps.every((p) => p.rankDone)) {
    return { from: 'ranking', to: 'done', winner: bordaWinner(ps.map((p) => p.ranking), cookTime, rng) };
  }
  return null;
}
