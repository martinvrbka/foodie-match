// Realtime + RLS: the partner's phone hears about a live match, the invitee hears
// about an invite, and nobody else does.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { type Client, coupleOf, like, ok, pair, recipe, signUp } from './helpers';

type Payload = { eventType: string; new: Record<string, unknown> };

/** Subscribes and resolves once the channel is live; events are collected into `events`. */
async function listen(client: Client, table: string, filter?: string) {
  const events: Payload[] = [];
  const channel: RealtimeChannel = client.channel(`${table}-${Math.random()}`);
  await new Promise<void>((resolve, reject) => {
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, (p) =>
        events.push(p as unknown as Payload),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
      });
  });
  return { events, stop: () => client.removeChannel(channel) };
}

async function eventually(check: () => boolean, ms = 8000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for realtime event');
    await new Promise((r) => setTimeout(r, 100));
  }
}

const settle = () => new Promise((r) => setTimeout(r, 1500));

it("the partner's phone receives a live match (via = 'swipe'); another couple does not", async () => {
  const [a, b, c, d] = [await signUp('a'), await signUp('b'), await signUp('c'), await signUp('d')];
  await pair(a, b);
  await pair(c, d);
  const coupleId = await coupleOf(a);
  await Promise.all([a, c].map((u) => u.client.realtime.setAuth()));

  const aHears = await listen(a.client, 'matches', `couple_id=eq.${coupleId}`);
  const cHears = await listen(c.client, 'matches');
  try {
    const r = await recipe([]);
    await like(a, r);
    expect(await like(b, r)).toBe(true);
    await eventually(() => aHears.events.some((e) => e.eventType === 'INSERT'));
    expect(aHears.events[0].new).toMatchObject({ recipe_id: r, via: 'swipe' });
    await settle();
    expect(cHears.events).toEqual([]);
  } finally {
    await aHears.stop();
    await cHears.stop();
  }
});

it('the invitee receives the invite live; a stranger does not', async () => {
  const [a, b, c] = [await signUp('Anna'), await signUp('Ben'), await signUp('Cid')];
  await Promise.all([b, c].map((u) => u.client.realtime.setAuth()));
  const bHears = await listen(b.client, 'pairing_invites');
  const cHears = await listen(c.client, 'pairing_invites');
  try {
    await ok(a.client.rpc('send_pairing_invite', { p_email: b.email }));
    await eventually(() => bHears.events.some((e) => e.eventType === 'INSERT'));
    await settle();
    expect(cHears.events).toEqual([]);
  } finally {
    await bHears.stop();
    await cHears.stop();
  }
});

it('both profiles update live when they pair', async () => {
  const [a, b] = [await signUp('a'), await signUp('b')];
  await a.client.realtime.setAuth();
  const aHears = await listen(a.client, 'profiles');
  try {
    await pair(a, b);
    await eventually(() => aHears.events.some((e) => e.eventType === 'UPDATE' && e.new.id === a.id));
    // Only the UPDATE matters: the INSERT from sign-up can arrive late too.
    expect(aHears.events.find((e) => e.eventType === 'UPDATE' && e.new.id === a.id)!.new.couple_id).toBe(
      await coupleOf(a),
    );
  } finally {
    await aHears.stop();
  }
});
