import { en, type Strings } from './en';

const locales: Record<string, Strings> = { en };
let current: Strings = en;

export function setLocale(code: string) {
  current = locales[code] ?? en;
}

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type StringKey = Leaves<Strings>;

/** t('discover.partnerWontEat', { name: 'Anna' }) */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], current);
  const str = typeof value === 'string' ? value : key;
  return params ? str.replace(/\{(\w+)\}/g, (m, p) => (p in params ? String(params[p]) : m)) : str;
}
