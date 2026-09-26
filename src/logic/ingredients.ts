// Ingredient normalization and hierarchy. The data lives in data/ingredient-map.json;
// these functions are the rules for applying it. No imports so the seed script
// (plain Node) can use this file directly.

export const CATEGORIES = [
  'meat',
  'seafood',
  'dairy',
  'egg',
  'vegetable',
  'fruit',
  'herb_spice',
  'grain',
  'legume_nut',
  'sauce',
  'oil_fat',
  'sweet_baking',
  'drink',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface IngredientMap {
  /** Normalized name → canonical name ("plain flour" → "flour"). */
  synonyms: Record<string, string>;
  /** Canonical ingredients with explicit category and parent. Override keywords and head nouns. */
  ingredients: Record<string, { category: Category; parent?: string | null }>;
  /** A word in an unlisted name → its parent, so animal products are never missed ("beef stock" → beef). */
  keywords: Record<string, string>;
  /** Last word → category for names with no parent ("hoisin sauce" → sauce). Grouping only. */
  categoryWords: Record<string, Category>;
  /** Leading words that don't change what the ingredient is ("fresh basil" → basil). */
  dropWords: string[];
  /** Words ending in "s" that are not plurals. */
  invariant: string[];
  /** Plurals the suffix rules get wrong ("leaves" → "leaf"). */
  irregular: Record<string, string>;
}

export interface ResolvedIngredient {
  name: string;
  category: Category;
  parent: string | null;
}

function singular(word: string, map: IngredientMap): string {
  if (word in map.irregular) return map.irregular[word];
  if (map.invariant.includes(word) || word.length <= 3) return word;
  if (/(ss|us|is)$/.test(word)) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (/(ches|shes|xes|sses|zes|oes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** Lowercase, no accents or punctuation, no filler words, singular last word. */
function clean(raw: string, map: IngredientMap): string {
  const words = raw
    .split(',')[0] // "egg, beaten" → "egg"
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[-_/]/g, ' ')
    .replace(/[^a-z0-9' ]/g, '')
    .replace(/'/g, '')
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && map.dropWords.includes(words[0])) words.shift();
  if (words.length > 0) words[words.length - 1] = singular(words[words.length - 1], map);
  return words.join(' ');
}

/**
 * Canonical name for a raw ingredient line name. Never drops an ingredient:
 * unmapped names still get a cleaned canonical form. Idempotent.
 */
export function normalizeIngredient(raw: string, map: IngredientMap): string {
  let name = clean(raw, map);
  for (let i = 0; i < 5 && name in map.synonyms; i++) name = map.synonyms[name];
  return name;
}

/** Category and parent for a canonical name: explicit entry, else keyword, else head noun. */
export function resolveIngredient(name: string, map: IngredientMap): ResolvedIngredient {
  const explicit = map.ingredients[name];
  if (explicit) {
    return { name, category: explicit.category, parent: explicit.parent ?? null };
  }
  const words = name.split(' ');
  // Keywords match singular forms too ("eggs beaten" → egg).
  const keyword = words
    .flatMap((w) => [w, singular(w, map)])
    .find((w) => w in map.keywords && map.keywords[w] !== name);
  const head = words.length > 1 ? words[words.length - 1] : undefined;
  const parent = keyword ? map.keywords[keyword] : head && head in map.ingredients ? head : null;
  if (parent) return { name, category: categoryOf(parent, map), parent };
  return { name, category: map.categoryWords[words[words.length - 1]] ?? 'other', parent: null };
}

function categoryOf(name: string, map: IngredientMap, depth = 0): Category {
  if (depth > 10) return 'other';
  const explicit = map.ingredients[name];
  if (explicit) return explicit.category;
  const { parent } = resolveIngredient(name, map);
  return parent ? categoryOf(parent, map, depth + 1) : 'other';
}

/**
 * Every ingredient to store for the given canonical names, including all their
 * ancestors, parents before children (so parent ids exist when children are inserted).
 */
export function ingredientTable(names: Iterable<string>, map: IngredientMap): ResolvedIngredient[] {
  const out = new Map<string, ResolvedIngredient>();
  const add = (name: string, path: Set<string>) => {
    if (out.has(name)) return;
    if (path.has(name)) throw new Error(`Ingredient hierarchy has a cycle: ${[...path, name].join(' → ')}`);
    const r = resolveIngredient(name, map);
    if (r.parent) add(r.parent, new Set(path).add(name));
    out.set(name, r);
  };
  for (const name of names) add(name, new Set());
  return [...out.values()];
}
