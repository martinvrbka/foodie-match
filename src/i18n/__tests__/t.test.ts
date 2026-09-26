import { setLocale, t } from '../index';

afterEach(() => setLocale('en'));

describe('t()', () => {
  it('returns the string for a key', () => {
    expect(t('common.appName')).toBe('Foodie Match');
  });

  it('fills {placeholders} from params', () => {
    expect(t('common.error', { message: 'offline' })).toBe('Something went wrong: offline');
  });

  it('accepts numbers as params', () => {
    expect(t('common.error', { message: 42 })).toBe('Something went wrong: 42');
  });

  it('inserts params literally, even with regex replacement tokens like $&', () => {
    expect(t('common.error', { message: '$&$1' })).toBe('Something went wrong: $&$1');
  });

  it('leaves a placeholder visible when its param is missing', () => {
    expect(t('common.error', {})).toBe('Something went wrong: {message}');
    expect(t('common.error')).toBe('Something went wrong: {message}');
  });

  it('falls back to the key itself for an unknown key', () => {
    expect(t('nope.missing' as never)).toBe('nope.missing');
  });

  it('falls back to the key when the key points at a section, not a string', () => {
    expect(t('common' as never)).toBe('common');
  });

  it('falls back to English for an unknown locale', () => {
    setLocale('xx');
    expect(t('common.appName')).toBe('Foodie Match');
  });
});
