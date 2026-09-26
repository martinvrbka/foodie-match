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

beforeEach(() => jest.clearAllMocks());

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
