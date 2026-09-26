import { en } from '../../i18n/en';
import { errorText } from '../errors';

describe('errorText', () => {
  it('maps Supabase Auth error codes', () => {
    expect(errorText({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      en.errors.invalidCredentials,
    );
    expect(errorText({ code: 'user_already_exists' })).toBe(en.errors.emailTaken);
  });

  it('maps codes raised by our RPCs (sent as the message, with SQL state P0001)', () => {
    expect(errorText({ code: 'P0001', message: 'code_expired' })).toBe(en.errors.codeExpired);
    expect(errorText({ code: 'P0001', message: 'partner_already_paired' })).toBe(en.errors.partnerAlreadyPaired);
  });

  it('recognizes network failures', () => {
    expect(errorText({ name: 'AuthRetryableFetchError', message: '' })).toBe(en.errors.network);
    expect(errorText(new TypeError('Network request failed'))).toBe(en.errors.network);
  });

  it('falls back to a generic message for anything else', () => {
    expect(errorText({ code: 'XX000', message: 'boom' })).toBe(en.errors.unknown);
    expect(errorText(null)).toBe(en.errors.unknown);
    expect(errorText('weird')).toBe(en.errors.unknown);
  });
});
