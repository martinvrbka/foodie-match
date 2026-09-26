# Decisions

Short, dated. Read before changing business rules. Replace entries that become outdated instead of appending contradictions.

## Design
- **2026-09-26 — `primaryStrong` `#C8431F` for CTA buttons.** Brand `#E4572E` with white text is ~3.7:1 (fails AA for normal text); it stays for icons and large bold text. Dark text on saffron/mustard/herb. Enforced by `src/theme/__tests__/contrast.test.ts`.

## Auth
- **2026-09-26 — Session stored with `expo-sqlite/localStorage`** (bundled in Expo Go) instead of Supabase's SecureStore+AES recipe, which needs extra non-Expo packages. Acceptable for a personal app.
- **2026-09-26 — Email + password sign-in, "Confirm email" off.** No magic links (`exp://` deep links differ per device in Expo Go) and no emailed OTP codes (free-tier built-in email allows only a few sends/hour). The app never sends email.

## Recipes & ingredients
- **2026-09-26 — Cook times are estimated and flagged.** TheMealDB has none; estimated from ingredient count plus durations mentioned in the instructions; `cook_time_estimated = true`.
- **2026-09-26 — Instructions stored as `text[]` steps**, split from TheMealDB's single text blob by the seed script.
- **2026-09-26 — Photos by TheMealDB URL**, not copied to Supabase Storage (keeps free-tier storage empty). Lists use TheMealDB's `/small` variant, cards `/medium`.
- **2026-09-26 — All 790 TheMealDB recipes are imported**, not a subset. `cuisine` = `strArea`, else `strCountry` (190 recipes have no area).
- **2026-09-26 — TheMealDB's own categories are not trusted for filtering** (14 of its "Vegetarian" recipes contain chicken stock, bacon, fish sauce…). Filtering uses ingredients only.
- **2026-09-26 — No title-based ingredient guessing.** Only 1 of 790 recipes names a meat in its title but not its ingredients, and the rule would wrongly block others ("Oyster Mushroom Soup"). Such gaps are fixed per recipe in `recipeFixes` in the map.
- **2026-09-26 — Hierarchy choices for safety:** gelatine and marshmallow are under `meat`; Worcestershire sauce under `anchovy`; stocks under their animal; `nut` covers tree nuts **and peanut**; veal under `beef`, mutton under `lamb`; sausage under `pork`.
- **2026-09-26 — Single-parent ingredient hierarchy** (`ingredients.parent_id`): bacon → pork → meat, butter → dairy. Only explicit exclusions are stored; descendants are expanded at filter time. Vegetarian preset = `meat` + `seafood`.
- **2026-09-26 — Synonyms/categories/parents in `data/ingredient-map.json`** so the mapping is reviewable in one place.

## Pairing
- **2026-09-26 — Pairing codes: 6 chars, no 0/O/1/I/L.** Readable when typed by hand.
- **2026-09-26 — Pairing actions are SECURITY DEFINER RPCs.** Under RLS, B can't read A's code/invite rows directly.
- **2026-09-26 — Pairing by either method declines all pending invites to/from both partners** and deletes their unused codes. A user can only be in one couple (also enforced by a trigger: max 2 members).
- **2026-09-26 — Inviter can't cancel an invite** (MVP); a wrong-email invite just stays pending until either side pairs.
- **2026-09-26 — RPC errors are short codes in the exception message** (`code_expired`, `already_paired`, …), mapped to strings in `src/data/errors.ts`.
- **2026-09-26 — Swiping before pairing is allowed.** No partner badge/ordering until paired; pairing evaluates matches from existing swipe history.
- **2026-09-26 — Unpair = `couples.dissolved_at` + delete that couple's matches.** Swipes and cooked history stay; re-pairing recomputes matches.

## Discover & matching
- **2026-09-26 — Deck built on the phone** by pure `buildDeck()` (all ~800 recipes load once) so exclusion changes apply instantly.
- **2026-09-26 — "Mixed in" = roughly every 3rd card is partner-liked** while any remain; otherwise random (RNG injected for tests).
- **2026-09-26 — Discover swipes go through RPC `discover_swipe`** (they can create matches); clients have no direct write access to `swipes`/`matches`. A second swipe on the same recipe is ignored (only undo changes one).
- **2026-09-26 — Undo = last discover swipe only** (the client allows one step). Undoing a like deletes that recipe's match unless the user removed it (removed rows stay so they're never re-created).
- **2026-09-26 — Matches are hidden, not deleted.** A `matches` row = both liked + compatible when created; view `visible_matches` applies both partners' current exclusions at read time. User-removed matches get `removed_at` and are never re-created.
- **2026-09-26 — Retroactive matches show a small "N new matches" banner**; the full "It's a match!" animation is for live swipes only.
- **2026-09-26 — Match rule implemented twice:** pure TS `isMatch()` is the tested spec; a mirrored SQL function runs in triggers (needed for realtime on both phones). Change both together.

## Tonight
- **2026-09-26 — One active session per couple**, cancellable.
- **2026-09-26 — 0 liked by both → first tap by either partner wins**; "Reshuffle" starts a new swipe round; if nobody liked anything, only reshuffle.
- **2026-09-26 — Shortlist > 5 → union of both top-5s (up to 10) is ranked.** The spec's "max 5" and "union of top 5s" conflict; union chosen.
- **2026-09-26 — Winner computed by the last partner to finish** with the pure Borda function (random tie-break), saved via an RPC that accepts only the first write; both phones receive it via realtime. Avoids a second Borda implementation in SQL.
- **2026-09-26 — Cooked history = sessions with `status = 'done'`.** No separate table.

## Tooling
- **2026-09-26 — Expo SDK 57, routes in `src/app/`** (scaffold default).
- **2026-09-26 — `react-dom` pinned to the React version**: an optional peer dep otherwise breaks `npx expo install`.
- **2026-09-26 — TS 6 needs `"types": ["jest"]`** in `tsconfig.json`; it no longer auto-includes `@types/*`.
- **2026-09-26 — Node 24 LTS via nvm, pinned in `.nvmrc`.** Node 20 is EOL and lacks the WebSocket global supabase-js needs outside the app.
- **2026-09-26 — DB integration tests use Jest + supabase-js against local Supabase in Docker** (`npm run test:db`), signing up real test users. Separate from `npm test` so commits don't need Docker. They run with plain babel, not the `jest-expo` preset, whose React Native polyfills break `fetch` in Node.
- **2026-09-26 — Local Supabase: storage, edge functions and analytics disabled; sign-up rate limit raised** (tests create many users). Cloud settings are unaffected.
- **2026-09-26 — Seed script runs on plain Node 24 type stripping** (no tsx/ts-node); `tsconfig` allows `.ts` import extensions so it type-checks with the app.
- **2026-09-26 — A temporary recipe list screen** gives access to recipe details until Discover exists.
- **2026-09-26 — Cloud schema is deployed with `npm run db:push`** (Supabase CLI + access token + DB password in `.env`), not by pasting SQL.
- **2026-09-26 — Private GitHub repo `martinvrbka/foodie-match`**; push after every phase.
