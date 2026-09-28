// Critical flows of the week plan: start dishes, Generate uses only dishes nobody
// rejected, and calendar edits follow the repeat and leftover rules. Data layer mocked.
import { render, screen, userEvent } from '@testing-library/react-native';
import Week from '../app/(tabs)/week';

const recipe = (id: number, title: string) => ({
  id,
  title,
  image_url: null,
  cook_time_min: 30,
  cook_time_estimated: true,
  cuisine: 'Italian',
  category: 'Beef',
});
const mockRecipes = [recipe(1, 'Curry'), recipe(2, 'Chilli'), recipe(3, 'Lasagne'), recipe(4, 'Paella')];

const MON = '2026-09-28';
const TUE = '2026-09-29';
const FRI = '2026-10-02';
const plan = (over = {}) => ({
  id: 'p1',
  weekStart: MON,
  firstDay: MON,
  createdOn: '2026-09-27',
  status: 'generated',
  leftovers: 3,
  picks: [1, 2, 3],
  startedBy: 'me',
  generatedBy: 'me',
  generatedAt: '2026-09-27T10:00:00Z',
  acceptedBy: null,
  phase: 'active',
  ...over,
});
const slot = (day: string, meal: string, recipeId: number | null) => ({
  day,
  meal,
  recipeId,
  locked: false,
  note: null,
  changedBy: 'me',
  changedAt: '2026-09-27T10:00:00Z',
});
const calendarSlots = [slot(MON, 'dinner', 1), slot(TUE, 'lunch', 1), slot(FRI, 'dinner', 3)];

function weekData(p: ReturnType<typeof plan>, slots = calendarSlots, over: Record<string, unknown> = {}) {
  return {
    today: MON,
    plans: [p],
    slots: new Map([[p.id, slots]]),
    members: new Map([
      [
        p.id,
        [
          { userId: 'me', reswipeDone: true },
          { userId: 'anna', reswipeDone: false },
        ],
      ],
    ]),
    swipes: new Map([[p.id, [{ userId: 'anna', recipeId: 2, liked: false, createdAt: '2026-09-27T09:00:00Z' }]]]),
    noLeftovers: new Set<number>(),
    ...over,
  };
}

const mockWeek = {
  data: null as unknown,
  error: null,
  reload: jest.fn(),
  start: jest.fn(() => Promise.resolve({ id: 'p1', joined: false })),
  setCells: jest.fn(() => Promise.resolve()),
  setLeftovers: jest.fn(() => Promise.resolve()),
  beginChoosing: jest.fn(() => Promise.resolve(true)),
  reswipe: jest.fn(() => Promise.resolve()),
  undoReswipe: jest.fn(() => Promise.resolve(1)),
  finishReswipe: jest.fn(() => Promise.resolve()),
  generate: jest.fn(() => Promise.resolve()),
  saveEdit: jest.fn(() => Promise.resolve()),
  accept: jest.fn(() => Promise.resolve()),
  markSeen: jest.fn(() => Promise.resolve(null)),
  remove: jest.fn(() => Promise.resolve()),
  setLeftoversOk: jest.fn(() => Promise.resolve()),
};

jest.mock('../data/supabase', () => ({ supabase: {} }));
jest.mock('../data/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }));
jest.mock('../data/profile', () => ({
  useProfile: () => ({ me: { id: 'me', display_name: 'Martin' }, partner: { id: 'anna', display_name: 'Anna' } }),
}));
jest.mock('../data/discover', () => ({ cachedRecipes: () => Promise.resolve(mockRecipes) }));
jest.mock('../data/matches', () => ({
  useMatchList: () => ({ matches: mockRecipes.map((r) => ({ recipe: r, createdAt: '2026-09-26T10:00:00Z' })) }),
}));
jest.mock('../data/week', () => ({
  ...jest.requireActual('../data/week'),
  useWeek: () => mockWeek,
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('../components/SwipeCard', () => ({ CardFace: () => null, SwipeCard: () => null }));

beforeEach(() => jest.clearAllMocks());

it('setup: "Choose this week\'s dishes" starts the re-swipe', async () => {
  const p = plan({ status: 'setup', picks: [] });
  mockWeek.data = weekData(p, [slot(MON, 'lunch', null), slot(MON, 'dinner', null)]);
  await render(<Week />);
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: "Choose this week's dishes" }));
  expect(mockWeek.beginChoosing).toHaveBeenCalledWith(p, expect.any(Array), expect.any(Array));
});

it('Generate uses this week\'s picks except the dish my partner passed on', async () => {
  const p = plan({ status: 'choosing', generatedBy: null, generatedAt: null });
  mockWeek.data = weekData(p, [slot(MON, 'lunch', null), slot(MON, 'dinner', null)]);
  await render(<Week />);
  const user = userEvent.setup();
  expect(await screen.findByText('Anna is still choosing. You can generate now or wait.')).toBeTruthy();
  await user.press(screen.getByRole('button', { name: 'Generate' }));
  const [, , candidates] = mockWeek.generate.mock.calls[0] as unknown as [unknown, unknown, { id: number }[]];
  expect(candidates.map((c) => c.id)).toEqual([1, 3]);
});

it('with no matches, the couple is told to get some first', async () => {
  const p = plan({ status: 'choosing', picks: [] });
  mockWeek.data = weekData(p, [slot(MON, 'dinner', null)]);
  await render(<Week />);
  expect(await screen.findByText('You need matches to plan a week')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();
});

it('swapping a dish already planned into Friday is refused and nothing is saved', async () => {
  mockWeek.data = weekData(plan());
  await render(<Week />);
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: 'Dinner: Lasagne' }));
  await user.press(screen.getByRole('button', { name: 'Swap' }));
  await user.press(screen.getByRole('button', { name: 'Curry' }));
  expect(await screen.findByText('Curry is already planned this week')).toBeTruthy();
  expect(mockWeek.saveEdit).not.toHaveBeenCalled();
});

it("clearing the cook-day meal saves its leftover as removed; the prep schedule showed it", async () => {
  mockWeek.data = weekData(plan());
  await render(<Week />);
  const user = userEvent.setup();
  expect(await screen.findByText('Cook a double portion on Mon 28/9')).toBeTruthy();
  await user.press(screen.getByRole('button', { name: 'Dinner: Curry' }));
  await user.press(screen.getByRole('button', { name: 'Clear' }));
  const [, , after] = mockWeek.saveEdit.mock.calls[0] as unknown as [string, unknown, { day: string; meal: string; recipeId: number | null; note: string | null }[]];
  expect(after.find((s) => s.day === TUE && s.meal === 'lunch')).toMatchObject({ recipeId: null, note: 'leftover_removed' });
});

it('shows who changed a meal since I last opened the plan, and who made the plan', async () => {
  const changed = { ...slot(FRI, 'dinner', 3), changedBy: 'anna', changedAt: '2026-09-28T08:00:00Z' };
  mockWeek.markSeen.mockResolvedValueOnce('2026-09-28T07:00:00Z' as never);
  mockWeek.data = weekData(plan({ generatedBy: 'anna', generatedAt: '2026-09-28T07:30:00Z' }), [...calendarSlots.slice(0, 2), changed]);
  await render(<Week />);
  expect(await screen.findByText('Changed by Anna')).toBeTruthy();
  expect(screen.getByText('Anna made the plan — review it now')).toBeTruthy();
});
