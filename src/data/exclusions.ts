import { useCallback, useEffect, useRef, useState } from 'react';
import { type Ingredient, type PresetKey, togglePreset } from '../logic/exclusions';
import type { Category } from '../logic/ingredients';
import { supabase } from './supabase';

const PAGE = 1000;

export async function listIngredients(): Promise<Ingredient[]> {
  const out: Ingredient[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('ingredients')
      .select('id, canonical_name, category, parent_id')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(
      ...data.map((r) => ({
        id: r.id,
        name: r.canonical_name,
        category: r.category as Category,
        parentId: r.parent_id,
      })),
    );
    if (data.length < PAGE) return out;
  }
}

async function listMyExclusions(userId: string): Promise<Set<number>> {
  // RLS also returns the partner's rows, so filter to mine.
  const { data, error } = await supabase
    .from('user_excluded_ingredients')
    .select('ingredient_id')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set(data.map((r) => r.ingredient_id));
}

async function save(add: number[], remove: number[]) {
  if (add.length > 0) {
    const { error } = await supabase
      .from('user_excluded_ingredients')
      .upsert(add.map((ingredient_id) => ({ ingredient_id })), { onConflict: 'user_id,ingredient_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  if (remove.length > 0) {
    const { error } = await supabase.from('user_excluded_ingredients').delete().in('ingredient_id', remove);
    if (error) throw error;
  }
}

export interface Exclusions {
  ingredients: Ingredient[] | null;
  /** Explicitly excluded ingredient ids (descendants are implied, see exclusionStates). */
  explicit: Set<number>;
  loadError: unknown;
  saveError: unknown;
  reload: () => void;
  toggle: (id: number) => void;
  remove: (id: number) => void;
  applyPreset: (key: PresetKey) => void;
}

/** My "I don't eat" list. Changes show immediately and roll back if saving fails. */
export function useExclusions(userId: string): Exclusions {
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [explicit, setExplicit] = useState<Set<number>>(new Set());
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const current = useRef(explicit);
  current.current = explicit;

  const reload = useCallback(() => {
    setLoadError(null);
    Promise.all([listIngredients(), listMyExclusions(userId)]).then(([ings, mine]) => {
      setIngredients(ings);
      setExplicit(mine);
    }, setLoadError);
  }, [userId]);
  useEffect(reload, [reload]);

  const change = useCallback((add: number[], remove: number[]) => {
    if (add.length === 0 && remove.length === 0) return;
    const before = current.current;
    const next = new Set(before);
    add.forEach((id) => next.add(id));
    remove.forEach((id) => next.delete(id));
    setExplicit(next);
    setSaveError(null);
    save(add, remove).catch((e) => {
      setExplicit(before);
      setSaveError(e);
    });
  }, []);

  return {
    ingredients,
    explicit,
    loadError,
    saveError,
    reload,
    toggle: (id) => (current.current.has(id) ? change([], [id]) : change([id], [])),
    remove: (id) => change([], [id]),
    applyPreset: (key) => {
      if (!ingredients) return;
      const { add, remove } = togglePreset(key, ingredients, current.current);
      change(add, remove);
    },
  };
}
