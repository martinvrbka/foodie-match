// Integration tests against the local Supabase stack (`npx supabase start`).
// Run with `npm run test:db`. Kept out of `npm test` so commits don't need Docker.
// Plain Node environment: the jest-expo preset's React Native polyfills break fetch here.
// babel-preset-expo is a dependency of expo, not a top-level package.
const babelPresetExpo = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });

module.exports = {
  testEnvironment: 'node',
  transform: { '\\.ts$': ['babel-jest', { presets: [babelPresetExpo] }] },
  testMatch: ['<rootDir>/supabase/tests/**/*.test.ts'],
  globalSetup: '<rootDir>/supabase/tests/globalSetup.js',
  testTimeout: 20000,
};
