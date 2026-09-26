// Weekly plan calendar: leftovers, prep schedule, Generate and edits.
// Rules in src/logic/CLAUDE.md. Every function returns new slots; the caller
// saves only the ones that changed (changedSlots).
import { daysBetween, groupOf, type ISODate, type Meal, MEALS, type MealGroup } from './week';

/** Why a slot looks the way it does (shown under it). */
export type SlotNote =
  | 'nothing_matched'
  | 'cleared'
  | 'leftover_removed'
  | 'no_longer_leftover'
  | 'partner_passed'
  | 'eaten_tonight';

export interface PlanSlot {
  day: ISODate;
  meal: Meal;
  recipeId: number | null;
  locked: boolean;
  note: SlotNote | null;
}

export type SlotKey = `${ISODate}:${Meal}`;
export const slotKey = (s: { day: ISODate; meal: Meal }): SlotKey => `${s.day}:${s.meal}`;

export function compareSlots(a: { day: ISODate; meal: Meal }, b: { day: ISODate; meal: Meal }): number {
  return a.day < b.day ? -1 : a.day > b.day ? 1 : MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal);
}

// -------------------------------------------------------------- leftovers

export interface LeftoverPair {
  recipeId: number;
  cook: PlanSlot;
  leftover: PlanSlot;
}

/** Leftovers are eaten 1–2 days after cooking. */
export const leftoverGapOk = (cook: ISODate, leftover: ISODate) => {
  const gap = daysBetween(cook, leftover);
  return gap >= 1 && gap <= 2;
};

/**
 * A dish planned exactly twice, 1–2 days apart, is cooked once as a double
 * portion (the earlier slot) and eaten again as a leftover (the later one).
 */
export function leftoverPairs(slots: readonly PlanSlot[]): LeftoverPair[] {
  const byRecipe = new Map<number, PlanSlot[]>();
  for (const s of slots) {
    if (s.recipeId === null) continue;
    byRecipe.set(s.recipeId, [...(byRecipe.get(s.recipeId) ?? []), s]);
  }
  const pairs: LeftoverPair[] = [];
  for (const [recipeId, list] of byRecipe) {
    if (list.length !== 2) continue;
    const [cook, leftover] = [...list].sort(compareSlots);
    if (leftoverGapOk(cook.day, leftover.day)) pairs.push({ recipeId, cook, leftover });
  }
  return pairs.sort((a, b) => compareSlots(a.cook, b.cook));
}

/** Prep schedule: "Cook a double portion on [day]" for each leftover pair, by day. */
export const prepSchedule = leftoverPairs;

// --------------------------------------------------------------- generate

export interface Candidate {
  id: number;
  /** Slots Generate may put it in (mealsFor its category). */
  meals: ReadonlySet<Meal>;
}

export interface GenerateInput {
  /** Every switched-on slot of the plan, as it is now. */
  slots: readonly PlanSlot[];
  candidates: readonly Candidate[];
  /** "Leftover meals per week". */
  leftovers: number;
  /** Dishes marked "Not good for leftovers". */
  noLeftovers: ReadonlySet<number>;
  today: ISODate;
  rng: () => number;
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Past days and locked slots never change. */
const isFixed = (s: PlanSlot, today: ISODate) => s.locked || s.day < today;

const isMain = (m: Meal) => groupOf(m) === 'main';

/** Preferred leftover shapes: dinner → next day's lunch first. */
function pairTier(cook: PlanSlot, leftover: PlanSlot): number {
  const gap = daysBetween(cook.day, leftover.day);
  if (cook.meal === 'dinner' && leftover.meal === 'lunch' && gap === 1) return 0;
  if (gap === 1) return 1;
  return 2;
}

/**
 * Fills every open slot (not locked, not before today) with a candidate allowed
 * there, never repeating a dish except as a planned leftover. Plans up to
 * `leftovers` leftover pairs (counting pairs kept in fixed slots) in lunch and
 * dinner slots, then assigns the rest by maximum matching so as few slots as
 * possible stay empty ("nothing_matched").
 */
export function generatePlan({ slots, candidates, leftovers, noLeftovers, today, rng }: GenerateInput): PlanSlot[] {
  const fixed = slots.filter((s) => isFixed(s, today));
  const open = slots.filter((s) => !isFixed(s, today));
  const used = new Set(fixed.flatMap((s) => (s.recipeId === null ? [] : [s.recipeId])));
  let pool = shuffle(
    candidates.filter((c) => !used.has(c.id)),
    rng,
  );
  const assigned = new Map<SlotKey, number>();

  // 1. Leftover pairs, from dishes that can't fill breakfast/snack first (those are scarce).
  let wanted = Math.max(0, leftovers - leftoverPairs(fixed).length);
  const mainOpen = open.filter((s) => isMain(s.meal)).sort(compareSlots);
  const shapes = shuffle(
    mainOpen.flatMap((cook) =>
      mainOpen.filter((lo) => leftoverGapOk(cook.day, lo.day)).map((lo) => ({ cook, lo })),
    ),
    rng,
  ).sort((a, b) => pairTier(a.cook, a.lo) - pairTier(b.cook, b.lo));
  const scarce = (c: Candidate) => c.meals.has('breakfast') || c.meals.has('snack');
  const pairDishes = pool
    .filter((c) => !noLeftovers.has(c.id) && c.meals.has('lunch') && c.meals.has('dinner'))
    .sort((a, b) => Number(scarce(a)) - Number(scarce(b)));
  for (const dish of pairDishes) {
    if (wanted === 0) break;
    const shape = shapes.find(({ cook, lo }) => !assigned.has(slotKey(cook)) && !assigned.has(slotKey(lo)));
    if (!shape) break;
    assigned.set(slotKey(shape.cook), dish.id);
    assigned.set(slotKey(shape.lo), dish.id);
    wanted--;
  }
  const inPairs = new Set(assigned.values());
  pool = pool.filter((c) => !inPairs.has(c.id));

  // 2. Everything else: maximum bipartite matching (Kuhn), most constrained slots first.
  const rest = open.filter((s) => !assigned.has(slotKey(s)));
  const options = new Map(rest.map((s) => [slotKey(s), pool.filter((c) => c.meals.has(s.meal))]));
  rest.sort((a, b) => options.get(slotKey(a))!.length - options.get(slotKey(b))!.length || compareSlots(a, b));
  const slotOf = new Map<number, SlotKey>(); // dish → slot
  const dishOf = new Map<SlotKey, number>(); // slot → dish
  const augment = (key: SlotKey, seen: Set<number>): boolean => {
    for (const c of options.get(key)!) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const other = slotOf.get(c.id);
      if (other === undefined || augment(other, seen)) {
        slotOf.set(c.id, key);
        dishOf.set(key, c.id);
        return true;
      }
    }
    return false;
  };
  for (const s of rest) augment(slotKey(s), new Set());
  for (const [key, id] of dishOf) assigned.set(key, id);

  return slots.map((s) => {
    if (isFixed(s, today)) return s;
    const id = assigned.get(slotKey(s));
    return id === undefined ? { ...s, recipeId: null, note: 'nothing_matched' } : { ...s, recipeId: id, note: null };
  });
}

export interface Availability {
  group: MealGroup;
  /** Candidates allowed in this slot type (a dish counts in every type it fits). */
  dishes: number;
  /** Open slots of this type. */
  slots: number;
  /** Generate would leave some of these slots empty. */
  short: boolean;
}

/** What's available per switched-on slot type, counting planned leftovers. */
export function availability(input: Omit<GenerateInput, 'rng'>): Availability[] {
  const planned = generatePlan({ ...input, rng: () => 0 });
  const groups: MealGroup[] = ['breakfast', 'main', 'snack'];
  return groups.flatMap((group) => {
    const open = planned.filter((s) => groupOf(s.meal) === group && !isFixed(s, input.today));
    if (open.length === 0) return [];
    return [
      {
        group,
        dishes: input.candidates.filter((c) => [...c.meals].some((m) => groupOf(m) === group)).length,
        slots: open.length,
        short: open.some((s) => s.recipeId === null),
      },
    ];
  });
}

// ------------------------------------------------------------------ edits

export type EditError = 'past_day' | 'locked' | 'already_planned' | 'leftover_timing';
export type EditResult = { ok: true; slots: PlanSlot[] } | { ok: false; error: EditError };

export interface EditContext {
  today: ISODate;
  noLeftovers: ReadonlySet<number>;
}

const fail = (error: EditError): EditResult => ({ ok: false, error });

function set(slots: readonly PlanSlot[], key: SlotKey, patch: Partial<PlanSlot>): PlanSlot[] {
  return slots.map((s) => (slotKey(s) === key ? { ...s, ...patch } : s));
}

function find(slots: readonly PlanSlot[], key: SlotKey): PlanSlot {
  const s = slots.find((x) => slotKey(x) === key);
  if (!s) throw new Error(`No slot ${key}`);
  return s;
}

/** Days before today and locked slots can't be edited by hand. */
function editable(slot: PlanSlot, ctx: EditContext): EditError | null {
  if (slot.day < ctx.today) return 'past_day';
  if (slot.locked) return 'locked';
  return null;
}

/**
 * After an edit: a leftover whose cook-day meal changed is emptied ("Leftover
 * removed"), or kept as a normal meal if locked ("No longer a leftover"). A
 * leftover whose cook day has passed is never touched.
 */
function fixOrphanedLeftovers(before: readonly PlanSlot[], after: PlanSlot[], ctx: EditContext): PlanSlot[] {
  let out = after;
  for (const pair of leftoverPairs(before)) {
    const cookNow = find(out, slotKey(pair.cook));
    const loNow = find(out, slotKey(pair.leftover));
    if (cookNow.recipeId === pair.recipeId || loNow.recipeId !== pair.recipeId) continue;
    if (pair.cook.day < ctx.today || loNow.day < ctx.today) continue;
    // The dish may have moved into a new valid pair (e.g. the cook slot was moved); then it's fine.
    if (leftoverPairs(out).some((p) => p.recipeId === pair.recipeId)) continue;
    out = set(
      out,
      slotKey(loNow),
      loNow.locked ? { note: 'no_longer_leftover' } : { recipeId: null, note: 'leftover_removed' },
    );
  }
  return out;
}

/**
 * Repeats: a dish appears at most twice, and twice only as a leftover pair 1–2
 * days apart of a dish that is good for leftovers.
 */
function repeatError(slots: readonly PlanSlot[], ctx: EditContext): EditError | null {
  const count = new Map<number, number>();
  for (const s of slots) if (s.recipeId !== null) count.set(s.recipeId, (count.get(s.recipeId) ?? 0) + 1);
  const paired = new Set(leftoverPairs(slots).map((p) => p.recipeId));
  for (const [id, n] of count) {
    if (n > 2 || (n === 2 && (!paired.has(id) || ctx.noLeftovers.has(id)))) return 'already_planned';
  }
  return null;
}

/**
 * Puts a dish into a slot (any match, any slot type). If the dish is already
 * planned once, this is allowed only 1–2 days after it and makes it a leftover.
 */
export function swapSlot(slots: readonly PlanSlot[], key: SlotKey, recipeId: number, ctx: EditContext): EditResult {
  const slot = find(slots, key);
  const blocked = editable(slot, ctx);
  if (blocked) return fail(blocked);
  if (slot.recipeId === recipeId) return { ok: true, slots: [...slots] };
  const earlier = slots.filter((s) => s.recipeId === recipeId);
  if (earlier.length === 1 && compareSlots(earlier[0], slot) > 0) return fail('already_planned');
  const after = set(slots, key, { recipeId, note: null });
  const err = repeatError(after, ctx);
  if (err) return fail(err);
  return { ok: true, slots: fixOrphanedLeftovers(slots, after, ctx) };
}

export function clearSlot(slots: readonly PlanSlot[], key: SlotKey, ctx: EditContext): EditResult {
  const slot = find(slots, key);
  const blocked = editable(slot, ctx);
  if (blocked) return fail(blocked);
  return { ok: true, slots: fixOrphanedLeftovers(slots, set(slots, key, { recipeId: null, note: 'cleared' }), ctx) };
}

/**
 * Moves a dish to another slot; the target's dish (if any) goes the other way.
 * A cook-day meal or leftover must keep its role, 1–2 days apart.
 */
export function moveSlot(slots: readonly PlanSlot[], from: SlotKey, to: SlotKey, ctx: EditContext): EditResult {
  const a = find(slots, from);
  const b = find(slots, to);
  const blocked = editable(a, ctx) ?? editable(b, ctx);
  if (blocked) return fail(blocked);
  if (from === to) return { ok: true, slots: [...slots] };
  const after = slots.map((s) =>
    slotKey(s) === from
      ? { ...s, recipeId: b.recipeId, note: b.recipeId === null ? ('cleared' as const) : null }
      : slotKey(s) === to
        ? { ...s, recipeId: a.recipeId, note: null }
        : s,
  );
  const pairsBefore = leftoverPairs(slots);
  const pairsAfter = leftoverPairs(after);
  for (const [origin, target] of [
    [a, to],
    [b, from],
  ] as const) {
    const was = pairsBefore.find((p) => p.recipeId === origin.recipeId);
    if (!was || origin.recipeId === null) continue;
    const role = slotKey(was.cook) === slotKey(origin) ? 'cook' : 'leftover';
    const now = pairsAfter.find((p) => p.recipeId === origin.recipeId);
    if (!now || slotKey(now[role]) !== target) return fail('leftover_timing');
  }
  const err = repeatError(after, ctx);
  if (err) return fail(err);
  return { ok: true, slots: fixOrphanedLeftovers(slots, after, ctx) };
}

export function setLocked(slots: readonly PlanSlot[], key: SlotKey, locked: boolean, ctx: EditContext): EditResult {
  const slot = find(slots, key);
  if (slot.day < ctx.today) return fail('past_day');
  return { ok: true, slots: set(slots, key, { locked }) };
}

/**
 * "Not good for leftovers": this dish's planned leftovers (not yet past) are
 * emptied, or kept as normal meals when locked. Its cook-day meal stays.
 */
export function dropLeftoversOf(slots: readonly PlanSlot[], recipeId: number, ctx: EditContext): PlanSlot[] {
  let out = [...slots];
  for (const p of leftoverPairs(slots)) {
    if (p.recipeId !== recipeId || p.cook.day < ctx.today) continue;
    out = set(
      out,
      slotKey(p.leftover),
      p.leftover.locked ? { note: 'no_longer_leftover' } : { recipeId: null, note: 'leftover_removed' },
    );
  }
  return out;
}

/**
 * The Tonight round picked another dish: it replaces tonight's dinner (even a
 * locked one: both partners just decided). Tonight's old leftover follows the
 * usual rule; the winner's other future slots are emptied unless one becomes a
 * valid leftover of tonight's dinner.
 */
export function replaceTonight(slots: readonly PlanSlot[], today: ISODate, recipeId: number, ctx: EditContext): PlanSlot[] {
  const key = slotKey({ day: today, meal: 'dinner' });
  const dinner = slots.find((s) => slotKey(s) === key);
  if (!dinner || dinner.recipeId === recipeId) return [...slots];
  let after = set(slots, key, { recipeId, note: null, locked: false });
  const others = after.filter((s) => s.recipeId === recipeId && slotKey(s) !== key && s.day >= today).sort(compareSlots);
  const keep =
    others.length === 1 && !ctx.noLeftovers.has(recipeId) && leftoverGapOk(today, others[0].day) ? others[0] : null;
  for (const s of others) {
    if (s !== keep) after = set(after, slotKey(s), { recipeId: null, note: 'eaten_tonight' });
  }
  return fixOrphanedLeftovers(slots, after, ctx);
}

/** Slots whose dish, lock or note differ: the ones to save. */
export function changedSlots(before: readonly PlanSlot[], after: readonly PlanSlot[]): PlanSlot[] {
  const old = new Map(before.map((s) => [slotKey(s), s]));
  return after.filter((s) => {
    const o = old.get(slotKey(s));
    return !o || o.recipeId !== s.recipeId || o.locked !== s.locked || o.note !== s.note;
  });
}
