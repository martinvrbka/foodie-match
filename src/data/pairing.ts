import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export async function createPairingCode(): Promise<{ code: string; expires_at: string }> {
  const { data, error } = await supabase.rpc('create_pairing_code');
  if (error) throw error;
  return data as { code: string; expires_at: string };
}

export async function redeemPairingCode(code: string): Promise<{ partner_name: string }> {
  const { data, error } = await supabase.rpc('redeem_pairing_code', { p_code: code });
  if (error) throw error;
  return data as { partner_name: string };
}

export async function sendInvite(email: string) {
  const { error } = await supabase.rpc('send_pairing_invite', { p_email: email });
  if (error) throw error;
}

export async function respondInvite(inviteId: string, accept: boolean) {
  const { error } = await supabase.rpc('respond_pairing_invite', { p_invite_id: inviteId, p_accept: accept });
  if (error) throw error;
}

export async function unpair() {
  const { error } = await supabase.rpc('unpair');
  if (error) throw error;
}

export interface IncomingInvite {
  invite_id: string;
  from_name: string;
  sent_at: string;
}

export interface Invites {
  incoming: IncomingInvite[];
  /** Emails I invited that haven't answered yet. */
  sent: string[];
  error: unknown;
  reload: () => void;
}

/** Pending invites to and from me. Updates live (an invite appears on the partner's phone at once). */
export function useInvites(userId: string): Invites {
  const [state, setState] = useState<Omit<Invites, 'reload'>>({ incoming: [], sent: [], error: null });

  const load = useCallback(async () => {
    const [incoming, sent] = await Promise.all([
      supabase.rpc('my_pending_invites'),
      supabase.from('pairing_invites').select('to_email').eq('from_user_id', userId).eq('status', 'pending'),
    ]);
    const error = incoming.error ?? sent.error;
    if (error) {
      setState((s) => ({ ...s, error }));
      return;
    }
    setState({ incoming: incoming.data ?? [], sent: (sent.data ?? []).map((r) => r.to_email), error: null });
  }, [userId]);

  useEffect(() => {
    load();
    // Unique topic: several screens may watch invites at once.
    const channel = supabase
      .channel(`invites-${userId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pairing_invites' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  return { ...state, reload: load };
}
