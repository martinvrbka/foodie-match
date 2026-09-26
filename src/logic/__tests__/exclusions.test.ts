import realMap from '../../../data/ingredient-map.json';
import {
  displayName,
  exclusionStates,
  isPresetActive,
  searchIngredients,
  togglePreset,
  type Ingredient,
} from '../exclusions';
import type { IngredientMap } from '../ingredients';

const map = realMap as unknown as IngredientMap;

const ing = (id: number, name: string, category: Ingredient['category'], parentId: number | null = null) => ({
  id,
  name,
  category,
  parentId,
});
const ingredients: Ingredient[] = [
  ing(1, 'meat', 'meat'),
  ing(2, 'pork', 'meat', 1),
  ing(3, 'bacon', 'meat', 2),
  ing(4, 'streaky bacon', 'meat', 3),
  ing(5, 'seafood', 'seafood'),
  ing(6, 'prawn', 'seafood', 5),
  ing(7, 'dairy', 'dairy'),
  ing(8, 'butter', 'dairy', 7),
  ing(9, 'spring onion', 'vegetable'),
  ing(10, 'onion', 'vegetable'),
  ing(11, 'garlic', 'vegetable'),
];
const set = (...ids: number[]) => new Set(ids);

describe('exclusionStates', () => {
  it('nothing excluded ⇒ everything is none', () => {
    const states = exclusionStates(ingredients, set());
    expect([...states.values()].every((s) => s.state === 'none')).toBe(true);
  });

  it('marks descendants as implied, via the nearest explicit ancestor', () => {
    const states = exclusionStates(ingredients, set(1, 3));
    expect(states.get(1)).toEqual({ state: 'explicit' });
    expect(states.get(2)).toEqual({ state: 'implied', via: 1 });
    expect(states.get(3)).toEqual({ state: 'explicit' });
    expect(states.get(4)).toEqual({ state: 'implied', via: 3 });
    expect(states.get(6)).toEqual({ state: 'none' });
  });

  it('survives a cyclic parent chain', () => {
    const cyclic = [ing(1, 'a', 'other', 2), ing(2, 'b', 'other', 1)];
    expect(exclusionStates(cyclic, set()).get(1)).toEqual({ state: 'none' });
  });
});

describe('presets', () => {
  it('vegetarian turns on by adding meat and seafood', () => {
    expect(isPresetActive('vegetarian', ingredients, set())).toBe(false);
    expect(togglePreset('vegetarian', ingredients, set())).toEqual({ add: [1, 5], remove: [] });
    expect(isPresetActive('vegetarian', ingredients, set(1, 5))).toBe(true);
  });

  it('turning a preset off removes only its own explicit ingredients', () => {
    expect(togglePreset('vegetarian', ingredients, set(1, 5, 11))).toEqual({ add: [], remove: [1, 5] });
  });

  it('no pork is already on when meat is excluded (implied)', () => {
    expect(isPresetActive('noPork', ingredients, set(1))).toBe(true);
    // Nothing explicit to remove: pork is excluded via meat.
    expect(togglePreset('noPork', ingredients, set(1))).toEqual({ add: [], remove: [] });
  });

  it('turning vegetarian on when seafood is already excluded adds only meat', () => {
    expect(togglePreset('vegetarian', ingredients, set(5))).toEqual({ add: [1], remove: [] });
  });

  it('removing seafood switches both no-seafood and vegetarian off', () => {
    expect(isPresetActive('noSeafood', ingredients, set(1))).toBe(false);
    expect(isPresetActive('vegetarian', ingredients, set(1))).toBe(false);
  });

  it('is off (not crashing) when its ingredients are missing from the database', () => {
    expect(isPresetActive('noDairy', [ing(9, 'spring onion', 'vegetable')], set())).toBe(false);
  });
});

describe('searchIngredients', () => {
  it('groups by category in fixed order, alphabetical inside', () => {
    const sections = searchIngredients(ingredients, '', map);
    expect(sections.map((s) => s.category)).toEqual(['meat', 'seafood', 'dairy', 'vegetable']);
    expect(sections[3].data.map((i) => i.name)).toEqual(['garlic', 'onion', 'spring onion']);
  });

  it('filters by substring, case-insensitive', () => {
    const sections = searchIngredients(ingredients, ' BACON ', map);
    expect(sections.flatMap((s) => s.data.map((i) => i.name))).toEqual(['bacon', 'streaky bacon']);
  });

  it('matches plurals and synonyms through normalization', () => {
    const names = (q: string) => searchIngredients(ingredients, q, map).flatMap((s) => s.data.map((i) => i.name));
    expect(names('Scallions')).toEqual(['spring onion']);
    expect(names('prawns')).toEqual(['prawn']);
    expect(names('shrimp')).toEqual(['prawn']);
  });

  it('returns no sections when nothing matches', () => {
    expect(searchIngredients(ingredients, 'zzz', map)).toEqual([]);
  });
});

describe('displayName', () => {
  it('capitalizes the first letter only', () => {
    expect(displayName('spring onion')).toBe('Spring onion');
    expect(displayName('')).toBe('');
  });
});
