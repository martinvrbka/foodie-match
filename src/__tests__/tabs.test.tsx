// Critical flow: the bottom panel. The app opens on Swipe, the four items are one tap
// away, and the Matches / Week plan items carry the badges that replaced Home's banners.
// The real tab layout; screens and data hooks are stand-ins.
import { Text } from 'react-native';
import { userEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import TabsLayout from '../app/(tabs)/_layout';

let mockMatches: { recipe: { id: number }; createdAt: string }[] = [];
let mockTonight: unknown = null;
let mockWeek: unknown = null;

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../data/supabase', () => ({ supabase: {} }));
jest.mock('../data/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }));
jest.mock('../data/profile', () => ({
  useProfile: () => ({ me: { id: 'me', onboarded: true }, partner: { id: 'p', display_name: 'Anna' } }),
}));
jest.mock('../data/matches', () => ({
  useMatchList: () => ({ matches: mockMatches }),
  useMatchesLastSeen: () => '2026-09-01T00:00:00Z',
}));
jest.mock('../data/tonight', () => ({ useTonight: () => ({ data: mockTonight }) }));
jest.mock('../data/week', () => ({ useWeek: () => ({ data: mockWeek }) }));

const screenOf = (name: string) => () => <Text>{`${name} screen`}</Text>;
const routes = {
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': screenOf('Swipe'),
  '(tabs)/matches': screenOf('Matches'),
  '(tabs)/recipes': screenOf('Recipes'),
  '(tabs)/week': screenOf('Week plan'),
};

beforeEach(() => {
  mockMatches = [];
  mockTonight = null;
  mockWeek = null;
});

it('opens on Swipe with the four items: Swipe, Matches, Recipes, Week plan', async () => {
  await renderRouter(routes, { initialUrl: '/' });
  expect(await screen.findByText('Swipe screen')).toBeTruthy();
  const tabs = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel ?? '');
  expect(tabs.map((l: string) => l.split(',')[0])).toEqual(['Swipe', 'Matches', 'Recipes', 'Week plan']);
  expect(screen.getByRole('button', { name: /^Swipe/ }).props.accessibilityState).toMatchObject({ selected: true });
});

it('one tap on Week plan shows it; the panel stays and highlights it', async () => {
  await renderRouter(routes, { initialUrl: '/' });
  await screen.findByText('Swipe screen');
  await userEvent.setup().press(screen.getByRole('button', { name: /^Week plan/ }));
  expect(await screen.findByText('Week plan screen')).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Week plan/ }).props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByRole('button', { name: /^Swipe/ })).toBeTruthy();
});

it('badges: new matches count on Matches, "!" for a Tonight round or a week plan to join', async () => {
  mockMatches = [
    { recipe: { id: 1 }, createdAt: '2026-09-27T10:00:00Z' },
    { recipe: { id: 2 }, createdAt: '2026-08-01T10:00:00Z' },
  ];
  await renderRouter(routes, { initialUrl: '/' });
  await screen.findByText('Swipe screen');
  expect(screen.getByText('1')).toBeTruthy();
  expect(screen.queryByText('!')).toBeNull();
  screen.unmount();

  mockTonight = { session: { status: 'swiping', startedBy: 'p' }, me: { swipeDone: false } };
  mockWeek = { plans: [{ id: 'w', status: 'choosing', startedBy: 'p' }], members: new Map() };
  await renderRouter(routes, { initialUrl: '/' });
  await screen.findByText('Swipe screen');
  expect(screen.getAllByText('!')).toHaveLength(2);
});
