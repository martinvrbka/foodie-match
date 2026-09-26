# Decisions

Short, dated. Read before changing business rules. Replace entries that become outdated instead of appending contradictions.

## Design
- **2026-09-26 — `primaryStrong` `#C8431F` for CTA buttons.** Brand `#E4572E` with white text is ~3.7:1 (fails AA for normal text); it stays for icons and large bold text. Dark text on saffron/mustard/herb. Enforced by `src/theme/__tests__/contrast.test.ts`.

## Auth
- **2026-09-26 — No magic links.** `exp://` deep links in Expo Go differ per device; sign-in must work by typing into the app. Exact method (email OTP code vs email+password without confirmation) is **open**, pending the Supabase setup choice.

## Recipes & ingredients
- **2026-09-26 — Cook times are estimated and flagged.** TheMealDB has none; estimate from category, ingredient count and instruction length; `cook_time_estimated = true`.
- **2026-09-26 — Instructions stored as `text[]` steps**, split from TheMealDB's single text blob by the seed script.
- **2026-09-26 — Photos by TheMealDB URL**, not copied to Supabase Storage (keeps free-tier storage empty).
- **2026-09-26 — Single-parent ingredient hierarchy** (`ingredients.parent_id`): bacon → pork → meat, butter → dairy. Only explicit exclusions are stored; descendants are expanded at filter time. Vegetarian preset = `meat` + `seafood`.
- **2026-09-26 — Synonyms/categories/parents in `data/ingredient-map.json`** so the mapping is reviewable in one place.

## Pairing
- **2026-09-26 — Pairing codes: 6 chars, no 0/O/1/I/L.** Readable when typed by hand.
- **2026-09-26 — Pairing actions are SECURITY DEFINER RPCs.** Under RLS, B can't read A's code/invite rows directly.
- **2026-09-26 — Accepting an invite declines your other pending invites.** A user can only be in one couple.
- **2026-09-26 — Swiping before pairing is allowed.** No partner badge/ordering until paired; pairing evaluates matches from existing swipe history.
- **2026-09-26 — Unpair = `couples.dissolved_at` + delete that couple's matches.** Swipes and cooked history stay; re-pairing recomputes matches.

## Discover & matching
- **2026-09-26 — Deck built on the phone** by pure `buildDeck()` (~300 recipes load once) so exclusion changes apply instantly.
- **2026-09-26 — "Mixed in" = roughly every 3rd card is partner-liked** while any remain; otherwise random (RNG injected for tests).
- **2026-09-26 — Undo = last discover swipe only.** Undoing a like that created a match deletes that match.
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
- **2026-09-26 — Node via nvm** (`source ~/.nvm/nvm.sh` in non-login shells).
- **2026-09-26 — Private GitHub repo `martinvrbka/foodie-match`**; push after every phase.
