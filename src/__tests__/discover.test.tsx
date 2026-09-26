// Critical flow: swiping in Discover saves the like (and shows a match).
// The data layer and the animated card are mocked; buildDeck is real.
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import Discover from '../app/discover';
import { loadDiscover, swipe, undoLastSwipe, type DiscoverData } from '../data/discover';

jest.mock('../data/discover', () => ({
  loadDiscover: jest.fn(),
  swipe: jest.fn(),
  undoLastSwipe: jest.fn(),
}));
jest.mock('../data/supabase', () => ({ supabase: {} }));
jest.mock('../data/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }));
jest.mock('../data/exclusions', () => ({ exclusionsVersion: () => 0 }));
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
});

function data(partner: DiscoverData['deckInput']['partner'] = null): DiscoverData {
  return {
    recipes: new Map([
      [1, recipe(1, 'Pasta')],
      [2, recipe(2, 'Curry')],
    ]),
    partnerName: partner ? 'Anna' : null,
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
  jest.mocked(swipe).mockResolvedValue({ matched: false });
});

it('Like saves a like for the top card and shows the next one', async () => {
  jest.mocked(loadDiscover).mockResolvedValue(data());
  await render(<Discover />);
  await screen.findByText(/^top: /);
  const first = topTitle();
  const firstId = first.endsWith('Pasta') ? 1 : 2;

  await userEvent.setup().press(screen.getByRole('button', { name: 'Like' }));

  expect(swipe).toHaveBeenCalledWith(firstId, true);
  expect(topTitle()).not.toBe(first);
});

it('Nope saves a dislike', async () => {
  jest.mocked(loadDiscover).mockResolvedValue(data());
  await render(<Discover />);
  await screen.findByText(/^top: /);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Nope' }));
  expect(swipe).toHaveBeenCalledWith(expect.any(Number), false);
});

it('shows "It\'s a match!" when the like completes a match', async () => {
  jest.mocked(loadDiscover).mockResolvedValue(data({ excluded: new Set(), liked: new Set([1, 2]) }));
  jest.mocked(swipe).mockResolvedValue({ matched: true });
  await render(<Discover />);
  await screen.findByText(/^top: /);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Like' }));
  expect(await screen.findByText("It's a match!")).toBeTruthy();
  expect(screen.getByText('Anna likes it too.')).toBeTruthy();
});

it('puts the card back when saving fails', async () => {
  jest.mocked(loadDiscover).mockResolvedValue(data());
  jest.mocked(swipe).mockRejectedValue(new TypeError('Network request failed'));
  await render(<Discover />);
  await screen.findByText(/^top: /);
  const first = topTitle();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Like' }));
  await waitFor(() => expect(topTitle()).toBe(first));
  expect(screen.getByText(/Couldn't save that swipe/)).toBeTruthy();
});

it('Undo brings the last card back after the server undoes it', async () => {
  jest.mocked(loadDiscover).mockResolvedValue(data());
  jest.mocked(undoLastSwipe).mockResolvedValue({ recipe_id: 1, liked: true });
  await render(<Discover />);
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
  await render(<Discover />);
  expect(await screen.findByText(/^top: Pasta/)).toBeTruthy();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Nope' }));
  expect(await screen.findByText(/Curry.*Anna won't eat this/)).toBeTruthy();
});

it('shows the empty state when there is nothing left', async () => {
  jest.mocked(loadDiscover).mockResolvedValue({ ...data(), deckInput: { ...data().deckInput, mySwiped: new Set([1, 2]) } });
  await render(<Discover />);
  expect(await screen.findByText("You've seen every recipe")).toBeTruthy();
});
