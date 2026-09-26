# Foodie Match

Tinder-style recipe picker for a couple (2 users). Each partner sets ingredients they don't eat, the phones pair via QR or in-app email invite, both swipe recipes, and mutual likes become Matches. "Tonight" mode runs a quick swipe + Borda ranking round on the matches to pick one dish.

- **Read `SPEC.md`** for product requirements (source of truth).
- **Read `DECISIONS.md` before changing any business rule** (filtering, matching, pairing, Tonight).
- `ARCHITECTURE.md`: current design and recommended direction. `ROADMAP.md`: what's done, next phase, backlog. Start a session there.
- General Expo guidance (verify APIs against SDK 57 docs, use `npx expo install`): @AGENTS.md

## Hard constraints
- Android only. Free services only: Supabase free tier, local builds. **Never** suggest EAS cloud builds, paid SMTP, or Play Store.
- Must keep working in Expo Go during development: only use libraries bundled in Expo Go.

## Stack
Expo SDK 57 + TypeScript (strict, TS 6), Expo Router, Supabase (Postgres + RLS + Realtime + auth), reanimated 4 + gesture-handler, expo-camera, react-native-qrcode-svg, expo-haptics, expo-image, Jest (`jest-expo`).

## Commands
Node 24 (`.nvmrc`) comes from nvm: run `source ~/.nvm/nvm.sh && nvm use` first in a non-login shell.

```bash
npx expo start                 # dev server; open in Expo Go on both phones
npm test                       # unit tests (Jest)
npm run test:db                # DB integration tests; needs Docker + `npx supabase start`
npx supabase db reset          # re-apply all migrations to the local DB
npm run db:types               # regenerate src/data/database.types.ts after SQL changes
npm run db:push                # apply new migrations to the cloud project (needs SUPABASE_ACCESS_TOKEN + SUPABASE_DB_PASSWORD in .env)
npm run typecheck              # tsc --noEmit
npx expo-doctor                # dependency/config sanity
npx expo install <pkg>         # add deps (never plain npm install <pkg>)
npm run seed                   # import/refresh TheMealDB recipes into the cloud project (SUPABASE_SECRET_KEY in .env); safe to re-run
npm run seed -- --local        # same, into the local Supabase
# Local APK (Phase 8, needs JDK 17 + Android SDK):
npx expo prebuild --platform android && (cd android && ./gradlew assembleRelease)
```

## Folder map
- `src/app/` — Expo Router screens only; thin, no business logic.
- `src/logic/` — pure business logic (normalize, deck, match, Borda, Tonight outcome) + tests. See its CLAUDE.md.
- `src/theme/` — color/spacing tokens and WCAG contrast checker.
- `src/i18n/` — all UI strings (`en.ts`) and `t()`.
- `src/data/` — Supabase client, auth, queries, realtime hooks, error → string mapping, generated DB types.
- `src/components/` — reusable UI (buttons, fields, chips, swipe card).
- `src/__tests__/` — screen tests for critical flows (not under `src/app/`, which would make them routes).
- `supabase/migrations/` — schema, RLS, triggers, RPCs as SQL. `supabase/tests/` — DB integration tests (`npm run test:db`).
- `scripts/` — `seed/themealdb.ts` (recipe import, plain Node 24 with type stripping; imports `src/logic/*.ts` with `.ts` extensions) and `db-push.sh`.
- `data/ingredient-map.json` — synonyms, categories, parents, keywords, per-recipe fixes. Reviewed by tests in `src/logic/__tests__/ingredients.test.ts`.
- `assets/` — app icons and splash.

## Conventions
- Business rules go in `src/logic/` as pure functions: no React, Supabase, `Date.now()` or `Math.random()` inside; pass time/RNG in as arguments.
- Every business rule change needs a test in `src/logic/__tests__/`.
- Colors only from `src/theme/tokens.ts`; no hex literals in components. A new text/background pair must be added to `textPairs` (the contrast test enforces AA).
- User-facing strings only via `t('section.key', params)` from `src/i18n`; never inline English in components.
- Anything that changes couple membership or match state goes through a Supabase RPC, never a direct client table write.
- SQL changes = new migration file; never edit an applied migration. Supabase grants anon/authenticated full access to new `public` tables by default: every new table needs RLS enabled and explicit `revoke`/`grant` like `*_rules.sql`.
- RPCs raise errors as a short code in the message (`raise exception 'code_used'`); map new codes to strings in `src/data/errors.ts`.
- If the SQL match function changes, update `isMatch()` in `src/logic/` too (and vice versa).
- Record assumptions in `DECISIONS.md` rather than guessing silently.

## Testing rules
- Every change to business logic (filtering, matching, ranking, ingredient normalization) must include unit tests. Keep this logic in pure functions so it's testable without UI or DB.
- DB-side logic (RLS policies, match trigger/RPC) must have integration tests against local Supabase (`supabase/tests/`, run with `npm run test:db`; not part of the pre-commit hook).
- UI: only a few tests for critical flows (swipe saves like, pairing, Tonight winner). No snapshot tests.
- Bug fixes: first write a failing test that reproduces the bug, then fix it.
- Never modify or delete an existing test to make it pass without explicitly telling me why.
- `npm test` must pass before every commit (enforced by `.githooks/pre-commit`).
- Test behavior and edge cases (empty deck, unpaired user, ties, exclusion changes), not coverage percentages.
- A phase is done only when all tests pass and new logic has tests.

## Definition of done (every phase)
1. App runs in Expo Go; `npm test` and `npm run typecheck` pass.
2. Tests added/updated for any business logic touched.
3. `CLAUDE.md`, `SPEC.md`, `DECISIONS.md`, `ARCHITECTURE.md`, `ROADMAP.md` updated if anything they describe changed: keep them concise, delete outdated content instead of appending.
4. Commit with a clear message, push to `origin`, and explain how to test on two phones.
