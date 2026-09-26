import { useCallback, useEffect, useRef, useState } from 'react';
import { type Participant, type TonightStatus, tonightAdvance } from '../logic/tonight';
import { cachedRecipes } from './discover';
import { useProfile } from './profile';
import { supabase } from './supabase';

export interface TonightFilters {
  maxMinutes: number | null;
  cuisine: string | null;
}

export interface TonightSession {
  id: string;
  status: TonightStatus;
  startedBy: string;
  filters: TonightFilters;
  shortlist: number[];
  winnerRecipeId: number | null;
  completedAt: string | null;
}

export interface TonightData {
  /** The couple's latest session (any status), or null. */
  session: TonightSession | null;
  me: Participant | null;
  partner: Participant | null;
  /** Recipes I already swiped in this session. */
  mySwiped: Set<number>;
  /** Past winners, newest first. */
  history: { recipeId: number; completedAt: string }[];
}

const empty: TonightData = { session: null, me: null, partner: null, mySwiped: new Set(), history: [] };

async function loadTonight(userId: string, coupleId: string): Promise<TonightData> {
  const [latest, history] = await Promise.all([
    supabase
      .from('tonight_sessions')
      .select('id, status, started_by, filters, shortlist, winner_recipe_id, completed_at')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('tonight_sessions')
      .select('winner_recipe_id, completed_at')
      .eq('couple_id', coupleId)
      .eq('status', 'done')
      .order('completed_at', { ascending: false })
      .limit(30),
  ]);
  if (latest.error) throw latest.error;
  if (history.error) throw history.error;
  const hist = history.data.flatMap((h) =>
    h.winner_recipe_id && h.completed_at ? [{ recipeId: h.winner_recipe_id, completedAt: h.completed_at }] : [],
  );
  const row = latest.data;
  if (!row) return { ...empty, history: hist };

  const [participants, swipes, rankings] = await Promise.all([
    supabase.from('tonight_participants').select('user_id, swipe_done, top_done, top_picks, rank_done').eq('session_id', row.id),
    supabase.from('swipes').select('user_id, recipe_id, liked').eq('session_id', row.id),
    supabase.from('tonight_rankings').select('user_id, recipe_id, rank').eq('session_id', row.id).order('rank'),
  ]);
  for (const r of [participants, swipes, rankings]) if (r.error) throw r.error;

  const participant = (uid: string): Participant | null => {
    const p = participants.data!.find((x) => x.user_id === uid);
    if (!p) return null;
    return {
      swipeDone: p.swipe_done,
      likes: new Set(swipes.data!.filter((s) => s.user_id === uid && s.liked).map((s) => s.recipe_id)),
      topDone: p.top_done,
      topPicks: p.top_picks,
      rankDone: p.rank_done,
      ranking: rankings.data!.filter((r) => r.user_id === uid).map((r) => r.recipe_id),
    };
  };
  const partnerId = participants.data!.find((p) => p.user_id !== userId)?.user_id;
  const filters = (row.filters ?? {}) as Partial<TonightFilters>;

  return {
    session: {
      id: row.id,
      status: row.status as TonightStatus,
      startedBy: row.started_by,
      filters: { maxMinutes: filters.maxMinutes ?? null, cuisine: filters.cuisine ?? null },
      shortlist: row.shortlist,
      winnerRecipeId: row.winner_recipe_id,
      completedAt: row.completed_at,
    },
    me: participant(userId),
    partner: partnerId ? participant(partnerId) : null,
    mySwiped: new Set(swipes.data!.filter((s) => s.user_id === userId).map((s) => s.recipe_id)),
    history: hist,
  };
}

async function rpc(name: string, args: Record<string, unknown>) {
  // The generated types know these RPCs; a loose signature keeps the call sites short.
  const { data, error } = await (supabase.rpc as (n: string, a: object) => ReturnType<typeof supabase.rpc>)(name, args);
  if (error) throw error;
  return data as unknown;
}

/**
 * The couple's Tonight session, live on both phones. Whenever both partners have
 * finished a round, this phone tries to move the session on; the server keeps
 * only the first attempt, so it's safe that both phones do it.
 */
export function useTonight(userId: string) {
  const { me } = useProfile();
  const coupleId = me?.couple_id ?? null;
  const [data, setData] = useState<TonightData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const advancing = useRef(false);

  const load = useCallback(async () => {
    if (!coupleId) {
      setData(empty);
      return;
    }
    try {
      const next = await loadTonight(userId, coupleId);
      setData(next);
      setError(null);
      await tryAdvance(next);
    } catch (e) {
      setError(e);
    }
    // tryAdvance only uses refs and load, so it needs no dependency here.
  }, [userId, coupleId]);

  const tryAdvance = async (d: TonightData) => {
    if (!d.session || !d.me || !d.partner || advancing.current) return;
    const recipes = await cachedRecipes();
    const cook = new Map(recipes.map((r) => [r.id, r.cook_time_min]));
    const step = tonightAdvance(
      { status: d.session.status, shortlist: d.session.shortlist, participants: [d.me, d.partner] },
      (id) => cook.get(id) ?? null,
      Math.random,
    );
    if (!step) return;
    advancing.current = true;
    try {
      await rpc('tonight_advance', {
        p_session: d.session.id,
        p_from: step.from,
        p_to: step.to,
        p_shortlist: step.shortlist ?? null,
        p_winner: step.winner ?? null,
      });
    } finally {
      advancing.current = false;
    }
    await load();
  };

  useEffect(() => {
    load();
    if (!coupleId) return;
    const suffix = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`tonight-${coupleId}-${suffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tonight_sessions', filter: `couple_id=eq.${coupleId}` }, () =>
        load(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tonight_participants' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  const act = (fn: () => Promise<unknown>) => async () => {
    await fn();
    await load();
  };
  const session = data?.session;

  return {
    data,
    error,
    reload: load,
    start: (filters: TonightFilters) => act(() => rpc('start_tonight', { p_filters: filters }))(),
    swipe: (recipeId: number, liked: boolean) =>
      rpc('tonight_swipe', { p_session: session!.id, p_recipe_id: recipeId, p_liked: liked }),
    finishSwiping: act(() => rpc('tonight_finish_swiping', { p_session: session!.id })),
    submitTop: (ids: number[]) => act(() => rpc('tonight_submit_top', { p_session: session!.id, p_recipe_ids: ids }))(),
    submitRanking: (ids: number[]) =>
      act(() => rpc('tonight_submit_ranking', { p_session: session!.id, p_recipe_ids: ids }))(),
    /** Choosing stage: the first tap on either phone decides. */
    choose: (recipeId: number) =>
      act(() =>
        rpc('tonight_advance', { p_session: session!.id, p_from: 'choosing', p_to: 'done', p_winner: recipeId }),
      )(),
    cancel: act(() => rpc('cancel_tonight', { p_session: session!.id })),
    /** New swipe round with the same filters. */
    reshuffle: act(async () => {
      await rpc('cancel_tonight', { p_session: session!.id });
      await rpc('start_tonight', { p_filters: session!.filters });
    }),
  };
}

// The winner screen stays until dismissed, per device.
const dismissedKey = (userId: string) => `tonightDismissed:${userId}`;

export function tonightDismissed(userId: string): string | null {
  try {
    return localStorage.getItem(dismissedKey(userId));
  } catch {
    return null;
  }
}

export function dismissTonight(userId: string, sessionId: string) {
  try {
    localStorage.setItem(dismissedKey(userId), sessionId);
  } catch {
    // The winner just shows again next time.
  }
}
