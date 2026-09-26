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
