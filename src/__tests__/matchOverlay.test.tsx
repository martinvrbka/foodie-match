// "It's a match!" on the partner's phone: a realtime INSERT on matches shows the
// overlay only for live swipe matches, once per recipe.
import { act, render, screen } from '@testing-library/react-native';
import { MatchOverlay } from '../components/MatchOverlay';
import { MatchProvider } from '../data/matches';

type Handler = (payload: { new: { recipe_id: number; via: string } }) => void;
let mockHandler: Handler | null = null;

jest.mock('../data/supabase', () => ({
  supabase: {
    channel: () => {
      const channel = {
        on: (_type: string, _filter: unknown, handler: Handler) => {
          mockHandler = handler;
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: jest.fn(),
  },
}));
jest.mock('../data/profile', () => ({
  useProfile: () => ({ me: { couple_id: 'c1' }, partner: { display_name: 'Anna' } }),
}));
jest.mock('../data/discover', () => ({
  cachedRecipes: () =>
    Promise.resolve([{ id: 5, title: 'Paella', image_url: null, cook_time_min: 40, cook_time_estimated: true, cuisine: null, category: null }]),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
}));

const insert = async (recipe_id: number, via: string) => {
  await act(async () => {
    mockHandler!({ new: { recipe_id, via } });
  });
};

beforeEach(() => {
  mockHandler = null;
});

it("shows the match on the partner's phone when a live swipe match arrives", async () => {
  await render(
    <MatchProvider>
      <MatchOverlay />
    </MatchProvider>,
  );
  expect(screen.queryByText("It's a match!")).toBeNull();
  await insert(5, 'swipe');
  expect(await screen.findByText("It's a match!")).toBeTruthy();
  expect(screen.getByText('Paella')).toBeTruthy();
  expect(screen.getByText('Anna likes it too.')).toBeTruthy();
});

it('ignores retroactive matches (after pairing or removing an exclusion)', async () => {
  await render(
    <MatchProvider>
      <MatchOverlay />
    </MatchProvider>,
  );
  await insert(5, 'retroactive');
  expect(screen.queryByText("It's a match!")).toBeNull();
});
