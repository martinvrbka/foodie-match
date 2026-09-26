import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { Tables } from './database.types';
import { supabase } from './supabase';

export type Profile = Tables<'profiles'>;

export interface MyProfile {
  me: Profile | null;
  partner: Profile | null;
  loading: boolean;
  error: unknown;
  reload: () => void;
}

const ProfileContext = createContext<MyProfile>({
  me: null,
  partner: null,
  loading: true,
  error: null,
  reload: () => {},
});

/**
 * My profile and my partner's (if paired), shared by all signed-in screens.
 * Updates live, e.g. on both phones the moment they pair or unpair.
 */
export function ProfileProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [state, setState] = useState<Omit<MyProfile, 'reload'>>({
    me: null,
    partner: null,
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    // RLS returns exactly me, plus my partner when paired.
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) {
      setState((s) => ({ ...s, loading: false, error }));
      return;
    }
    setState({
      me: data.find((p) => p.id === userId) ?? null,
      partner: data.find((p) => p.id !== userId) ?? null,
      loading: false,
      error: null,
    });
  }, [userId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`profiles-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  return <ProfileContext.Provider value={{ ...state, reload: load }}>{children}</ProfileContext.Provider>;
}

export const useProfile = () => useContext(ProfileContext);

/** Marks the first-run "What don't you eat?" step as done. */
export async function setOnboarded(userId: string) {
  const { error } = await supabase.from('profiles').update({ onboarded: true }).eq('id', userId);
  if (error) throw error;
}
