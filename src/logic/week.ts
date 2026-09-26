// Weekly plan: dates, which plans exist when, slot suitability, this week's
// selection of matches and candidates. Rules in src/logic/CLAUDE.md.

/** Calendar date as 'YYYY-MM-DD' (the phone's local date). */
export type ISODate = string;

export type Meal = 'breakfast' | 'lunch' | 'snack' | 'dinner';
/** Time order within a day. */
export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'snack', 'dinner'];
export const DEFAULT_MEALS: readonly Meal[] = ['lunch', 'dinner'];
export const DEFAULT_LEFTOVERS = 3;
export const MAX_LEFTOVERS = 7;
/** Both partners re-swipe the same selection of at most this many matches. */
export const RESWIPE_CAP = 30;

// ------------------------------------------------------------------ dates

const toUTC = (d: ISODate) => new Date(`${d}T00:00:00Z`);
const fromUTC = (d: Date): ISODate => d.toISOString().slice(0, 10);

export function addDays(d: ISODate, n: number): ISODate {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}

/** b − a in days. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(d: ISODate): number {
  return (toUTC(d).getUTCDay() + 6) % 7;
}

export function mondayOf(d: ISODate): ISODate {
  return addDays(d, -weekdayIndex(d));
}

/** The phone's local calendar date. */
export function localDate(now: Date): ISODate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** firstDay … the Sunday of its week. */
export function planDays(firstDay: ISODate): ISODate[] {
  const n = 7 - weekdayIndex(firstDay);
  return Array.from({ length: n }, (_, i) => addDays(firstDay, i));
}

// -------------------------------------------------------------- lifecycle

export type PlanStatus = 'setup' | 'choosing' | 'generated' | 'accepted';

export interface PlanDates {
  weekStart: ISODate;
  firstDay: ISODate;
  status: PlanStatus;
  /** Local date the plan was started on. */
  createdOn: ISODate;
}

export const isGenerated = (s: PlanStatus) => s === 'generated' || s === 'accepted';

/**
 * - `gone`: the week ended, or it was never generated and its first day came
 *   (a "rest of this week" plan started today survives today).
 * - `active`: generated and its first day has come.
 * - `upcoming`: everything else (being planned, or generated for later).
 * Mirrored in SQL (`private.cleanup_week_plans`): change both together.
 */
export function planPhase(p: PlanDates, today: ISODate): 'gone' | 'active' | 'upcoming' {
  if (daysBetween(p.weekStart, today) > 6) return 'gone';
  if (!isGenerated(p.status)) {
    const started = daysBetween(p.firstDay, today);
    return started > 0 || (started === 0 && p.createdOn < today) ? 'gone' : 'upcoming';
  }
  return today >= p.firstDay ? 'active' : 'upcoming';
}

/** A generated plan nobody accepted became the active week on its own. */
export function startedWithoutAccept(p: PlanDates, today: ISODate): boolean {
  return p.status === 'generated' && planPhase(p, today) === 'active';
}

/** What a new plan can cover today: next Monday–Sunday, and the rest of this week if it has no plan. */
export function startOptions(plans: readonly PlanDates[], today: ISODate) {
  const thisWeek = mondayOf(today);
  const live = plans.filter((p) => planPhase(p, today) !== 'gone');
  return {
    nextWeek: addDays(thisWeek, 7),
    restOfThisWeek: live.some((p) => p.weekStart === thisWeek) ? null : today,
  };
}

// ------------------------------------------------------------ suitability

/** Lunch and dinner share dishes, so availability counts them together. */
export type MealGroup = 'breakfast' | 'main' | 'snack';
export const groupOf = (m: Meal): MealGroup => (m === 'lunch' || m === 'dinner' ? 'main' : m);

/**
 * Where Generate may put a dish, from its TheMealDB category: breakfast only
 * "Breakfast"; snack only "Starter", "Side" or "Dessert"; lunch and dinner
 * anything except "Dessert". A manual swap ignores this.
 */
export function mealsFor(category: string | null): ReadonlySet<Meal> {
  const meals = new Set<Meal>();
  if (category === 'Breakfast') meals.add('breakfast');
  if (category === 'Starter' || category === 'Side' || category === 'Dessert') meals.add('snack');
  if (category !== 'Dessert') {
    meals.add('lunch');
    meals.add('dinner');
  }
  return meals;
}

// ------------------------------------------------------------- selection

export interface MatchDish {
  id: number;
  category: string | null;
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * This week's re-swipe selection: at most `cap` of our matches, random, but each
 * switched-on slot type gets a share of the cap in proportion to its slots
 * (scarce types first), so breakfast matches are in it when breakfast is on.
 */
export function pickSelection(
  matches: readonly MatchDish[],
  slotsPerGroup: Partial<Record<MealGroup, number>>,
  rng: () => number,
  cap = RESWIPE_CAP,
): number[] {
  const pool = shuffle(matches, rng);
  const picked = new Set<number>();
  const total = Object.values(slotsPerGroup).reduce((s, n) => s + (n ?? 0), 0);
  const order: MealGroup[] = ['breakfast', 'snack', 'main'];
  for (const g of order) {
    const slots = slotsPerGroup[g] ?? 0;
    if (slots === 0) continue;
    const quota = Math.min(slots, Math.ceil((cap * slots) / total));
    let taken = 0;
    for (const m of pool) {
      if (picked.size >= cap || taken >= quota) break;
      if (picked.has(m.id) || ![...mealsFor(m.category)].some((meal) => groupOf(meal) === g)) continue;
      picked.add(m.id);
      taken++;
    }
  }
  for (const m of pool) {
    if (picked.size >= cap) break;
    picked.add(m.id);
  }
  return pool.filter((m) => picked.has(m.id)).map((m) => m.id);
}

/**
 * Dishes Generate may use: in this week's selection, still a visible match, and
 * rejected by neither partner in this week's re-swipe. Matches a partner hasn't
 * reached yet count as liked.
 */
export function weekCandidates(
  picks: readonly number[],
  visibleMatches: ReadonlySet<number>,
  rejected: ReadonlySet<number>,
): number[] {
  return picks.filter((id) => visibleMatches.has(id) && !rejected.has(id));
}
