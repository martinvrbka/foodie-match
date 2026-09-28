// Critical flow: advanced filters and "Do not eat" in the recipe overview.
// Data layer mocked; the filter rules (src/logic/filters) are real.
import { act, render, screen, userEvent } from '@testing-library/react-native';
import Recipes from '../app/recipes';
import { UNDO_MS } from '../components/UndoToast';

const mockSetFilters = jest.fn();
const mockSetHidden = jest.fn();

jest.mock('../data/supabase', () => ({ supabase: {} }));
jest.mock('../data/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { router: { push: jest.fn(), back: jest.fn() }, useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
const recipe = (id: number, title: string, cook_time_min: number | null, cuisine: string) => ({
  id,
  title,
  image_url: null,
  cook_time_min,
  cook_time_estimated: true,
  cuisine,
  category: null,
  difficulty: 'easy' as const,
});
jest.mock('../data/discover', () => ({
  cachedRecipes: () =>
    Promise.resolve([
      recipe(1, 'Quick salad', 25, 'Italian'),
      recipe(2, 'Beef ragu', 300, 'Italian'),
      recipe(3, 'Mystery stew', null, 'Mexican'),
    ]),
  loadMyRecipeMarks: () => Promise.resolve({ liked: new Set(), nope: new Set(), matches: new Set() }),
}));
// A stateful stand-in for the real hook (which saves to Supabase).
jest.mock('../data/filters', () => {
  const { useState } = jest.requireActual('react');
  const actual = jest.requireActual('../data/filters');
  return {
    toFilterable: actual.toFilterable,
    useRecipeSettings: () => {
      const [settings, set] = useState({
        filters: { maxMinutes: null, difficulties: [], cuisines: [] },
        hidden: new Set<number>(),
      });
      return {
        settings,
        loadError: null,
        saveError: null,
        reload: () => {},
        setFilters: (filters: unknown) => {
          mockSetFilters(filters);
          set((s: typeof settings) => ({ ...s, filters }));
        },
        setHidden: (id: number, hidden: boolean) => {
          mockSetHidden(id, hidden);
          set((s: typeof settings) => {
            const next = new Set(s.hidden);
            if (hidden) next.add(id);
            else next.delete(id);
            return { ...s, hidden: next };
          });
        },
      };
    },
  };
});

beforeEach(() => jest.clearAllMocks());

it('max time hides longer and untimed recipes and counts the filter; Clear filters brings them back', async () => {
  await render(<Recipes />);
  expect(await screen.findByText('Beef ragu')).toBeTruthy();
  const user = userEvent.setup();

  await user.press(screen.getByRole('button', { name: 'Advanced filters' }));
  expect(screen.getByText('Also applies to weekly matching')).toBeTruthy();
  await user.press(screen.getByRole('switch', { name: '30 min' }));

  expect(mockSetFilters).toHaveBeenLastCalledWith({ maxMinutes: 30, difficulties: [], cuisines: [] });
  expect(screen.getByText('Quick salad')).toBeTruthy();
  expect(screen.queryByText('Beef ragu')).toBeNull();
  expect(screen.queryByText('Mystery stew')).toBeNull();
  expect(screen.getByRole('button', { name: 'Advanced filters (1)' })).toBeTruthy();

  await user.press(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByText('Beef ragu')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Advanced filters' })).toBeTruthy();
});

it('"Do not eat" hides the recipe; Undo works only while the message is shown', async () => {
  jest.useFakeTimers();
  try {
    await render(<Recipes />);
    expect(await screen.findByText('Beef ragu')).toBeTruthy();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await user.press(screen.getByRole('button', { name: 'Do not eat: Beef ragu' }));
    expect(mockSetHidden).toHaveBeenCalledWith(2, true);
    expect(screen.queryByText('Beef ragu')).toBeNull();
    expect(screen.getByText("Hidden: you won't see this recipe again")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Do not eat list (1)' })).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'Undo' }));
    expect(mockSetHidden).toHaveBeenLastCalledWith(2, false);
    expect(screen.getByText('Beef ragu')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'Do not eat: Beef ragu' }));
    await act(() => jest.advanceTimersByTime(UNDO_MS));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByText('Beef ragu')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

it('shows "No recipes match your filters" with Clear filters when nothing passes', async () => {
  await render(<Recipes />);
  await screen.findByText('Beef ragu');
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Advanced filters' }));
  await user.press(screen.getByRole('switch', { name: '15 min' }));
  expect(screen.getByText('No recipes match your filters')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Clear filters' }).length).toBeGreaterThan(0);
});
