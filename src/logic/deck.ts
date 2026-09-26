// Discover deck: which recipes I see and in what order. Rules in src/logic/CLAUDE.md.
import { isCompatible, type IngredientId } from './match';

export type RecipeId = number;

export interface DeckRecipe {
  id: RecipeId;
  ingredientIds: readonly IngredientId[];
}

export interface DeckInput {
  recipes: readonly DeckRecipe[];
  /** My exclusions, already expanded with expandExclusions(). */
  myExcluded: ReadonlySet<IngredientId>;
  /** Recipes I already swiped in discover (liked or not). */
  mySwiped: ReadonlySet<RecipeId>;
  /** Null when unpaired: no partner badge and no partner-based ordering. */
  partner: {
    /** Partner's exclusions, already expanded. */
    excluded: ReadonlySet<IngredientId>;
    /** Recipes the partner liked in discover. */
    liked: ReadonlySet<RecipeId>;
  } | null;
  /** Returns a number in [0, 1); injected so tests are deterministic. */
  rng: () => number;
}

export interface DeckCard {
  recipeId: RecipeId;
  /** The partner can't eat this ("{partner} won't eat this" badge). */
  partnerExcluded: boolean;
}

/** Every 3rd card is a partner-liked one while any remain. */
export const PARTNER_LIKED_EVERY = 3;

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Filters by MY exclusions only, drops what I already swiped, mixes in recipes my
 * partner liked (about every 3rd card, so matches come early) and puts recipes my
 * partner can't eat at the very end, flagged.
 */
export function buildDeck({ recipes, myExcluded, mySwiped, partner, rng }: DeckInput): DeckCard[] {
  const candidates = recipes.filter((r) => !mySwiped.has(r.id) && isCompatible(r.ingredientIds, myExcluded));
  if (partner === null) {
    return shuffle(candidates, rng).map((r) => ({ recipeId: r.id, partnerExcluded: false }));
  }

  const bothCanEat = candidates.filter((r) => isCompatible(r.ingredientIds, partner.excluded));
  const partnerCant = candidates.filter((r) => !isCompatible(r.ingredientIds, partner.excluded));
  const liked = shuffle(bothCanEat.filter((r) => partner.liked.has(r.id)), rng);
  const rest = shuffle(bothCanEat.filter((r) => !partner.liked.has(r.id)), rng);

  const ordered: DeckRecipe[] = [];
  while (liked.length > 0 || rest.length > 0) {
    const likedTurn = (ordered.length + 1) % PARTNER_LIKED_EVERY === 0;
    const next = (likedTurn && liked.length > 0) || rest.length === 0 ? liked.shift()! : rest.shift()!;
    ordered.push(next);
  }

  return [
    ...ordered.map((r) => ({ recipeId: r.id, partnerExcluded: false })),
    ...shuffle(partnerCant, rng).map((r) => ({ recipeId: r.id, partnerExcluded: true })),
  ];
}
