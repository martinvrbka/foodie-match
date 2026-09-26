// Reads the local stack's URL and keys once, for all test files.
const { execSync } = require('node:child_process');

module.exports = () => {
  let status;
  try {
    status = JSON.parse(execSync('npx supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  } catch {
    throw new Error('Local Supabase is not running. Start Docker, then run: npx supabase start');
  }
  process.env.TEST_SUPABASE_URL = status.API_URL;
  process.env.TEST_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY;
  process.env.TEST_SUPABASE_SECRET_KEY = status.SECRET_KEY;
};
