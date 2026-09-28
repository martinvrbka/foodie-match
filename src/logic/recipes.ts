// Recipe text rules used by the seed script. No imports (runs in plain Node too).

const STEP_LABEL = /^(step\s*\d+[.:)]?|\d+[.:)]?)$/i;
const STEP_PREFIX = /^(step\s*\d+\s*[.:)-]?\s*|\d+\s*[.:)]\s+)/i;

/**
 * Splits instruction text into steps: one per paragraph/line, without "STEP 1"
 * labels or "1." numbering. A single long paragraph is split into sentences.
 */
export function splitInstructions(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !STEP_LABEL.test(l))
    .map((l) => l.replace(STEP_PREFIX, '').trim())
    .filter((l) => l.length > 0);
  if (lines.length === 1 && lines[0].length > 400) {
    return lines[0].split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
  }
  return lines;
}

const DURATION = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|h\b|minutes?|mins?)/gi;

/**
 * Total minutes estimated from the instructions: preparation (grows with the
 * number of ingredients) plus every duration mentioned ("bake 25-30 minutes"
 * counts 30). Rounded to 5, between 10 and 300. Always flagged as an estimate.
 */
export function estimateCookTime(instructions: string, ingredientCount: number): number {
  let mentioned = 0;
  for (const m of instructions.matchAll(DURATION)) {
    const value = Number(m[2] ?? m[1]);
    const minutes = /^h/i.test(m[3]) ? value * 60 : value;
    mentioned += Math.min(minutes, 240); // "marinate 24 hours" shouldn't dominate
  }
  const prep = 5 + 1.5 * ingredientCount;
  const total = Math.round((prep + mentioned) / 5) * 5;
  return Math.min(300, Math.max(10, total));
}

export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Difficulty estimated from how much work a recipe is: 0–2 points each for many
 * ingredients (12+ / 16+), many steps (7+ / 11+) and a long cook time (60+ / 120+ min).
 * 0–1 points = easy, 2–3 = medium, 4+ = hard. TheMealDB has no difficulty of its own.
 */
export function estimateDifficulty(ingredientCount: number, stepCount: number, cookTimeMin: number): Difficulty {
  const points = (value: number, one: number, two: number) => (value >= two ? 2 : value >= one ? 1 : 0);
  const score = points(ingredientCount, 12, 16) + points(stepCount, 7, 11) + points(cookTimeMin, 60, 120);
  return score <= 1 ? 'easy' : score <= 3 ? 'medium' : 'hard';
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One ingredient line for display: the ingredient as written in the source, and
 * its measure or purpose ("Vegetable oil" · "For frying"). Casing is kept except
 * the first letter.
 */
export function formatIngredientLine(name: string, measure: string): { name: string; detail: string } {
  return { name: capitalize(tidy(name)), detail: capitalize(tidy(measure)) };
}
