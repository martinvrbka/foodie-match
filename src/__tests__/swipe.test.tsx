// Critical flow: swiping on the Swipe tab saves the like (and shows a match), and the
// shared filters reshape the deck. The data layer and the animated card are mocked;
// buildDeck is real.
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import Swipe from '../app/(tabs)/index';
import { loadDiscover, swipe, undoLastSwipe, type DiscoverData } from '../data/discover';

const mockCelebrate = jest.fn();
let mockSettingsVersion = 0;

jest.mock('../data/discover', () => ({
  loadDiscover: jest.fn(),
  swipe: jest.fn(),
  undoLastSwipe: jest.fn(),
  cachedRecipes: () => Promise.resolve([]),
}));
jest.mock('../data/supabase', () => ({ supabase: {} }));
jest.mock('../data/matches', () => ({ useMatchCelebration: () => ({ celebrate: mockCelebrate }) }));
jest.mock('../data/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }));
jest.mock('../data/exclusions', () => ({ exclusionsVersion: () => 0 }));
jest.mock('../data/pairing', () => ({ useInvites: () => ({ incoming: [], reload: jest.fn() }) }));
jest.mock('../data/filters', () => ({
  toFilterable: (r: unknown) => r,
  useRecipeSettings: () => ({
    settings: { filters: { maxMinutes: 30, difficulties: [], cuisines: [] }, hidden: new Set() },
    version: mockSettingsVersion,
    saveError: null,
    setFilters: jest.fn(),
  }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { push: jest.fn(), back: jest.fn() },
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});
// The real card animates with reanimated; this one swipes immediately.
jest.mock('../components/SwipeCard', () => {
  const { useImperativeHandle } = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
  CardFace: ({ recipe }: { recipe: { title: string } }) => <Text>{`under: ${recipe.title}`}</Text>,
  SwipeCard: ({ recipe, badge, onSwiped, ref }: any) => {
    useImperativeHandle(ref, () => ({ swipe: (dir: 'left' | 'right') => onSwiped(dir) }));
    return (
      <Text>
        {`top: ${recipe.title}`}
        {badge ? ` [${badge}]` : ''}
      </Text>
    );
  },
  };
});

const recipe = (id: number, title: string) => ({
  id,
  title,
  image_url: null,
  cook_time_min: 30,
  cook_time_estimated: true,
  cuisine: null,
  category: null,
  difficulty: null,
});

function data(partner: DiscoverData['deckInput']['partner'] = null): DiscoverData {
  return {
    recipes: new Map([
      [1, recipe(1, 'Pasta')],
      [2, recipe(2, 'Curry')],
    ]),
    partnerName: partner ? 'Anna' : null,
    filtersHoldBack: false,
    deckInput: {
      recipes: [
        { id: 1, ingredientIds: [] },
        { id: 2, ingredientIds: [7] },
      ],
      myExcluded: new Set(),
      mySwiped: new Set(),
      partner,
    },
  };
}

const topTitle = () => screen.getByText(/^top: /).props.children[0] as string;

beforeEach(() => {
  jest.clearAllMocks();
  mockSettingsVersion = 0;
  jest.mocked(swipe).mockResolvedValue({ matched: false });
});

it('Like saves a like for the top card and shows the next one', async () => {
  jest.mocked(loadDiscover).mockResolvedValue(data());
  await render(<Swipe />);
  await screen.findByText(/^top: /);
  const first = topTitle();
  const firstId = first.endsWith('Pasta') ? 1 : 2;

  await userEvent.setup().press(screen.getByRole('button', { name: 'Like' }));

  expect(swipe).toHaveBeenCalledWith(firstId, true);
  expect(topTitle()).not.toBe(first);
});

it('Nope saves a dislike', async () => {
  jest.mocked(loadDiscover).mockResolvedValue(data());
  await render(<Swipe />);
  await screen.findByText(/^top: /);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Nope' }));
  expect(swipe).toHaveBeenCalledWith(expect.any(Number), false);
});

// The overlay itself is shared (MatchOverlay, tested separately); Discover must trigger it.
it('celebrates when the like completes a match, and only then', async () => {
  jest.mocked(loadDiscover).mockResolvedValue(data({ excluded: new Set(), liked: new Set([1, 2]) }));
  jest.mocked(swipe).mockResolvedValueOnce({ matched: true }).mockResolvedValueOnce({ matched: false });
  await render(<Swipe />);
  await screen.findByText(/^top: /);
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Like' }));
  const firstId = jest.mocked(swipe).mock.calls[0][0];
  await waitFor(() => expect(mockCelebrate).toHaveBeenCalledWith(firstId));
  await user.press(screen.getByRole('button', { name: 'Like' }));
  await waitFor(() => expect(swipe).toHaveBeenCalledTimes(2));
  expect(mockCelebrate).toHaveBeenCalledTimes(1);
});

it('puts the card back when saving fails', async () => {
  jest.mocked(loadDiscover).mockResolvedValue(data());
  jest.mocked(swipe).mockRejectedValue(new TypeError('Network request failed'));
  await render(<Swipe />);
  await screen.findByText(/^top: /);
  const first = topTitle();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Like' }));
  await waitFor(() => expect(topTitle()).toBe(first));
  expect(screen.getByText(/Couldn't save that swipe/)).toBeTruthy();
});

it('Undo brings the last card back after the server undoes it', async () => {
  jest.mocked(loadDiscover).mockResolvedValue(data());
  jest.mocked(undoLastSwipe).mockResolvedValue({ recipe_id: 1, liked: true });
  await render(<Swipe />);
  await screen.findByText(/^top: /);
  const first = topTitle();
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Like' }));
  await user.press(screen.getByRole('button', { name: 'Undo' }));
  expect(undoLastSwipe).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(topTitle()).toBe(first));
});

it("marks cards the partner won't eat", async () => {
  // Partner excludes ingredient 7 (in Curry): Curry goes last, with a badge.
  jest.mocked(loadDiscover).mockResolvedValue(data({ excluded: new Set([7]), liked: new Set() }));
  await render(<Swipe />);
  expect(await screen.findByText(/^top: Pasta/)).toBeTruthy();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Nope' }));
  expect(await screen.findByText(/Curry.*Anna won't eat this/)).toBeTruthy();
});

it('shows the empty state when there is nothing left', async () => {
  jest.mocked(loadDiscover).mockResolvedValue({ ...data(), deckInput: { ...data().deckInput, mySwiped: new Set([1, 2]) } });
  await render(<Swipe />);
  expect(await screen.findByText("You've seen every recipe")).toBeTruthy();
});

it('drops recipes blocked by either partner\'s filters or "Do not eat" marks', async () => {
  jest.mocked(loadDiscover).mockResolvedValue({ ...data(), deckInput: { ...data().deckInput, blocked: new Set([1]) } });
  await render(<Swipe />);
  expect(await screen.findByText(/^top: Curry/)).toBeTruthy();
  expect(screen.queryByText(/Pasta/)).toBeNull();
});

it('when the filters leave no recipe: "No recipe matches the filters." and Filters opens the panel', async () => {
  const partner = { excluded: new Set<number>(), liked: new Set<number>() };
  const held: DiscoverData = { ...data(partner), filtersHoldBack: true };
  held.deckInput = { ...held.deckInput, blocked: new Set([1, 2]) };
  jest.mocked(loadDiscover).mockResolvedValue(held);
  await render(<Swipe />);
  expect(await screen.findByText('No recipe matches the filters.')).toBeTruthy();
  expect(screen.queryByText("You've seen every recipe")).toBeNull();

  // The header button and the empty state's button both open the same panel.
  const buttons = screen.getAllByRole('button', { name: 'Filters (1)' });
  expect(buttons).toHaveLength(2);
  await userEvent.setup().press(buttons[1]);
  expect(await screen.findByText('Max preparation time')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
});

it("a filter change (mine or my partner's) rebuilds the deck at once; swiped cards stay gone, the top card stays", async () => {
  const three = (): DiscoverData => {
    const d = data();
    d.recipes.set(3, recipe(3, 'Soup'));
    d.deckInput = { ...d.deckInput, recipes: [...d.deckInput.recipes, { id: 3, ingredientIds: [] }] };
    return d;
  };
  jest.mocked(loadDiscover).mockResolvedValue(three());
  const view = await render(<Swipe />);
  await screen.findByText(/^top: /);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Nope' }));
  const swipedId = jest.mocked(swipe).mock.calls[0][0];
  const top = topTitle();

  // The new filters still allow everything; even if the server doesn't have the swipe yet,
  // the swiped card stays gone.
  const after = three();
  jest.mocked(loadDiscover).mockResolvedValue(after);
  mockSettingsVersion = 1;
  await view.rerender(<Swipe />);

  await waitFor(() => expect(loadDiscover).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(topTitle()).toBe(top));
  expect(screen.queryByText(new RegExp(after.recipes.get(swipedId)!.title))).toBeNull();
});

it('has no back button: the bottom panel does the navigation', async () => {
  jest.mocked(loadDiscover).mockResolvedValue(data());
  await render(<Swipe />);
  await screen.findByText(/^top: /);
  expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Profile' })).toBeTruthy();
});
