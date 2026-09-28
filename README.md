# Foodie Match

**Stop arguing about dinner.** Foodie Match is a small Android app for two people who cook together. You both swipe through recipes like on a dating app, and the recipes you *both* like become your shared list of matches. When it's time to decide what to cook tonight, you run a quick round together and the app picks one dish.

It's a personal project for one couple, built only on free services.

## How it works

1. **Sign up** with your email and a password (no confirmation email needed).
2. **Tell it what you don't eat.** Pick ingredients from a searchable list, or use quick presets (vegetarian, no pork, no seafood, no dairy). Excluding "pork" also covers bacon, ham, lard and so on.
3. **Pair with your partner**, by scanning a QR code on their phone, typing a 6-character code, or sending an in-app invite to their email address.
4. **Swipe.** The app opens on the **Swipe** tab; the bottom panel also has **Matches**, **Recipes** and **Week plan**. Right = like, left = nope, tap a card for the full recipe. You only see recipes *you* can eat. Recipes your partner can't eat come last, marked "Anna won't eat this". Every few cards you'll see something your partner already liked, so matches come quickly.
5. **It's a match!** When you both like a recipe (and neither of you excludes anything in it), a celebration pops up on both phones at once, and the recipe goes to **Matches**. You can filter matches by cook time and cuisine, or remove one you've gone off.
6. **"What do we eat tonight?"** (on the Matches tab). One of you starts a round and the other gets a "Join" prompt. You both swipe through your matches. If exactly one recipe is liked by both, that's dinner. If several, you each put them in order and the app adds up the votes (Borda count; ties go to the quicker recipe). If none, you pick from what either of you liked, or reshuffle. The winner appears on both phones and is kept in a "Cooked before" list.

**Filters** (max time, difficulty, cuisine) are one shared set for the two of you: either of you changes them from Swipe or Recipes, and they apply to both phones right away. Your name, pairing, "I don't eat" list and sign-out are under the round **Profile** button on the Swipe tab.

Changing your "I don't eat" list takes effect immediately. A match that now contains something you excluded is hidden (not deleted), and removing an exclusion can turn old likes into new matches.

The recipes come from [TheMealDB](https://www.themealdb.com) (about 800 dishes with photos). Cook times are estimates and are shown as "about 45 min".

## For developers

- [SPEC.md](SPEC.md): product requirements (source of truth)
- [ARCHITECTURE.md](ARCHITECTURE.md): how it's built today and where it should go
- [ROADMAP.md](ROADMAP.md): progress, next steps and open items
- [DECISIONS.md](DECISIONS.md): why things are the way they are
- [CLAUDE.md](CLAUDE.md): conventions and commands (also used by Claude Code)

### Prerequisites
- Node 24 LTS via nvm (`nvm install 24`; the project pins it in `.nvmrc`)
- Expo Go on both Android phones (Play Store), phones on the same Wi-Fi as your computer
- A free Supabase project
- For database tests only: Docker (`sudo apt install docker.io`, add yourself to the `docker` group, restart)

### Supabase setup (once)
1. Create a free project at [supabase.com](https://supabase.com/dashboard).
2. **Authentication → Sign In / Providers → Email**: keep Email enabled, switch **Confirm email** off, save.
3. `cp .env.example .env` and fill in:
   - `EXPO_PUBLIC_SUPABASE_URL`: **Connect** button (or Project Settings → Data API) → Project URL
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`: Project Settings → API Keys
   - `SUPABASE_ACCESS_TOKEN`: your avatar → Account preferences → Access Tokens → Generate new token
   - `SUPABASE_DB_PASSWORD`: the database password (Project Settings → Database to reset it)
4. `npm run db:push` creates all tables and rules. Run it again whenever `supabase/migrations/` gets a new file.
5. `npm run seed` imports all recipes from TheMealDB (about 10 seconds). Safe to run again; likes and exclusions are kept.

`.env` is git-ignored. Never share the secret key, access token or DB password.

**Paused project:** free projects pause after about a week without use. If the app can't connect, open the dashboard and click **Restore project**.

### Run in development
```bash
npm install
npx expo start         # scan the QR code with Expo Go on each phone
```
If a phone shows an old version, shake it and tap **Reload**.

### Tests
```bash
npm test               # unit + screen tests (also run automatically before every commit)
npm run typecheck
npx supabase start     # start the local practice database (Docker)
npm run test:db        # database integration tests against it
```

_Building the installable APK is the next phase (see [ROADMAP.md](ROADMAP.md))._
