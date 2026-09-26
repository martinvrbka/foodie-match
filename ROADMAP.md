# Roadmap and progress

Last updated 2026-09-26. Keep this short: move finished items to "Done" and delete what no longer applies.

## Done

| Phase | What | Commit |
|---|---|---|
| 0 | Expo Router scaffold, theme tokens with contrast test, i18n, Jest | `2a8bb4c` |
| 1 | Database: schema, RLS, pairing/swipe/match RPCs; sign-up and sign-in | `4f4f6c4` |
| 2 | 790 TheMealDB recipes, ingredient normalization and hierarchy, recipe screens | `a3e21fc` |
| 3 | "I don't eat" list: presets, search, first-run step | `9a2eaf9` |
| 4 | Discover swipe deck; recipe list filters (All / Liked / Nope / Matches) | `21974af` |
| 5 | Pairing by QR, code and email invite; "It's a match!" live on both phones | `1329441` |
| 6 | Matches screen: grid, cook-time/cuisine filters, remove, "N new!" | `ca12347` |
| 7 | Tonight mode: swipe round, top 5, ranking, Borda winner, cooked history | `03fa8f5` |

Tested on two real phones: sign-up, exclusions, pairing (QR and email), Discover, live matches on both phones.

## To verify on the phones

**Tonight mode** (Phase 7) is fully tested in code, but not yet on real phones. Quick plan (about 10 minutes, no long swiping):
1. Make sure you have 3+ matches: A likes the first 6 Discover cards, then B reopens Discover and likes the first 9.
2. A: **What do we eat tonight? → Start** (≤ 60 min, or Any). B's Home should show a yellow **"A wants to decide what to eat tonight" → Join** banner.
3. **One winner:** both like exactly one shared recipe. Both phones should show **"Tonight we're cooking: …"**.
4. **Ranking:** start again and both like the same 2–3 recipes. Tap them in your order and **Submit**. The first to finish sees "Waiting for …", then the winner appears on both phones.
5. **No agreement:** A likes one, B likes another. Both see "You didn't agree on one"; the first tap on either phone decides. **Reshuffle** starts a new round.
6. **Stop this round** on one phone cancels it on both.
7. The start screen lists previous winners under **Cooked before**.

## Next: Phase 8, installable APK

Goal: a sideloadable APK built on the computer, so the app works without Expo Go or the dev server.
1. Install the free build tools: JDK 17 and the Android SDK command-line tools. I'll give click-by-click steps.
2. `npx expo prebuild --platform android`, then `cd android && ./gradlew assembleRelease`.
3. Create a release signing key once and keep it safe (it's needed for every future update of the installed app).
4. Copy the APK to both phones and install it (allow "install unknown apps").
5. README: build, install and update steps.
6. Definition of done from SPEC: the APK works on both phones end to end.

## Backlog (not scheduled)

From you:
- **Browse filters by exclusions** (e.g. "only recipes we can both eat") in the recipe list, after swiping has settled. Today the list is deliberately unfiltered.

Product ideas:
- Tabs navigation (Discover · Matches · Tonight · Me) instead of the button list on Home.
- Let the inviter cancel an email invite; "delete my account".
- Show the partner's name on matches ("You and Anna both liked this") and when they last swiped.
- Czech translation (`src/i18n/cs.ts`) and Czech recipes.

Engineering (details in [ARCHITECTURE.md](ARCHITECTURE.md#recommended-future-architecture)):
- Parity test: TS `isMatch()` against SQL `private.is_match` on random data.
- TanStack Query + one realtime provider; typed wrappers for all RPCs.
- Local catalogue cache in expo-sqlite with a version number.
- GitHub Actions CI running `npm test`, typecheck and `npm run test:db`.
- Rate-limit pairing code attempts; scheduled cleanup of old codes.

## Known limitations

- Cook times are estimates from the recipe text ("about 45 min").
- TheMealDB has no "for the filling" sections, so repeated ingredients appear as separate lines.
- The "N new!" count and the dismissed Tonight winner are stored per phone.
- Free Supabase projects pause after about a week without use (see README).
- Test accounts from automated checks are always deleted; accounts you create by hand stay in the database.
