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
- `estimateDifficulty`: 0–2 points each for ingredients (12+ / 16+), steps (7+ / 11+) and cook time (60+ / 120+ min); 0–1 = easy, 2–3 = medium, 4+ = hard.

## Advanced filters (`filters.ts`)
- `passesFilters`: max time, difficulties, cuisines, each checked on its own. No cook time fails any max time; no difficulty/cuisine passes that filter only.
- `visibleInOverview`: my own filters and my "Do not eat" marks only.
- `blockedForMatching`: fails my filters, or marked by me, or in the partner's blocked set (from the server). Mirrored in SQL `private.blocked_recipe_ids`: change both together.
- `filterOptions`: only values recipes have; difficulty in easy → hard order, cuisines alphabetical. Max time uses the fixed `MAX_TIME_OPTIONS`.

## Deck (`buildDeck`)
- Filter by **my own** expanded exclusions only; never drop a recipe because of the partner.
- Remove recipes I already swiped in `discover`, and recipes in `blocked` (either partner's filters and "Do not eat" marks).
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

## Week plan (`week.ts`, `plan.ts`)
- Dates are local `YYYY-MM-DD` strings; weeks run Monday–Sunday. A plan covers `firstDay` (next Monday, or today for "rest of this week") to Sunday.
- `planPhase`: `gone` when the week ended, or when never generated and its first day came (a rest-of-week plan started today survives today); `active` = generated and started; else `upcoming`. Mirrored in SQL `private.cleanup_week_plans`: change both together.
- `mealsFor(category)`: breakfast ⇐ `Breakfast`; snack ⇐ `Starter`/`Side`/`Dessert`; lunch and dinner ⇐ anything but `Dessert`. Only Generate uses it; a manual swap allows any match anywhere.
- `pickSelection`: ≤ 30 random matches; each switched-on meal group gets a quota proportional to its slots (breakfast, snack, then main), rest random.
- `weekCandidates`: picks that are still visible matches and that neither partner rejected this week (unreached = liked).
- Leftovers are derived, never stored: a dish planned **exactly twice, 1–2 days apart** is a pair (earlier = cook a double portion, later = leftover). The prep schedule is the list of pairs.
- `generatePlan`: past days and locked slots never change; dishes already in them aren't reused. Plans up to `leftovers` pairs (minus pairs kept in fixed slots) in lunch/dinner only, preferring dinner → next day's lunch and dishes that can't fill breakfast/snack; never a "not good for leftovers" dish. The rest is a maximum bipartite matching (most constrained slots first); unfilled = `nothing_matched`.
- `availability`: per group (breakfast / lunch+dinner / snack), dishes allowed there and whether Generate (deterministic RNG) would leave a slot empty ("short").
- Edits (`swapSlot`, `clearSlot`, `moveSlot`, `setLocked`, `dropLeftoversOf`, `replaceTonight`): past days refused; hand edits of a locked slot refused (unlock first). A dish may appear a second time only 1–2 days **after** the first (it becomes a leftover), never 3 times. Move = exchange with the target; a cook or leftover must keep its role 1–2 days apart (`leftover_timing`).
- When a cook-day meal changes, its leftover is emptied (`leftover_removed`), or kept with `no_longer_leftover` if locked; never when the cook day has passed.
- `replaceTonight`: the Tonight winner replaces today's dinner even if locked (unlocks it); the winner's other future slots are emptied (`eaten_tonight`) unless one is a valid leftover of tonight.
