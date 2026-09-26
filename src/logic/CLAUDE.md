# src/logic: business rules and invariants

Pure functions only: no React, Supabase, `Date.now()`, or `Math.random()`. Inject time and RNG. Every rule here has a test in `__tests__/`.

## Exclusions
- A user excludes ingredient X ⇒ they exclude X **and all its descendants** (single-parent hierarchy via `parent_id`). Always expand before comparing with recipe ingredients.
- Only explicit exclusions are stored. Presets just add explicit ones (vegetarian = `meat` + `seafood`).

## Normalization (`ingredients.ts`: `normalizeIngredient`, `resolveIngredient`, `ingredientTable`)
- Canonical name: text before the first comma, no accents/punctuation, lowercase, leading filler words dropped (`dropWords`), last word singular, then `synonyms`.
- Must be idempotent: `normalize(normalize(x)) === normalize(x)`. An unmapped ingredient still gets a canonical name (never dropped) so it can be excluded.
- Parent, in order: explicit `ingredients` entry → any word (or its singular) in `keywords` → last word if it is a listed ingredient. Category comes from the parent chain, else `categoryWords`, else `other`.
- `keywords` exist so animal products are never missed; explicit entries fix false hits (coconut milk, peanut butter, beef tomato, vegan butter).
- `ingredientTable` returns parents before children and throws on cycles.

## Exclusion list (`exclusions.ts`)
- `exclusionStates`: explicit / implied (via nearest explicitly excluded ancestor) / none.
- Presets (`PRESETS`): vegetarian = meat + seafood, no pork = pork, no seafood = seafood, no dairy = dairy. `togglePreset` returns ids to add/remove; never touches other exclusions.
- `searchIngredients`: fixed category order, alphabetical inside; query matches raw substring or its normalized form (synonyms, plurals).

## Recipe text (`recipes.ts`)
- `splitInstructions`: one step per line, "STEP n" labels and "n." numbering removed; a single paragraph over 400 chars is split into sentences.
- `estimateCookTime`: 5 + 1.5 min per ingredient + every mentioned duration (upper bound of ranges, each capped at 240), rounded to 5, clamped 10–300.

## Deck (`buildDeck`)
- Filter by **my own** expanded exclusions only; never drop a recipe because of the partner.
- Remove recipes I already swiped in `discover`.
- Recipes the partner can't eat (their expanded exclusions) go **after** all others and carry a partner-excluded flag.
- Among recipes both can eat: partner-liked-but-unseen ones take every 3rd position (index 2, 5, 8…) while any remain; the rest is shuffled with the injected RNG.
- Unpaired ⇒ no partner flag and no partner ordering.

## Match (`match.ts`: `expandExclusions`, `isCompatible`, `isMatch`)
- Match ⇔ both liked in `discover` **and** no ingredient in the union of both partners' expanded exclusions.
- Retroactive: re-evaluating after an exclusion change can create matches from existing likes. It never deletes; hiding is done by `visible_matches` at read time.
- A match with `removed_at` set is never re-created.
- Mirrored in SQL (`private.is_match`, `private.excluded_ingredient_ids` in `*_rules.sql`): change both together.

## Tonight
- `swipeOutcome`: 0 both-liked → `choosing` from the union of likes (empty ⇒ only reshuffle); 1 → winner; 2–5 → `ranking`; > 5 → `shortlisting` (each picks a top 5, `unionOfTops` is ranked).
- `tonightAdvance` returns the next stage only when both participants finished the current one; `choosing` ends by a tap, never automatically.
- Borda: rank 1 of N = N points … rank N = 1. Tie-break: shorter `cook_time_min`, then injected RNG. Same inputs + same RNG ⇒ same winner.
- Tonight swipes never affect discover data or matches.
