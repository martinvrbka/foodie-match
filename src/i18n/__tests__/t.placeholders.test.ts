// Uses a fake string table to reach placeholder names the real one doesn't contain yet.
jest.mock('../en', () => ({ en: { demo: { proto: 'Hi {name}, {toString}' } } }));
import { t } from '../index';

// KNOWN BUG: `p in params` also sees Object.prototype, so a missing param named
// toString/constructor/etc. is replaced with a function's source code.
// Remove `.failing` when fixed.
it.failing('leaves a placeholder named like an Object property untouched when not given', () => {
  expect(t('demo.proto' as never, { name: 'Anna' })).toBe('Hi Anna, {toString}');
});
