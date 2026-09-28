# Roadmap and progress

Last updated 2026-09-28. Keep this short: move finished items to "Done" and delete what no longer applies.

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
| 7b | Weekly meal plan (PRD run 1: US-01, 02, 04–08): re-swipe, Generate with leftovers, prep schedule, edits, accept, Tonight uses the plan | `c85b70b` |
| 7c | Advanced filters (PRD `advanced-recipe-filters` run 1, US-01–06): max time / difficulty / cuisine, "Do not eat" with list, both partners' settings in Discover and the week selection | "Advanced filters" commit |

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

**Week plan** (Phase 7b), about 10 minutes. You need at least 4 matches (the Tonight steps above give you some).
1. A: Home → **Plan our week** → **Plan the rest of this week** (fewer days = quicker). B's Home shows a yellow **"Plan for … in progress" → Join**; B sees "A already started planning".
2. A: tap the **Lunch** column title to switch lunch off, set **Leftover meals per week** to 1, then **Choose this week's dishes**. Both phones get the same cards.
3. B: swipe one dish left (remember it), then try **Undo** and swipe it left again. A: like everything.
4. A: when the cards run out, you see how many dishes you have per meal type. Tap **Generate** while B is still swiping: B's phone switches to the plan with **"A made the plan — review it now"**. The dish B passed on is not in the plan.
5. With few matches some dinners say **"Nothing matched — pick a dish or leave empty"**. That's expected.
6. A: tap a dinner → **Swap** → pick the dish of a dinner 3+ days away: **"… is already planned this week"**. Pick it for the very next day's dinner instead: the **Prep schedule** shows **"Cook a double portion on …"**.
7. A: tap the first of those two dinners → **Clear**: the next day shows **"Leftover removed…"**, and B sees **"Changed by A"** on it (reopen the plan if needed).
8. **Lock** a dinner, tap **Regenerate**: the locked dinner stays.
9. B: **Use this plan**. A sees **"Accepted by B"**.
10. If tonight has a planned dinner: **What do we eat tonight?** first shows it with **Eat this** / **Choose something else**.
11. **Delete this plan** (bottom of the plan) resets everything, so you can try **Plan next week** too.

**Advanced filters** (Phase 7c), about 10 minutes, no long swiping.
1. A: Home → **Browse recipes** → **Advanced filters**. The panel says "Also applies to weekly matching". Tap **30 min**: long recipes disappear and the button reads **Advanced filters (1)**. Tap **Easy** and **Italian**: **(3)**. Every recipe row now shows its difficulty.
2. A: **Clear filters**: everything is back.
3. A: tap **Do not eat** on any recipe. It disappears and "Hidden: you won't see this recipe again" shows **Undo** for 5 seconds. Try Undo once, then mark it again and let the message go.
4. A: **Do not eat list (1)** shows it; **Show again** puts it back in the list. Mark it once more.
5. B: open **Browse recipes**: B still sees A's recipe and none of A's filters, and B's **Do not eat list** is empty.
6. A: set **Cuisine → one small cuisine** (e.g. Jamaican). B: open **Discover**: B only gets that cuisine now (and never A's "Do not eat" recipe). Swipe a few; when they run out B sees "…Your partner's filters may be limiting recipes, so ask your partner." B's **Clear filters** doesn't change that (it's A's filter). A clears it; B reopens Discover and gets all recipes again.
7. A: sign in on another phone (or sign out and back in): the filters and the list are still there.
8. Optional, week plan: with A's max time set to 15 min, start a new plan: longer matches aren't among the dishes to choose.

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

Advanced filters, open from the PRD (grooming run 1):
- PO to confirm DL-018 (Undo time; 5 s used) and DL-019 (missing value passes only its own filter). "Later" list: more filter types, presets, filters inside matching, reminder when filters narrow matching.
- Measuring success (DoD-06–08): nope-share can be computed from `swipes`; plan completion needs a small log because plans are deleted after their week.

Week plan, still open from the PRD (grooming run 1):
- **US-03 shared top-up deck** ("Swipe to add more" for short meal types: our older matches first, then up to 20 new dishes). Today a short type links to Discover.
- **US-09 offline**: "Offline — may be out of date" and "Recipes can't be loaded right now…" messages. Today a failed save shows an error.
- PO to confirm the 🔶 numbers (30 re-swiped matches, ~5 s Generate, ~10 s to the partner, ≤ 10 min session) and open rows DL-009, DL-010, DL-014.

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
