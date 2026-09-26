# src/logic: business rules and invariants

Pure functions only: no React, Supabase, `Date.now()`, or `Math.random()`. Inject time and RNG. Every rule here has a test in `__tests__/`.

## Exclusions
- A user excludes ingredient X ⇒ they exclude X **and all its descendants** (single-parent hierarchy via `parent_id`). Always expand before comparing with recipe ingredients.
- Only explicit exclusions are stored. Presets just add explicit ones (vegetarian = `meat` + `seafood`).

## Normalization
- Output is a canonical name: lowercase, trimmed, singular, synonyms applied from `data/ingredient-map.json`.
- Must be idempotent: `normalize(normalize(x)) === normalize(x)`. An unmapped ingredient still gets a canonical name (never dropped) so it can be excluded.

## Deck (`buildDeck`)
- Filter by **my own** expanded exclusions only; never drop a recipe because of the partner.
- Remove recipes I already swiped in `discover`.
- Recipes the partner can't eat (their expanded exclusions) go **after** all others and carry a partner-excluded flag.
- Among recipes both can eat: partner-liked-but-unseen ones are interleaved (about every 3rd card while any remain); the rest is shuffled with the injected RNG.
- Unpaired ⇒ no partner flag and no partner ordering.

## Match (`match.ts`: `expandExclusions`, `isCompatible`, `isMatch`)
- Match ⇔ both liked in `discover` **and** no ingredient in the union of both partners' expanded exclusions.
- Retroactive: re-evaluating after an exclusion change can create matches from existing likes. It never deletes; hiding is done by `visible_matches` at read time.
- A match with `removed_at` set is never re-created.
- Mirrored in SQL (`private.is_match`, `private.excluded_ingredient_ids` in `*_rules.sql`): change both together.

## Tonight
- Outcome after swipes: 0 both-liked → pick from union of likes (or reshuffle); 1 → winner; 2+ → ranking. Shortlist > 5 → union of each partner's top 5 (up to 10).
- Borda: rank 1 of N = N points … rank N = 1. Tie-break: shorter `cook_time_min`, then injected RNG. Same inputs + same RNG ⇒ same winner.
- Tonight swipes never affect discover data or matches.
