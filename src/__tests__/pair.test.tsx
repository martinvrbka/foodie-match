// Critical flow: pairing (typed code, email invite, QR code, unpair).
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import Pair from '../app/pair';
import { createPairingCode, redeemPairingCode, sendInvite, unpair } from '../data/pairing';

const mockProfile = { partner: null as null | { display_name: string }, reload: jest.fn() };

jest.mock('../data/supabase', () => ({ supabase: {} }));
jest.mock('../data/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }));
jest.mock('../data/profile', () => ({ useProfile: () => mockProfile }));
jest.mock('../data/pairing', () => ({
  createPairingCode: jest.fn(),
  redeemPairingCode: jest.fn(),
  sendInvite: jest.fn(),
  respondInvite: jest.fn(),
  unpair: jest.fn(),
  useInvites: () => ({ incoming: [], sent: [], error: null, reload: jest.fn() }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('react-native-qrcode-svg', () => {
  const { Text } = jest.requireActual('react-native');
  return ({ value }: { value: string }) => <Text>{`QR ${value}`}</Text>;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile.partner = null;
});

it('pairs with a typed code, normalizing case and dashes', async () => {
  jest.mocked(redeemPairingCode).mockResolvedValue({ partner_name: 'Anna' });
  await render(<Pair />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('6-character code'), 'abc-23x');
  await user.press(screen.getByRole('button', { name: 'Pair' }));
  expect(redeemPairingCode).toHaveBeenCalledWith('ABC23X');
  await waitFor(() => expect(mockProfile.reload).toHaveBeenCalled());
});

it('explains an invalid code without calling the server', async () => {
  await render(<Pair />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('6-character code'), 'ABC0O1');
  await user.press(screen.getByRole('button', { name: 'Pair' }));
  expect(redeemPairingCode).not.toHaveBeenCalled();
  expect(screen.getByText(/Codes have 6 letters and numbers/)).toBeTruthy();
});

it('shows the server reason when a code has expired', async () => {
  jest.mocked(redeemPairingCode).mockRejectedValue({ code: 'P0001', message: 'code_expired' });
  await render(<Pair />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('6-character code'), 'ABC23X');
  await user.press(screen.getByRole('button', { name: 'Pair' }));
  expect(await screen.findByText('That code has expired. Ask for a new one.')).toBeTruthy();
});

it('shows my QR code and typed code', async () => {
  jest.mocked(createPairingCode).mockResolvedValue({
    code: 'ABC23X',
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  });
  await render(<Pair />);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Show my pairing code' }));
  expect(await screen.findByText('QR foodiematch:pair:ABC23X')).toBeTruthy();
  expect(screen.getByText('ABC23X')).toBeTruthy();
  expect(screen.getByText(/Valid for (10:00|9:5\d)/)).toBeTruthy();
});

it('sends an email invite', async () => {
  jest.mocked(sendInvite).mockResolvedValue(undefined);
  await render(<Pair />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'anna@example.com');
  await user.press(screen.getByRole('button', { name: 'Send invite' }));
  expect(sendInvite).toHaveBeenCalledWith('anna@example.com');
});

it('when paired, unpairs only after confirming', async () => {
  mockProfile.partner = { display_name: 'Anna' };
  jest.mocked(unpair).mockResolvedValue(undefined);
  const alert = jest.spyOn(Alert, 'alert');
  await render(<Pair />);
  expect(screen.getByText("You're paired with Anna.")).toBeTruthy();

  await userEvent.setup().press(screen.getByRole('button', { name: 'Unpair' }));
  expect(unpair).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => {
    await buttons.find((b) => b.text === 'Unpair')!.onPress!();
  });
  expect(unpair).toHaveBeenCalledTimes(1);
  expect(mockProfile.reload).toHaveBeenCalled();
});
