# Foodie Match — product spec

Source of truth for product requirements. Why individual rules were chosen when the spec was ambiguous lives in `DECISIONS.md`; this file states *what* the app must do.

## Context
A mobile app for Martin and his partner to decide what to eat. Each sets up a profile with ingredients they don't eat, they pair phones via QR code (or in-app email invite), then swipe through recipes. Recipes both like become Matches. When deciding what to cook tonight, they run a quick "Tonight" round on their matches and the app picks one winner.

Personal MVP for 2 users. Optimize for working end-to-end and feeling good to use, not for scale. Do not over-engineer.

**Target platform: Android only.** **Hard constraint: no paid services.** Everything runs on free tiers (Supabase free) or locally. No paid email providers, no paid build services, no Google Play publishing.

## Way of working
1. Build in phases. After each phase: make sure it runs, write/update tests for the business logic, update `CLAUDE.md`/`SPEC.md`/`DECISIONS.md` if anything they describe changed, commit with a clear message, push, and explain how to test on two phones.
2. Business logic (filtering, matching, ranking) lives in pure, unit-tested functions, separate from UI.
3. Assumptions go into `DECISIONS.md` instead of silent guesses.

## Tech stack
- **Expo (React Native) + TypeScript**, Expo Router, **Android only** (no iOS-specific effort).
- **Supabase (free tier)**: auth, Postgres, Row Level Security, Realtime. No external SMTP. Auth = email + password, no confirmation email (see DECISIONS.md).
- Distribution: sideloadable **APK built locally** (`npx expo prebuild` + Gradle, or `eas build --platform android --profile preview --local`). No EAS cloud builds, no Play Store. Exact steps in README.
- README notes that free Supabase projects pause after ~1 week of inactivity and how to resume.
- `react-native-gesture-handler` + `react-native-reanimated` for swipe cards.
- `expo-camera` for QR scanning, `react-native-qrcode-svg` for QR display.
- Must run on both Android phones via Expo Go during development.
- English UI, all strings in one i18n file (Czech later).

## Data model
- `profiles` (id, display_name, email, couple_id nullable)
- `couples` (id, created_at, dissolved_at): exactly 2 members max
- `pairing_codes` (code, owner_id, expires_at, used_at): short-lived, single use
- `pairing_invites` (id, from_user_id, to_email, status `pending` | `accepted` | `declined`, created_at): email-based pairing, delivered in-app (no email sent)
- `ingredients` (id, canonical_name, category, parent_id): normalized, e.g. `garlic`, `pork`, `mushroom`
- `user_excluded_ingredients` (user_id, ingredient_id)
- `recipes` (id, title, image_url, cook_time_min, cook_time_estimated, cuisine, category, instructions, source, source_id)
- `recipe_ingredients` (id, recipe_id, ingredient_id, raw_text): raw_text keeps the original line ("2 cloves garlic, minced")
- `swipes` (user_id, recipe_id, context `discover` | `tonight`, session_id nullable, liked bool, created_at), unique per (user, recipe, context, session)
- `matches` (couple_id, recipe_id, created_at, removed_at): created when both partners liked the recipe in `discover`
- `tonight_sessions` (id, couple_id, started_by, status, filters, winner_recipe_id, created_at, completed_at)
- `tonight_participants` (session_id, user_id, swipe_done, rank_done)
- `tonight_rankings` (session_id, user_id, recipe_id, rank)

RLS: users may only read and write data belonging to themselves or their couple.

## Recipe data
- Seed script imports all recipes from **TheMealDB** free API (https://www.themealdb.com/api.php), including photos.
- **Normalize ingredients** into `ingredients` (lowercase, singular, trimmed, synonym map, e.g. "spring onions" → `spring onion`, "chicken breast" → `chicken`). Mapping lives in a reviewable file. Correct normalization is critical: exclusion filtering depends on it.
- The app reads only from our own `recipes` table, never from TheMealDB directly, so own (Czech) recipes can be added later.
- Ingredient hierarchy: excluding `pork` also excludes `bacon`, `ham`, etc. (parent mapping).

## Features & acceptance criteria

### 1. Recipe database
- ≥ 250 recipes seeded, each with photo, title, ingredient list, cook time (estimated if missing, and flagged), and instructions.
- Recipe detail screen reachable from any card (tap): photo, ingredients, steps.

### 2. Ingredient exclusions (profile)
- One "I don't eat" list. No allergy/dislike distinction, no reasons or severity.
- Onboarding step and editable profile screen: searchable ingredient list with category grouping and chips for selected exclusions.
- Quick presets: vegetarian, no pork, no seafood, no dairy (they preselect ingredients).
- Changes apply to the swipe deck immediately.

### 3. Couple pairing (QR or email)
- **QR:** User A taps "Pair with partner" and sees a QR code encoding a pairing code (expires after 10 minutes, single use). User B scans it with the in-app scanner. Fallback: the 6-character code can be typed manually.
- **Email invite (in-app, no email sent):** A enters B's email. If B has an account, B sees a pending invite on the home screen (real time) and can accept or decline. If B has no account yet, the invite appears right after B signs up with that email. Matched on normalized (lowercased, trimmed) email.
- On success both accounts join the same couple and both screens update in real time: "You're paired with {name}".
- A user can be in only one couple. Reject pairing when either side is already paired, with a clear message.
- Unpair in settings (with confirmation). Unpairing keeps swipe history but clears matches for that couple.

### 4. Discover swiping
- Tinder-style card stack: swipe right = like, left = nope, plus buttons for accessibility. Undo last swipe.
- **Deck filtering (critical):** each user's deck is filtered by **their OWN exclusions only**. Recipes the partner won't eat still appear.
- Recipes containing an ingredient the partner excludes are **placed at the end of the deck** with a badge "{partner} won't eat this". Likes are still saved.
- Exclude recipes the user already swiped in `discover`.
- Ordering (recipes both can eat): mix in recipes the partner already liked but the user hasn't seen (not all at once, so matches happen early), otherwise random.
- Empty state when the deck runs out.

### 5. Matches
- **Match rule (critical):** a recipe is a match only if (a) both partners liked it in `discover` AND (b) it contains **no ingredient excluded by either partner** (union of both lists).
- On match creation, "It's a match!" animation on **both** phones in real time.
- Matches are re-evaluated when exclusions change: removing an exclusion can create matches retroactively. Matching = pure tested function + DB-side trigger/RPC.
- Matches screen: grid, newest first, filter by cook time and cuisine, remove a match.
- If an exclusion is added that a matched recipe violates, hide the match (don't delete it).

### 6. Tonight mode
- Either partner starts "What do we eat tonight?". The other gets a real-time invite and joins the same session.
- Optional filters before starting: max cook time, cuisine.
- **Round 1, swipe:** both swipe through their current (visible, filtered) matches. Session swipes don't affect discover data.
- When both finish:
  - 0 liked by both → show recipes liked by at least one partner and let them pick, or reshuffle.
  - 1 liked by both → winner.
  - 2+ liked by both → **Round 2, ranking**: each partner puts the shortlist in order (tap in order of preference). If it has more than 5, each first picks a top 5 and the union (up to 10) is ranked.
- **Borda count** (rank 1 of N gets N points, etc.). Tie-break: shorter cook time, then random. Pure, unit-tested function.
- Winner screen on both phones simultaneously: big photo, "Tonight we're cooking: X", button to open the recipe. Saved to a "Cooked history" list.
- Waiting state ("Waiting for {partner}…") when one partner finishes first.

### 7. Visual design
Warm, appetite-associated colors as theme tokens (no hardcoded colors in components):
- Primary (tomato red) `#E4572E`: like actions, icons, large bold text. CTA buttons with normal-size labels use `primaryStrong` `#C8431F` (AA).
- Secondary (saffron) `#F29E4C`; Accent (mustard) `#F6C85F` for highlights and match celebration; Fresh (herb green) `#6A994E` for success/match confirmations only.
- Background `#FFF8F0`; surface `#FFFFFF`; text `#2B2118`.
- No blue or purple in the main UI.
- **Food photos are the hero:** cards are mostly full-bleed photo with a subtle dark gradient for readable text.
- All text/background pairs meet WCAG AA; dark text on yellow/orange/green.
- Rounded cards, generous spacing, playful but clean. Satisfying swipe physics; haptics on like and match.

## Out of scope
Shopping lists, nutrition, user-uploaded recipes or other import sources (keep `recipes` and the seed script generic for later), more than 2 people per couple, push notifications while the app is closed, iOS, store publishing, sending real emails.

## Definition of done
- Two real Android phones can: sign up, set exclusions, pair via QR **and** email invite, swipe, get a real-time match, run a Tonight session end-to-end, see a winner.
- A sideloadable APK builds locally with no paid services.
- Unit tests pass for: ingredient normalization, deck filtering (own exclusions + partner-excluded sorted last), match creation (both liked + union exclusions), retroactive matching after exclusion changes, Borda ranking with ties.
- `README.md` covers setup (free Supabase project, env vars, seed script, Expo Go, building/installing the APK, resuming a paused Supabase project).
