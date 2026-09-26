# Decisions & assumptions

Decisions made where the spec was ambiguous. Confirmed with Martin before starting (2026-09-26) unless marked *(later)*.

## Design
1. **Contrast vs brand red.** `#E4572E` with white text is ~3.7:1 (fails AA for normal text). It stays the brand/like color for icons and large bold text (>= 18.66px bold, 3:1 is enough). CTA buttons with normal-size labels use `primaryStrong` `#C8431F` (~4.9:1). Text on saffron, mustard and herb green is dark (`#2B2118`). All pairs are checked by `src/theme/__tests__/contrast.test.ts`.

## Auth
2. **Email OTP code, not magic link.** Magic links need `exp://` deep links in Expo Go, which differ per device. The user types a 6-digit code from the email instead. Requires `{{ .Token }}` in the Supabase "Magic Link" email template (see README).
3. Supabase's built-in email only delivers to members of the Supabase organisation and is rate-limited (~2/hour). The partner's email is added as an org member. Sessions persist, so sign-ins are rare.

## Recipes & ingredients
4. TheMealDB has no cook times: every cook time is **estimated** (category, ingredient count, instruction length) and flagged with `cook_time_estimated = true`.
5. TheMealDB instructions are one text blob; the seed script splits them into steps (`recipes.instructions text[]`).
6. Photos are referenced by TheMealDB image URL (not copied into Supabase Storage).
7. Ingredient hierarchy is **single-parent** (`ingredients.parent_id`): bacon → pork → meat, chicken stock → chicken → meat, butter → dairy. Only explicit exclusions are stored; descendants are expanded when filtering. The "vegetarian" preset = `meat` + `seafood`.
8. Synonyms, categories and parents live in `data/ingredient-map.json` (reviewable).

## Pairing
9. Pairing codes: 6 characters from an alphabet without 0/O/1/I/L. Pairing actions (redeem code, send/accept invite, unpair) are SECURITY DEFINER RPCs.
10. Accepting an invite declines your other pending invites.
11. Swiping before pairing is allowed; no partner badges/ordering until paired. When a couple forms, matches are evaluated from existing swipe history.
12. Unpairing sets `couples.dissolved_at`, deletes that couple's matches, keeps swipes and cooked history. Re-pairing recomputes matches from swipes.

## Discover & matching
13. Deck is computed on the phone by the pure `buildDeck()` (~300 recipes load once), so exclusion changes apply instantly.
14. "Mixed in" ordering: roughly every 3rd card is a partner-liked recipe while any remain; the rest is random (RNG injected for tests).
15. Undo applies only to the last discover swipe. Undoing a like that created a match deletes the match.
16. **Matches are hidden, not deleted.** A `matches` row = both liked + compatible when created. The `visible_matches` view filters by both partners' current exclusions, so adding an exclusion hides a match and removing it brings it back. A user-removed match gets `removed_at` and is never re-created.
17. Retroactive matches (exclusion removed, or pairing after solo swiping) show a small "N new matches" banner; the full "It's a match!" animation is for live swipes.
18. The match rule exists twice: pure TS `isMatch()` (the tested spec) and a mirrored SQL function used by triggers (needed for realtime on both phones).

## Tonight
19. One active session per couple; it can be cancelled.
20. 0 recipes liked by both → show recipes liked by at least one; the first tap by either partner is the winner. "Reshuffle" = new swipe round. If nobody liked anything, only reshuffle.
21. Shortlist > 5 → each picks a top 5, and the **union (up to 10)** goes to ranking.
22. The winner is computed by the last partner to finish, using the pure Borda function (random tie-break), and saved via an RPC that only accepts the first write. Both phones get it via realtime.
23. Cooked history = sessions with `status = 'done'`.

## Tooling
24. Expo SDK 57, routes in `src/app/` (scaffold default). `react-dom` pinned to the React version to satisfy an optional peer dep.
