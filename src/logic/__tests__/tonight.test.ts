import { bordaWinner, swipeOutcome, tonightAdvance, unionOfTops, type Participant } from '../tonight';

const set = (...ids: number[]) => new Set(ids);
const noTime = () => null;
const first = () => 0;
const last = () => 0.999;

describe('swipeOutcome', () => {
  it('nothing liked by both → choose from anything either liked', () => {
    expect(swipeOutcome([set(1, 2), set(3)])).toEqual({ next: 'choosing', shortlist: [1, 2, 3] });
  });

  it('nobody liked anything → choosing with an empty list (only reshuffle)', () => {
    expect(swipeOutcome([set(), set()])).toEqual({ next: 'choosing', shortlist: [] });
  });

  it('exactly one liked by both → that is the winner', () => {
    expect(swipeOutcome([set(1, 2), set(2, 3)])).toEqual({ next: 'done', winner: 2 });
  });

  it('2 to 5 liked by both → rank them', () => {
    expect(swipeOutcome([set(1, 2, 9), set(2, 1)])).toEqual({ next: 'ranking', shortlist: [1, 2] });
    const five = set(1, 2, 3, 4, 5);
    expect(swipeOutcome([five, five])).toEqual({ next: 'ranking', shortlist: [1, 2, 3, 4, 5] });
  });

  it('more than 5 liked by both → each picks a top 5 first', () => {
    const six = set(1, 2, 3, 4, 5, 6);
    expect(swipeOutcome([six, six])).toEqual({ next: 'shortlisting', shortlist: [1, 2, 3, 4, 5, 6] });
  });
});

describe('unionOfTops', () => {
  it('combines both top 5s without duplicates (up to 10)', () => {
    expect(unionOfTops([[1, 2, 3, 4, 5], [4, 5, 6, 7, 8]])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(unionOfTops([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]])).toHaveLength(10);
  });
});

describe('bordaWinner', () => {
  it('rank 1 of N gets N points; highest total wins', () => {
    // A: 1 > 2 > 3 (3,2,1 points); B: 2 > 3 > 1 → totals 1:4, 2:5, 3:3
    expect(bordaWinner([[1, 2, 3], [2, 3, 1]], noTime, first)).toBe(2);
  });

  it('a tie goes to the shorter cook time', () => {
    // A: 1 > 2, B: 2 > 1 → 3 points each
    const time = (id: number) => ({ 1: 50, 2: 20 })[id] ?? null;
    expect(bordaWinner([[1, 2], [2, 1]], time, first)).toBe(2);
  });

  it('unknown cook time loses a cook-time tie-break', () => {
    const time = (id: number) => (id === 1 ? 90 : null);
    expect(bordaWinner([[1, 2], [2, 1]], time, last)).toBe(1);
  });

  it('a full tie is decided by the RNG, deterministically', () => {
    expect(bordaWinner([[1, 2], [2, 1]], noTime, first)).toBe(1);
    expect(bordaWinner([[1, 2], [2, 1]], noTime, last)).toBe(2);
    expect(bordaWinner([[1, 2], [2, 1]], noTime, first)).toBe(bordaWinner([[1, 2], [2, 1]], noTime, first));
  });

  it('works for a single recipe and refuses empty input', () => {
    expect(bordaWinner([[7], [7]], noTime, first)).toBe(7);
    expect(() => bordaWinner([[], []], noTime, first)).toThrow();
  });
});

describe('tonightAdvance', () => {
  const p = (over: Partial<Participant> = {}): Participant => ({
    swipeDone: false,
    likes: set(),
    topDone: false,
    topPicks: [],
    rankDone: false,
    ranking: [],
    ...over,
  });

  it('waits while a partner is still swiping', () => {
    const state = { status: 'swiping' as const, shortlist: [], participants: [p({ swipeDone: true }), p()] };
    expect(tonightAdvance(state, noTime, first)).toBeNull();
  });

  it('after both swiped, applies the swipe outcome', () => {
    const state = {
      status: 'swiping' as const,
      shortlist: [],
      participants: [p({ swipeDone: true, likes: set(1, 2) }), p({ swipeDone: true, likes: set(2) })],
    };
    expect(tonightAdvance(state, noTime, first)).toEqual({ from: 'swiping', to: 'done', winner: 2 });
  });

  it('after both picked a top 5, ranks the union', () => {
    const state = {
      status: 'shortlisting' as const,
      shortlist: [1, 2, 3, 4, 5, 6, 7],
      participants: [p({ topDone: true, topPicks: [1, 2, 3, 4, 5] }), p({ topDone: true, topPicks: [3, 4, 5, 6, 7] })],
    };
    expect(tonightAdvance(state, noTime, first)).toEqual({
      from: 'shortlisting',
      to: 'ranking',
      shortlist: [1, 2, 3, 4, 5, 6, 7],
    });
  });

  it('after both ranked, the Borda winner is done', () => {
    const state = {
      status: 'ranking' as const,
      shortlist: [1, 2, 3],
      participants: [p({ rankDone: true, ranking: [1, 2, 3] }), p({ rankDone: true, ranking: [2, 3, 1] })],
    };
    expect(tonightAdvance(state, noTime, first)).toEqual({ from: 'ranking', to: 'done', winner: 2 });
  });

  it('never advances choosing (a tap decides), done or cancelled, or with one participant', () => {
    const everyoneDone = p({ swipeDone: true, topDone: true, rankDone: true });
    for (const status of ['choosing', 'done', 'cancelled'] as const) {
      expect(tonightAdvance({ status, shortlist: [1], participants: [everyoneDone, everyoneDone] }, noTime, first)).toBeNull();
    }
    expect(tonightAdvance({ status: 'swiping', shortlist: [], participants: [everyoneDone] }, noTime, first)).toBeNull();
  });
});
