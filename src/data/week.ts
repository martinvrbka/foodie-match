import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  availability,
  type Candidate,
  changedSlots,
  type EditContext,
  generatePlan,
  type PlanSlot,
  type SlotNote,
} from '../logic/plan';
import {
  groupOf,
  isGenerated,
  localDate,
  type Meal,
  type MealGroup,
  mealsFor,
  pickSelection,
  planPhase,
  type PlanStatus,
  weekCandidates,
} from '../logic/week';
import { loadCoupleBlocked } from './filters';
import type { MatchRow } from './matches';
import { useProfile } from './profile';
import { supabase } from './supabase';

export interface WeekPlan {
  id: string;
  weekStart: string;
  firstDay: string;
  createdOn: string;
  status: PlanStatus;
  leftovers: number;
  picks: number[];
  startedBy: string;
  generatedBy: string | null;
  generatedAt: string | null;
  acceptedBy: string | null;
  phase: 'active' | 'upcoming';
}

export interface Slot extends PlanSlot {
  changedBy: string | null;
  changedAt: string | null;
}

export interface PlanMember {
  userId: string;
  reswipeDone: boolean;
}

export interface PlanSwipe {
  userId: string;
  recipeId: number;
  liked: boolean;
  createdAt: string;
}

export interface WeekData {
  today: string;
  /** Plans that still exist (active and upcoming), earliest week first. */
  plans: WeekPlan[];
  slots: Map<string, Slot[]>;
  members: Map<string, PlanMember[]>;
  swipes: Map<string, PlanSwipe[]>;
  /** Dishes marked "Not good for leftovers". */
  noLeftovers: Set<number>;
}

const group = <T, K>(rows: T[], key: (r: T) => K) => {
  const m = new Map<K, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
};

async function loadWeek(today: string): Promise<WeekData> {
  // Deletes plans that are over, so no history is kept.
  const cleanup = await supabase.rpc('plan_cleanup', { p_today: today });
  if (cleanup.error) throw cleanup.error;
  const [plans, slots, members, swipes, noLeft] = await Promise.all([
    supabase.from('week_plans').select('*').order('week_start'),
    supabase.from('week_plan_slots').select('*'),
    supabase.from('week_plan_members').select('plan_id, user_id, reswipe_done'),
    supabase.from('week_plan_swipes').select('plan_id, user_id, recipe_id, liked, created_at'),
    supabase.from('couple_no_leftovers').select('recipe_id'),
  ]);
  for (const r of [plans, slots, members, swipes, noLeft]) if (r.error) throw r.error;

  const list: WeekPlan[] = [];
  for (const p of plans.data!) {
    const dates = { weekStart: p.week_start, firstDay: p.first_day, status: p.status as PlanStatus, createdOn: p.created_on };
    const phase = planPhase(dates, today);
    if (phase === 'gone') continue;
    list.push({
      id: p.id,
      ...dates,
      leftovers: p.leftovers,
      picks: p.picks,
      startedBy: p.started_by,
      generatedBy: p.generated_by,
      generatedAt: p.generated_at,
      acceptedBy: p.accepted_by,
      phase,
    });
  }
  return {
    today,
    plans: list,
    slots: group(
      slots.data!.map((s) => ({
        planId: s.plan_id,
        day: s.day,
        meal: s.meal as Meal,
        recipeId: s.recipe_id,
        locked: s.locked,
        note: s.note as SlotNote | null,
        changedBy: s.changed_by,
        changedAt: s.changed_at,
      })),
      (s) => s.planId,
    ),
    members: group(
      members.data!.map((m) => ({ planId: m.plan_id, userId: m.user_id, reswipeDone: m.reswipe_done })),
      (m) => m.planId,
    ),
    swipes: group(
      swipes.data!.map((s) => ({
        planId: s.plan_id,
        userId: s.user_id,
        recipeId: s.recipe_id,
        liked: s.liked,
        createdAt: s.created_at,
      })),
      (s) => s.planId,
    ),
    noLeftovers: new Set(noLeft.data!.map((r) => r.recipe_id)),
  };
}

async function call<T = unknown>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

const toRow = (s: PlanSlot) => ({ day: s.day, meal: s.meal, recipe_id: s.recipeId, locked: s.locked, note: s.note });

/** The couple's weekly plans, live on both phones. */
export function useWeek() {
  const { me } = useProfile();
  const coupleId = me?.couple_id ?? null;
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!coupleId) {
      setData({ today: localDate(new Date()), plans: [], slots: new Map(), members: new Map(), swipes: new Map(), noLeftovers: new Set() });
      return;
    }
    try {
      setData(await loadWeek(localDate(new Date())));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [coupleId]);

  useEffect(() => {
    load();
    if (!coupleId) return;
    // Generate writes many slots at once: reload once after the burst.
    const soon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 250);
    };
    const channel = supabase
      .channel(`week-${coupleId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'week_plans', filter: `couple_id=eq.${coupleId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'week_plan_slots' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'week_plan_members' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'couple_no_leftovers' }, soon)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  const after =
    <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
    async (...a: A): Promise<R> => {
      const r = await fn(...a);
      await load();
      return r;
    };
  const today = data?.today ?? localDate(new Date());

  const actions = useMemo(
    () => ({
      start: after((firstDay: string) =>
        call<{ id: string; joined: boolean }>(supabase.rpc('plan_start', { p_first_day: firstDay, p_today: today })),
      ),
      setCells: after((planId: string, cells: { day: string; meal: Meal }[]) =>
        call(supabase.rpc('plan_setup', { p_plan: planId, p_cells: cells })),
      ),
      setLeftovers: after((planId: string, n: number) =>
        call(supabase.rpc('plan_set_leftovers', { p_plan: planId, p_leftovers: n })),
      ),
      /** Picks this week's selection (first phone wins) and starts the re-swipe. */
      beginChoosing: after(async (plan: WeekPlan, slots: Slot[], matches: MatchRow[]) => {
        const perGroup: Partial<Record<MealGroup, number>> = {};
        for (const s of slots) perGroup[groupOf(s.meal)] = (perGroup[groupOf(s.meal)] ?? 0) + 1;
        // Matches either partner's filters or "Do not eat" marks now block aren't offered this week.
        const blocked = await loadCoupleBlocked();
        const picks = pickSelection(
          matches.filter((m) => !blocked.has(m.recipe.id)).map((m) => ({ id: m.recipe.id, category: m.recipe.category })),
          perGroup,
          Math.random,
        );
        return call(supabase.rpc('plan_begin_choosing', { p_plan: plan.id, p_picks: picks }));
      }),
      // Swipes and undo don't reload: the card stack is local; the server has the truth.
      reswipe: (planId: string, recipeId: number, liked: boolean) =>
        call(supabase.rpc('plan_reswipe', { p_plan: planId, p_recipe_id: recipeId, p_liked: liked })),
      undoReswipe: (planId: string) => call<number>(supabase.rpc('plan_undo_reswipe', { p_plan: planId })),
      finishReswipe: after((planId: string) => call(supabase.rpc('plan_finish_reswipe', { p_plan: planId }))),
      /** Generate or Regenerate: fills open slots from this week's candidates and saves what changed. */
      generate: after((plan: WeekPlan, slots: Slot[], candidates: Candidate[], noLeftovers: Set<number>) => {
        const next = generatePlan({ slots, candidates, leftovers: plan.leftovers, noLeftovers, today, rng: Math.random });
        return call(
          supabase.rpc('plan_write_slots', {
            p_plan: plan.id,
            p_slots: changedSlots(slots, next).map(toRow),
            p_generate: true,
            p_today: today,
          }),
        );
      }),
      /** Saves a manual edit (the result of swapSlot, moveSlot…). */
      saveEdit: after((planId: string, before: PlanSlot[], after: PlanSlot[]) => {
        const changes = changedSlots(before, after);
        if (changes.length === 0) return Promise.resolve(null);
        return call(
          supabase.rpc('plan_write_slots', {
            p_plan: planId,
            p_slots: changes.map(toRow),
            p_generate: false,
            p_today: today,
          }),
        );
      }),
      accept: after((planId: string) => call(supabase.rpc('plan_accept', { p_plan: planId }))),
      /** Returns when I last opened this plan (null = never) and records now. */
      markSeen: (planId: string) => call<string | null>(supabase.rpc('plan_mark_seen', { p_plan: planId })),
      remove: after((planId: string) => call(supabase.rpc('plan_delete', { p_plan: planId }))),
      setLeftoversOk: after(setLeftoversOk),
    }),
    // `after` only closes over load; today changes at most once a day.
    [load, today],
  );

  return { data, error, reload: load, ...actions };
}

/** Plan dishes this week: this week's picks, still matches, rejected by neither partner. */
export function candidatesFor(plan: WeekPlan, swipes: PlanSwipe[], matches: MatchRow[]): Candidate[] {
  const byId = new Map(matches.map((m) => [m.recipe.id, m.recipe]));
  const rejected = new Set(swipes.filter((s) => !s.liked).map((s) => s.recipeId));
  return weekCandidates(plan.picks, new Set(byId.keys()), rejected).map((id) => ({
    id,
    meals: mealsFor(byId.get(id)!.category),
  }));
}

export function availabilityFor(plan: WeekPlan, slots: Slot[], candidates: Candidate[], data: WeekData) {
  return availability({ slots, candidates, leftovers: plan.leftovers, noLeftovers: data.noLeftovers, today: data.today });
}

export const editContext = (data: WeekData): EditContext => ({ today: data.today, noLeftovers: data.noLeftovers });

/** The plan whose tonight's dinner the Tonight screen offers: the active week. */
export function activePlan(data: WeekData | null): WeekPlan | null {
  return data?.plans.find((p) => p.phase === 'active' && isGenerated(p.status)) ?? null;
}

/** "Not good for leftovers" (ok = false) or "Good for leftovers again" (true), for the couple. */
export async function setLeftoversOk(recipeId: number, ok: boolean) {
  await call(supabase.rpc('set_leftovers_ok', { p_recipe_id: recipeId, p_ok: ok }));
}

/** Whether we marked this dish "Not good for leftovers". */
export async function isNoLeftovers(recipeId: number): Promise<boolean> {
  const { count, error } = await supabase
    .from('couple_no_leftovers')
    .select('recipe_id', { count: 'exact', head: true })
    .eq('recipe_id', recipeId);
  if (error) throw error;
  return (count ?? 0) > 0;
}
