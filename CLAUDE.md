# Foodie Match

Tinder-style recipe picker for a couple (2 users). Each partner sets ingredients they don't eat, the phones pair via QR or in-app email invite, both swipe recipes, and mutual likes become Matches. "Tonight" mode runs a quick swipe + Borda ranking round on the matches to pick one dish.

- **Read `SPEC.md`** for product requirements (source of truth).
- **Read `DECISIONS.md` before changing any business rule** (filtering, matching, pairing, Tonight).
- General Expo guidance (verify APIs against SDK 57 docs, use `npx expo install`): @AGENTS.md

## Hard constraints
- Android only. Free services only: Supabase free tier, local builds. **Never** suggest EAS cloud builds, paid SMTP, or Play Store.
- Must keep working in Expo Go during development: only use libraries bundled in Expo Go.

## Stack
Expo SDK 57 + TypeScript (strict, TS 6), Expo Router, Supabase (Postgres + RLS + Realtime + auth), reanimated 4 + gesture-handler, expo-camera, react-native-qrcode-svg, expo-haptics, expo-image, Jest (`jest-expo`).

## Commands
Node comes from nvm: run `source ~/.nvm/nvm.sh` first in a non-login shell.

```bash
npx expo start                 # dev server; open in Expo Go on both phones
npm test                       # unit tests (Jest)
npm run typecheck              # tsc --noEmit
npx expo-doctor                # dependency/config sanity
npx expo install <pkg>         # add deps (never plain npm install <pkg>)
npm run seed                   # import TheMealDB recipes (needs SUPABASE_SECRET_KEY in .env) — Phase 2
# Local APK (Phase 8, needs JDK 17 + Android SDK):
npx expo prebuild --platform android && (cd android && ./gradlew assembleRelease)
```

## Folder map
- `src/app/` — Expo Router screens only; thin, no business logic.
- `src/logic/` — pure business logic (normalize, deck, match, Borda, Tonight outcome) + tests. See its CLAUDE.md.
- `src/theme/` — color/spacing tokens and WCAG contrast checker.
- `src/i18n/` — all UI strings (`en.ts`) and `t()`.
- `src/data/` — Supabase client, queries, realtime hooks *(Phase 1)*.
- `src/components/` — reusable UI (card stack, chips, buttons) *(Phase 1+)*.
- `supabase/migrations/` — schema, RLS, triggers, RPCs as SQL *(Phase 1)*.
- `scripts/seed/` — TheMealDB import (Node, run locally) *(Phase 2)*.
- `data/` — `ingredient-map.json`: synonyms, categories, parents *(Phase 2)*.
- `assets/` — app icons and splash.

## Conventions
- Business rules go in `src/logic/` as pure functions: no React, Supabase, `Date.now()` or `Math.random()` inside; pass time/RNG in as arguments.
- Every business rule change needs a test in `src/logic/__tests__/`.
- Colors only from `src/theme/tokens.ts`; no hex literals in components. A new text/background pair must be added to `textPairs` (the contrast test enforces AA).
- User-facing strings only via `t('section.key', params)` from `src/i18n`; never inline English in components.
- Anything that changes couple membership or match state goes through a Supabase RPC, never a direct client table write.
- SQL changes = new migration file; never edit an applied migration.
- If the SQL match function changes, update `isMatch()` in `src/logic/` too (and vice versa).
- Record assumptions in `DECISIONS.md` rather than guessing silently.

## Definition of done (every phase)
1. App runs in Expo Go; `npm test` and `npm run typecheck` pass.
2. Tests added/updated for any business logic touched.
3. `CLAUDE.md`, `SPEC.md`, `DECISIONS.md` updated if anything they describe changed: keep them concise, delete outdated content instead of appending.
4. Commit with a clear message, push to `origin`, and explain how to test on two phones.
