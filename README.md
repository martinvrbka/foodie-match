# Foodie Match

A Tinder-style recipe picker for two. Android only, free services only (Expo + Supabase free tier).

## Prerequisites
- Node 20 LTS (`nvm install 20`)
- Expo Go on both Android phones (Play Store), phones on the same Wi-Fi as your computer
- A free Supabase project (setup is described in later phases)

## Run in development
```bash
npm install
cp .env.example .env   # fill in values
npx expo start         # scan the QR code with Expo Go on each phone
```

## Tests
```bash
npm test          # unit tests for business logic
npm run typecheck
```

_Supabase setup, seeding, APK build and "resuming a paused project" sections are added in later phases._
