# Foodie Match

A Tinder-style recipe picker for two. Android only, free services only (Expo + Supabase free tier).

## Prerequisites
- Node 24 LTS via nvm (`nvm install 24`; the project pins it in `.nvmrc`)
- Expo Go on both Android phones (Play Store), phones on the same Wi-Fi as your computer
- A free Supabase project
- For database tests only: Docker (`sudo apt install docker.io`, add yourself to the `docker` group, restart)

## Supabase setup (once)
1. Create a free project at [supabase.com](https://supabase.com/dashboard).
2. **Authentication → Sign In / Providers → Email**: keep Email enabled, switch **Confirm email** off, save.
3. `cp .env.example .env` and fill in:
   - `EXPO_PUBLIC_SUPABASE_URL`: **Connect** button (or Project Settings → Data API) → Project URL
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`: Project Settings → API Keys
   - `SUPABASE_ACCESS_TOKEN`: your avatar → Account preferences → Access Tokens → Generate new token
   - `SUPABASE_DB_PASSWORD`: the database password from project creation (Project Settings → Database to reset it)
4. `npm run db:push` creates all tables and rules. Run it again whenever `supabase/migrations/` gets a new file.

`.env` is git-ignored. Never share the secret key, access token or DB password.

### Paused project
Free projects pause after about a week without use. If the app can't connect, open the dashboard and click **Restore project**.

## Run in development
```bash
npm install
npx expo start         # scan the QR code with Expo Go on each phone
```

## Tests
```bash
npm test               # unit tests (also run automatically before every commit)
npm run typecheck
npx supabase start     # start the local practice database (Docker)
npm run test:db        # database integration tests against it
```

_Seeding recipes and building the APK are added in later phases._
