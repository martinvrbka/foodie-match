// Match rule. Mirrored in SQL by private.is_match / private.excluded_ingredient_ids
// (supabase/migrations/20260926120100_rules.sql): change both together.

export type IngredientId = number;

export interface IngredientNode {
  id: IngredientId;
  parentId: IngredientId | null;
}

/** Explicit exclusions plus every descendant (bacon under pork under meat). */
export function expandExclusions(
  explicit: Iterable<IngredientId>,
  ingredients: readonly IngredientNode[],
): Set<IngredientId> {
  const children = new Map<IngredientId, IngredientId[]>();
  for (const { id, parentId } of ingredients) {
    if (parentId === null) continue;
    const list = children.get(parentId);
    if (list) list.push(id);
    else children.set(parentId, [id]);
  }

  const result = new Set<IngredientId>();
  const queue = [...explicit];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (result.has(id)) continue; // also stops on a bad cyclic mapping
    result.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return result;
}

/** True if none of the recipe's ingredients is in any of the (expanded) exclusion sets. */
export function isCompatible(
  recipeIngredientIds: readonly IngredientId[],
  ...expandedExclusions: ReadonlySet<IngredientId>[]
): boolean {
  return !recipeIngredientIds.some((id) => expandedExclusions.some((ex) => ex.has(id)));
}

export interface PartnerView {
  likedInDiscover: boolean;
  /** Already expanded with expandExclusions(). */
  excluded: ReadonlySet<IngredientId>;
}

/**
 * A recipe is a match only if both partners liked it in discover AND it contains
 * no ingredient excluded by either of them. No partner (unpaired) ⇒ never a match.
 */
export function isMatch(
  recipeIngredientIds: readonly IngredientId[],
  me: PartnerView,
  partner: PartnerView | null,
): boolean {
  return (
    partner !== null &&
    me.likedInDiscover &&
    partner.likedInDiscover &&
    isCompatible(recipeIngredientIds, me.excluded, partner.excluded)
  );
}
