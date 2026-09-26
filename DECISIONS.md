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

## Exclusions
- **2026-09-26 — First-run step = `profiles.onboarded` flag** (set by the client, column-level grant). Existing accounts see the step once too.
- **2026-09-26 — Exclusions are direct client writes** (RLS: own rows only). Matches created by removing an exclusion come from a DB trigger, so the client still never writes match state.
- **2026-09-26 — Presets only add/remove explicit exclusions.** A preset shows as on when all its ingredients are excluded, even via a parent (meat excluded ⇒ "No pork" on). Turning it off removes only its own explicit rows.
- **2026-09-26 — Implied items (excluded via a parent) can't be toggled individually**; the row says "Included via pork". To eat bacon but not pork, exclude the specific pork items instead.
- **2026-09-26 — The ingredient map is bundled in the app** (~30 KB) so search matches synonyms and plurals ("scallions" → spring onion).

## Pairing
- **2026-09-26 — Pairing codes: 6 chars, no 0/O/1/I/L.** Readable when typed by hand.
- **2026-09-26 — QR payload is `foodiematch:pair:<CODE>`**, so unrelated QR codes are rejected; the scanner and manual entry share `parsePairingCode` (any case, spaces/dashes allowed).
- **2026-09-26 — Pairing UI lives on one screen** (my QR + countdown, scan, type code, email invite); incoming invites also show on Home. Both phones switch to "paired" through the realtime profile update, with no polling.
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
- **2026-09-26 — Discover saves each swipe right away; if saving fails the card comes back on top** with an error. Undo waits for the pending save, then calls the undo RPC.
- **2026-09-26 — The deck is rebuilt only when exclusions changed** since it was built (not on every return from a recipe), so the top card stays put.
- **2026-09-26 — "It's a match!" on both phones**: the swiping phone from the RPC result, the partner's via realtime INSERT on `matches`. `matches.via` (`swipe` | `retroactive`) keeps retroactive matches from triggering the full-screen celebration. Each recipe is celebrated once per app session, over any screen (global overlay).
- **2026-09-26 — Recipe list filters: All / Liked / Nope / Matches** (my discover swipes, our visible matches). Exclusions never hide recipes there.
- **2026-09-26 — "N new!" on the Matches button** counts matches (live or retroactive) created after the newest match I last saw on the Matches screen. Stored per device in localStorage and compared with server timestamps, so phone clock skew doesn't matter. The full "It's a match!" animation is for live swipes only.
- **2026-09-26 — Removing a match**: long-press a tile on Matches, or "Remove from matches" on the recipe; always confirmed. It disappears for both (realtime) and is never re-created.
- **2026-09-26 — Matches filters: cook time (any / ≤30 / ≤45 / ≤60 min; unknown cook time only under "any") and cuisine** (only cuisines present in our matches).
- **2026-09-26 — Match rule implemented twice:** pure TS `isMatch()` is the tested spec; a mirrored SQL function runs in triggers (needed for realtime on both phones). Change both together.

## Tonight
- **2026-09-26 — One active session per couple**, cancellable.
- **2026-09-26 — 0 liked by both → first tap by either partner wins**; "Reshuffle" starts a new swipe round; if nobody liked anything, only reshuffle.
- **2026-09-26 — Shortlist > 5 → union of both top-5s (up to 10) is ranked.** The spec's "max 5" and "union of top 5s" conflict; union chosen.
- **2026-09-26 — Every stage change is computed on the phone** (`tonightAdvance` in `src/logic/tonight.ts`: swipe outcome, union of top 5s, Borda winner) and saved with `tonight_advance`, which applies only the first write for a stage. Both phones try whenever they see both partners finished, so no single phone has to stay online. Avoids a second implementation in SQL.
- **2026-09-26 — Stages: `swiping` → `choosing` | `shortlisting` → `ranking` | `ranking` | `done`** (plus `cancelled`). The server checks transitions, that both finished the stage, and that a chosen/ranked winner is on the shortlist.
- **2026-09-26 — Ranking is tap-in-order, not drag.** Easier to use and accessible; same result (a full order).
- **2026-09-26 — Reshuffle = cancel the session and start a new one with the same filters** (Tonight swipes are unique per session).
- **2026-09-26 — The swipe round is the couple's visible matches with the session filters**, shuffled per phone. Partners can read each other's Tonight swipes (RLS policy) because the outcome needs both.
- **2026-09-26 — Winner screen stays until "Done"** on each phone (dismissed session id in localStorage). A partner who started a round shows a "Join" banner on Home.
- **2026-09-26 — Cooked history = sessions with `status = 'done'`.** No separate table.

## Week plan
Source: `final-prd.md` of grooming run 1 (2026-09-26). Where the PRD left a choice open or a 🔶 number unconfirmed, the choice is below.
- **2026-09-26 — Built the PRD's walking skeleton plus US-06 and US-08.** US-03 (shared top-up deck) and US-09 (offline/unreachable indicators) are deferred; a short slot type links to Discover instead of "Swipe to add more". Failed saves still show an error, so nothing is lost silently (DoD-08).
- **2026-09-26 — Tech answer: TheMealDB categories suffice for slot types.** Of 790 recipes: Breakfast 19, Starter 14, Side 84, Dessert 167. Breakfast = `Breakfast`; snack = `Starter`/`Side`/`Dessert`.
- **2026-09-26 — Lunch and dinner exclude desserts** (the PRD says "any matched dish"; a cake for dinner isn't a meal). Manual swaps still allow anything.
- **2026-09-26 — 🔶 numbers used as proposed:** 30-match re-swipe, default 3 leftover meals (max 7), leftovers 1–2 days after cooking. Generate runs on the phone in milliseconds; partner updates arrive by Realtime within a second or two (DL-023, free tier).
- **2026-09-26 — "Some matches per slot type" (US-02) = a quota of the 30 proportional to that type's slots**, scarce types first; the rest random.
- **2026-09-26 — Leftovers are derived, not stored**: a dish exactly twice, 1–2 days apart, is a pair; earlier = cook a double portion. Generate pairs only lunch/dinner, preferring dinner → next day's lunch, and uses dishes that can't fill breakfast/snack first. The remaining slots use maximum bipartite matching so no slot is left empty needlessly.
- **2026-09-26 — Plans are computed on the phone** (`src/logic/week.ts`, `plan.ts`) and saved per slot with `plan_write_slots`, like Tonight. The server checks couple, stage, past days, locks on Generate, and that dishes are visible matches (Generate: also in this week's picks and not rejected). Per-slot writes mean edits of different slots by both partners never overwrite each other; the same slot: last write wins.
- **2026-09-26 — The first "Choose this week's dishes" tap picks the 30** (`plan_begin_choosing` keeps only the first call), so both partners get the same selection. Days and meals can be changed only before that; the leftover setting any time.
- **2026-09-26 — Dates are the phone's local date**, sent as `p_today` and accepted within ±1 day of the server's. Plans that are over are deleted (`plan_cleanup` on every load; SQL twin of `planPhase`), so no history is kept (DoD-10).
- **2026-09-26 — Locks:** Regenerate and automatic leftover removal never change a locked slot; hand edits require unlocking first. Exception: a Tonight winner replaces tonight's dinner even when locked, because both just decided.
- **2026-09-26 — Move exchanges the two slots' dishes**; a cook or leftover must keep its role 1–2 days apart.
- **2026-09-26 — Tonight winner planned elsewhere later in the week** is taken out of that slot ("Eaten tonight instead…") unless it becomes tonight's leftover (1–2 days later). Only applied when a dinner was planned tonight, and only for a round finished today.
- **2026-09-26 — Late re-swipes (DL-028) are accepted until that partner's re-swipe is closed**, which happens as soon as their phone shows the generated plan. A late rejection empties the dish's unlocked slots on the server ("[Name] passed on this").
- **2026-09-26 — "Changed by [name]"** marks slots the partner saved after my previous opening of the plan (`week_plan_members.seen_at`). Generate marks every slot it saves.
- **2026-09-26 — "Good for leftovers again" is on the recipe screen** (opened from Matches), in addition to the calendar.
- **2026-09-26 — Added "Delete this plan"** (not in the PRD) to start a week over; confirmed, for both partners.
- **2026-09-26 — Unpairing deletes the couple's plans and leftover marks**, like matches.

## Tooling
- **2026-09-26 — Expo SDK 57, routes in `src/app/`** (scaffold default).
- **2026-09-26 — `react-dom` pinned to the React version**: an optional peer dep otherwise breaks `npx expo install`.
- **2026-09-26 — TS 6 needs `"types": ["jest"]`** in `tsconfig.json`; it no longer auto-includes `@types/*`.
- **2026-09-26 — Node 24 LTS via nvm, pinned in `.nvmrc`.** Node 20 is EOL and lacks the WebSocket global supabase-js needs outside the app.
- **2026-09-26 — DB integration tests use Jest + supabase-js against local Supabase in Docker** (`npm run test:db`), signing up real test users. Separate from `npm test` so commits don't need Docker. They run with plain babel, not the `jest-expo` preset, whose React Native polyfills break `fetch` in Node.
- **2026-09-26 — Local Supabase: storage, edge functions and analytics disabled; sign-up rate limit raised** (tests create many users). Cloud settings are unaffected.
- **2026-09-26 — Realtime integration tests wait for the "Subscribed to PostgreSQL" state**: events in the first moments after `SUBSCRIBED` can be missed, which doesn't matter in the app (subscriptions start long before a match).
- **2026-09-26 — Profile state is one app-wide provider** (one realtime channel); other hooks that subscribe use unique channel names.
- **2026-09-26 — Screen tests live in `src/__tests__/`** (every file under `src/app/` becomes a route). They use React Native Testing Library 14 (async `render`) with the data layer and the animated card mocked.
- **2026-09-26 — `expo-asset` is a direct dependency**: `expo-sqlite` imports it, and only Metro found the copy nested inside `expo`.
- **2026-09-26 — Seed script runs on plain Node 24 type stripping** (no tsx/ts-node); `tsconfig` allows `.ts` import extensions so it type-checks with the app.
- **2026-09-26 — A temporary recipe list screen** gives access to recipe details until Discover exists. It is deliberately unfiltered; browse filters come after swiping works.
- **2026-09-26 — Recipe detail marks what I and my partner don't eat**: a notice / "{partner} won't eat this" badge at the top and a note on each affected line. Also the practical way to check the partner badge, since partner-excluded cards sit at the end of an ~800-card deck.
- **2026-09-26 — Ingredient lines show name first, then amount/purpose** ("Vegetable Oil · For frying"); `recipe_ingredients.name`/`measure` store the source parts, `raw_text` the full line.
- **2026-09-26 — No guessing of recipe parts** ("for the filling"). TheMealDB drops section headings; splitting on repeated ingredients misplaced lines in many of the 215 recipes with repeats (e.g. red + green pepper), so repeats are shown as listed.
- **2026-09-26 — `db:types` passes the local DB URL explicitly**: after `supabase link` the CLI reads `SUPABASE_DB_PASSWORD` from `.env` and would try the cloud password on the local DB.
- **2026-09-26 — Cloud schema is deployed with `npm run db:push`** (Supabase CLI + access token + DB password in `.env`), not by pasting SQL.
- **2026-09-26 — Private GitHub repo `martinvrbka/foodie-match`**; push after every phase.
