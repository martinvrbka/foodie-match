// Critical flow: Tonight ranking and the winner screen. Data layer mocked.
import { render, screen, userEvent } from '@testing-library/react-native';
import Tonight from '../app/tonight';

const recipe = (id: number, title: string, cook = 30) => ({
  id,
  title,
  image_url: null,
  cook_time_min: cook,
  cook_time_estimated: true,
  cuisine: 'Italian',
  category: null,
});
const mockRecipes = [recipe(1, 'Pasta'), recipe(2, 'Curry'), recipe(3, 'Soup')];

const participant = (over = {}) => ({
  swipeDone: true,
  likes: new Set<number>(),
  topDone: false,
  topPicks: [],
  rankDone: false,
  ranking: [],
  ...over,
});
const mockTonight = {
  data: null as unknown,
  error: null,
  reload: jest.fn(),
  start: jest.fn(() => Promise.resolve()),
  swipe: jest.fn(() => Promise.resolve()),
  finishSwiping: jest.fn(() => Promise.resolve()),
  submitTop: jest.fn(() => Promise.resolve()),
  submitRanking: jest.fn(() => Promise.resolve()),
  choose: jest.fn(() => Promise.resolve()),
  cancel: jest.fn(() => Promise.resolve()),
  reshuffle: jest.fn(() => Promise.resolve()),
};
const mockDismiss = jest.fn();

jest.mock('../data/supabase', () => ({ supabase: {} }));
jest.mock('../data/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }));
jest.mock('../data/profile', () => ({ useProfile: () => ({ partner: { display_name: 'Anna' } }) }));
jest.mock('../data/discover', () => ({ cachedRecipes: () => Promise.resolve(mockRecipes) }));
jest.mock('../data/matches', () => ({
  useMatchList: () => ({ matches: mockRecipes.map((r) => ({ recipe: r, createdAt: '2026-09-26T10:00:00Z' })) }),
}));
jest.mock('../data/tonight', () => ({
  useTonight: () => mockTonight,
  tonightDismissed: () => null,
  dismissTonight: (...args: unknown[]) => mockDismiss(...args),
}));
// Week plan: null = no plan, so the round works as before.
const mockWeek = { data: null as unknown, saveEdit: jest.fn(() => Promise.resolve()) };
jest.mock('../data/week', () => ({ ...jest.requireActual('../data/week'), useWeek: () => mockWeek }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('../components/SwipeCard', () => ({ CardFace: () => null, SwipeCard: () => null }));

const session = (over = {}) => ({
  id: 's1',
  status: 'ranking',
  startedBy: 'me',
  filters: { maxMinutes: null, cuisine: null },
  shortlist: [1, 2, 3],
  winnerRecipeId: null,
  completedAt: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockWeek.data = null;
});

it('ranking: tapping in order submits that order', async () => {
  mockTonight.data = { session: session(), me: participant(), partner: participant(), mySwiped: new Set(), history: [] };
  await render(<Tonight />);
  const user = userEvent.setup();
  expect(await screen.findByText('Rank the shortlist')).toBeTruthy();
  const submit = screen.getByRole('button', { name: 'Submit' });
  await user.press(screen.getByRole('button', { name: 'Curry' }));
  await user.press(screen.getByRole('button', { name: 'Soup' }));
  await user.press(screen.getByRole('button', { name: 'Pasta' }));
  await user.press(submit);
  expect(mockTonight.submitRanking).toHaveBeenCalledWith([2, 3, 1]);
});

it('ranking: waits for the partner once I submitted', async () => {
  mockTonight.data = {
    session: session(),
    me: participant({ rankDone: true }),
    partner: participant(),
    mySwiped: new Set(),
    history: [],
  };
  await render(<Tonight />);
  expect(await screen.findByText('Waiting for Anna…')).toBeTruthy();
});

it('shows the winner on both phones once done, until dismissed', async () => {
  mockTonight.data = {
    session: session({ status: 'done', winnerRecipeId: 2, completedAt: '2026-09-26T19:00:00Z' }),
    me: participant(),
    partner: participant(),
    mySwiped: new Set(),
    history: [{ recipeId: 2, completedAt: '2026-09-26T19:00:00Z' }],
  };
  await render(<Tonight />);
  expect(await screen.findByText("Tonight we're cooking")).toBeTruthy();
  expect(await screen.findByText('Curry')).toBeTruthy();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Done' }));
  expect(mockDismiss).toHaveBeenCalledWith('me', 's1');
  expect(await screen.findByText('What do we eat tonight?')).toBeTruthy();
});

it('choosing: the tapped recipe is chosen; with nothing liked only reshuffle is offered', async () => {
  mockTonight.data = {
    session: session({ status: 'choosing', shortlist: [1, 3] }),
    me: participant(),
    partner: participant(),
    mySwiped: new Set(),
    history: [],
  };
  const { rerender } = await render(<Tonight />);
  await userEvent.setup().press(await screen.findByRole('button', { name: 'Soup' }));
  expect(mockTonight.choose).toHaveBeenCalledWith(3);

  mockTonight.data = { ...(mockTonight.data as object), session: session({ status: 'choosing', shortlist: [] }) };
  await rerender(<Tonight />);
  expect(await screen.findByText('Nobody liked anything this round.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reshuffle and swipe again' })).toBeTruthy();
});

it('start form: shows how many matches fit and starts with the chosen filter', async () => {
  mockTonight.data = { session: null, me: null, partner: null, mySwiped: new Set(), history: [] };
  await render(<Tonight />);
  expect(await screen.findByText('3 matches to swipe')).toBeTruthy();
  await userEvent.setup().press(screen.getByRole('switch', { name: '≤ 30 min' }));
  await userEvent.setup().press(screen.getByRole('button', { name: 'Start' }));
  expect(mockTonight.start).toHaveBeenCalledWith({ maxMinutes: 30, cuisine: null });
});

describe('with a week plan', () => {
  const TODAY = '2026-09-28';
  const slot = (day: string, meal: string, recipeId: number | null) => ({
    day, meal, recipeId, locked: false, note: null, changedBy: 'me', changedAt: null,
  });
  const withDinner = () => {
    const p = {
      id: 'p1', weekStart: TODAY, firstDay: TODAY, createdOn: '2026-09-27', status: 'accepted', leftovers: 3,
      picks: [], startedBy: 'me', generatedBy: 'me', generatedAt: null, acceptedBy: 'me', phase: 'active',
    };
    // Curry tonight, its leftover tomorrow lunch.
    const slots = [slot(TODAY, 'dinner', 2), slot('2026-09-29', 'lunch', 2)];
    return { today: TODAY, plans: [p], slots: new Map([['p1', slots]]), members: new Map(), swipes: new Map(), noLeftovers: new Set() };
  };

  it("offers tonight's planned dinner first; \"Choose something else\" opens the usual round", async () => {
    mockWeek.data = withDinner();
    mockTonight.data = { session: null, me: null, partner: null, mySwiped: new Set(), history: [] };
    await render(<Tonight />);
    expect(await screen.findByText("Tonight's plan")).toBeTruthy();
    expect(await screen.findByText('Curry')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eat this' })).toBeTruthy();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Choose something else' }));
    expect(await screen.findByRole('button', { name: 'Start' })).toBeTruthy();
  });

  it("the round's winner replaces tonight's dinner and removes its leftover", async () => {
    mockWeek.data = withDinner();
    const completedAt = new Date(2026, 8, 28, 19, 0).toISOString(); // this evening, local time
    mockTonight.data = {
      session: session({ status: 'done', winnerRecipeId: 1, completedAt }),
      me: participant(), partner: participant(), mySwiped: new Set(), history: [],
    };
    await render(<Tonight />);
    expect(await screen.findByText("Tonight we're cooking")).toBeTruthy();
    const [, , after] = mockWeek.saveEdit.mock.calls[0] as unknown as [string, unknown, { day: string; meal: string; recipeId: number | null; note: string | null }[]];
    expect(after).toEqual([
      expect.objectContaining({ day: TODAY, meal: 'dinner', recipeId: 1 }),
      expect.objectContaining({ day: '2026-09-29', meal: 'lunch', recipeId: null, note: 'leftover_removed' }),
    ]);
  });
});
