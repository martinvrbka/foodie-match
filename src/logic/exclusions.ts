// The "I don't eat" list: presets, what each ingredient's state is, and search.
import { normalizeIngredient, type Category, type IngredientMap, CATEGORIES } from './ingredients';
import { type IngredientId } from './match';

export interface Ingredient {
  id: IngredientId;
  name: string;
  category: Category;
  parentId: IngredientId | null;
}

export type PresetKey = 'vegetarian' | 'noPork' | 'noSeafood' | 'noDairy';

/** Presets just add explicit exclusions of these canonical names. */
export const PRESETS: { key: PresetKey; names: string[] }[] = [
  { key: 'vegetarian', names: ['meat', 'seafood'] },
  { key: 'noPork', names: ['pork'] },
  { key: 'noSeafood', names: ['seafood'] },
  { key: 'noDairy', names: ['dairy'] },
];

export type ExclusionState =
  | { state: 'none' }
  | { state: 'explicit' }
  /** Excluded because an ancestor is; `via` is the nearest explicitly excluded ancestor. */
  | { state: 'implied'; via: IngredientId };

/** State of every ingredient given the user's explicit exclusions. */
export function exclusionStates(
  ingredients: readonly Ingredient[],
  explicit: ReadonlySet<IngredientId>,
): Map<IngredientId, ExclusionState> {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const out = new Map<IngredientId, ExclusionState>();
  for (const ing of ingredients) {
    if (explicit.has(ing.id)) {
      out.set(ing.id, { state: 'explicit' });
      continue;
    }
    let via: IngredientId | null = null;
    const seen = new Set<IngredientId>();
    for (let p = ing.parentId; p !== null && !seen.has(p); p = byId.get(p)?.parentId ?? null) {
      seen.add(p);
      if (explicit.has(p)) {
        via = p;
        break;
      }
    }
    out.set(ing.id, via === null ? { state: 'none' } : { state: 'implied', via });
  }
  return out;
}

function presetIds(key: PresetKey, ingredients: readonly Ingredient[]): IngredientId[] {
  const names = PRESETS.find((p) => p.key === key)!.names;
  return ingredients.filter((i) => names.includes(i.name)).map((i) => i.id);
}

/** A preset is on when all of its ingredients are excluded (explicitly or via a parent). */
export function isPresetActive(
  key: PresetKey,
  ingredients: readonly Ingredient[],
  explicit: ReadonlySet<IngredientId>,
): boolean {
  const ids = presetIds(key, ingredients);
  if (ids.length === 0) return false;
  const states = exclusionStates(ingredients, explicit);
  return ids.every((id) => states.get(id)?.state !== 'none');
}

/**
 * What to add/remove when a preset is tapped: turning it off removes its explicit
 * ingredients; turning it on adds the ones not yet excluded.
 */
export function togglePreset(
  key: PresetKey,
  ingredients: readonly Ingredient[],
  explicit: ReadonlySet<IngredientId>,
): { add: IngredientId[]; remove: IngredientId[] } {
  const ids = presetIds(key, ingredients);
  if (isPresetActive(key, ingredients, explicit)) {
    return { add: [], remove: ids.filter((id) => explicit.has(id)) };
  }
  const states = exclusionStates(ingredients, explicit);
  return { add: ids.filter((id) => states.get(id)?.state === 'none'), remove: [] };
}

export interface IngredientSection {
  category: Category;
  data: Ingredient[];
}

/**
 * Ingredients grouped by category (fixed order, alphabetical inside), filtered by a
 * search query. The query also matches through synonyms ("scallions" → spring onion).
 */
export function searchIngredients(
  ingredients: readonly Ingredient[],
  query: string,
  map: IngredientMap,
): IngredientSection[] {
  const raw = query.trim().toLowerCase();
  const canonical = raw ? normalizeIngredient(raw, map) : '';
  const matches = (name: string) => !raw || name.includes(raw) || (canonical !== '' && name.includes(canonical));
  return CATEGORIES.map((category) => ({
    category,
    data: ingredients
      .filter((i) => i.category === category && matches(i.name))
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((s) => s.data.length > 0);
}

/** "spring onion" → "Spring onion" */
export function displayName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
