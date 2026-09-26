import realMap from '../../../data/ingredient-map.json';
import { expandExclusions } from '../match';
import {
  CATEGORIES,
  ingredientTable,
  normalizeIngredient,
  resolveIngredient,
  type IngredientMap,
} from '../ingredients';

const map = realMap as unknown as IngredientMap;
const norm = (raw: string) => normalizeIngredient(raw, map);

/** Every ancestor of a canonical name, nearest first. */
function ancestors(name: string): string[] {
  const out: string[] = [];
  for (let p = resolveIngredient(name, map).parent; p; p = resolveIngredient(p, map).parent) out.push(p);
  return out;
}

describe('normalizeIngredient', () => {
  it.each([
    ['  Spring Onions ', 'spring onion'],
    ['Scallions', 'spring onion'],
    ['Chicken Breasts', 'chicken'],
    ['Eggs', 'egg'],
    ['free-range egg, beaten', 'egg'],
    ['Garlic Clove', 'garlic'],
    ['Plain Flour', 'flour'],
    ['All purpose flour', 'flour'],
    ['Crème Fraîche', 'creme fraiche'],
    ['Gruyère', 'gruyere'],
    ['Extra Virgin Olive Oil', 'olive oil'],
    ['Cherry Tomatoes', 'cherry tomato'],
    ['Potatoes', 'potato'],
    ['Blueberries', 'blueberry'],
    ['Radishes', 'radish'],
    ['Bay Leaves', 'bay leaf'],
    ['Pepper', 'black pepper'],
    ['Red Pepper', 'bell pepper'],
    ['Hispi (sweetheart) Cabbage', 'hispi cabbage'],
  ])('%s → %s', (raw, expected) => {
    expect(norm(raw)).toBe(expected);
  });

  it('keeps words that only look plural', () => {
    expect(norm('Asparagus')).toBe('asparagus');
    expect(norm('Couscous')).toBe('couscous');
    expect(norm('Molasses')).toBe('molasses');
    expect(norm('Lemongrass')).toBe('lemongrass');
  });

  it('never drops an unknown ingredient', () => {
    expect(norm('Dragon Fruit Powders')).toBe('dragon fruit powder');
    expect(norm('Fresh')).toBe('fresh'); // a filler word alone is kept
  });

  it('is idempotent for every synonym target and listed ingredient in the map', () => {
    const names = [...Object.values(map.synonyms), ...Object.keys(map.ingredients)];
    for (const name of names) expect(norm(name)).toBe(name);
  });

  it('every synonym key is in cleaned form, so it can actually match', () => {
    for (const key of Object.keys(map.synonyms)) {
      const cleaned = normalizeIngredient(key, { ...map, synonyms: {} });
      expect(cleaned).toBe(key);
    }
  });
});

describe('resolveIngredient', () => {
  it('uses the explicit entry', () => {
    expect(resolveIngredient('bacon', map)).toEqual({ name: 'bacon', category: 'meat', parent: 'pork' });
  });

  it('catches animal products by keyword, even in unlisted names', () => {
    expect(resolveIngredient('beef stock cube', map).parent).toBe('beef');
    expect(resolveIngredient('natural yoghurt', map).parent).toBe('yogurt');
    expect(resolveIngredient('eggs beaten', map).parent).toBe('egg');
    expect(resolveIngredient('shrimp paste', map).parent).toBe('prawn');
  });

  it('explicit entries beat misleading keywords', () => {
    expect(ancestors('coconut milk')).not.toContain('dairy');
    expect(ancestors('peanut butter')).not.toContain('dairy');
    expect(ancestors('butter bean')).not.toContain('dairy');
    expect(ancestors('oyster mushroom')).not.toContain('seafood');
    expect(ancestors('beef tomato')).not.toContain('meat');
    expect(ancestors(norm('Egg Plants'))).not.toContain('egg');
    expect(ancestors('vegan butter')).not.toContain('dairy');
  });

  it('falls back to the head noun, then to category words, then "other"', () => {
    expect(resolveIngredient('red onion', map)).toMatchObject({ parent: 'onion', category: 'vegetable' });
    expect(resolveIngredient('hoisin sauce', map)).toMatchObject({ parent: null, category: 'sauce' });
    expect(resolveIngredient('dragon fruit', map)).toMatchObject({ parent: null, category: 'other' });
  });

  it('only uses known categories', () => {
    for (const { category } of Object.values(map.ingredients)) expect(CATEGORIES).toContain(category);
    for (const category of Object.values(map.categoryWords)) expect(CATEGORIES).toContain(category);
  });
});

describe('exclusion hierarchy with the real map', () => {
  it.each([
    ['bacon', ['pork', 'meat']],
    ['streaky bacon', ['bacon', 'pork', 'meat']],
    ['chicken stock', ['chicken', 'meat']],
    ['gelatine', ['meat']],
    ['worcestershire sauce', ['anchovy', 'fish', 'seafood']],
    ['fish sauce', ['fish', 'seafood']],
    ['prawn', ['shellfish', 'seafood']],
    ['parmesan', ['cheese', 'dairy']],
    ['ghee', ['butter', 'dairy']],
    ['mayonnaise', ['egg']],
    ['almond flour', ['almond', 'nut']],
    ['marshmallow', ['gelatine', 'meat']],
  ])('%s is under %j', (name, expected) => {
    expect(ancestors(name)).toEqual(expected);
  });

  it('vegetarian preset (meat + seafood) excludes bacon, chicken stock and anchovies but not cheese', () => {
    const table = ingredientTable(
      ['meat', 'seafood', 'streaky bacon', 'chicken stock', 'anchovy fillet', 'cheddar', 'egg'],
      map,
    );
    const ids = new Map(table.map((t, i) => [t.name, i]));
    const nodes = table.map((t) => ({ id: ids.get(t.name)!, parentId: t.parent ? ids.get(t.parent)! : null }));
    const excluded = expandExclusions([ids.get('meat')!, ids.get('seafood')!], nodes);
    const has = (n: string) => excluded.has(ids.get(n)!);
    expect(has('streaky bacon')).toBe(true);
    expect(has('chicken stock')).toBe(true);
    expect(has('anchovy fillet')).toBe(true);
    expect(has('cheddar')).toBe(false);
    expect(has('egg')).toBe(false);
  });
});

describe('ingredientTable', () => {
  it('adds ancestors and lists parents before children', () => {
    const names = ingredientTable(['streaky bacon'], map).map((t) => t.name);
    expect(names).toEqual(['meat', 'pork', 'bacon', 'streaky bacon']);
  });

  it('includes each ingredient once', () => {
    const names = ingredientTable(['bacon', 'ham', 'bacon'], map).map((t) => t.name);
    expect(names).toEqual(['meat', 'pork', 'bacon', 'ham']);
  });

  it('rejects a cyclic mapping instead of looping', () => {
    const cyclic: IngredientMap = {
      ...map,
      ingredients: { a: { category: 'other', parent: 'b' }, b: { category: 'other', parent: 'a' } },
    };
    expect(() => ingredientTable(['a'], cyclic)).toThrow(/cycle/);
  });
});
