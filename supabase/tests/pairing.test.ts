import { admin, coupleOf, failsWith, ok, pair, signUp, unique } from './helpers';

describe('sign-up', () => {
  it('creates a profile with the display name and a normalized email', async () => {
    const email = `  ${unique('Anna').toUpperCase()}@Test.Local `;
    const u = await signUp('Anna', email.trim());
    const { data } = await ok(u.client.from('profiles').select('display_name, email, couple_id').single());
    expect(data).toEqual({ display_name: 'Anna', email: email.trim().toLowerCase(), couple_id: null });
  });
});

describe('pairing by code', () => {
  it('pairs both users and each can then read the partner profile', async () => {
    const a = await signUp('Anna');
    const b = await signUp('Ben');
    const { data: code } = await ok(a.client.rpc('create_pairing_code'));
    const { code: c } = code as { code: string };
    expect(c).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);

    const { data } = await ok(b.client.rpc('redeem_pairing_code', { p_code: ` ${c.toLowerCase()} ` }));
    expect(data).toMatchObject({ partner_name: 'Anna' });
    expect(await coupleOf(a)).not.toBeNull();
    expect(await coupleOf(a)).toBe(await coupleOf(b));

    const { data: seen } = await ok(b.client.from('profiles').select('display_name').order('display_name'));
    expect(seen!.map((p) => p.display_name)).toEqual(['Anna', 'Ben']);
  });

  it('a code works only once', async () => {
    const [a, b, c] = [await signUp('a'), await signUp('b'), await signUp('c')];
    const { data } = await ok(a.client.rpc('create_pairing_code'));
    const code = (data as { code: string }).code;
    await ok(b.client.rpc('redeem_pairing_code', { p_code: code }));
    // After pairing, a's unused codes are gone and this one is used.
    await failsWith(c.client.rpc('redeem_pairing_code', { p_code: code }), 'code_used');
  });

  it('rejects an expired code', async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    const { data } = await ok(a.client.rpc('create_pairing_code'));
    const code = (data as { code: string }).code;
    await ok(admin.from('pairing_codes').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('code', code));
    await failsWith(b.client.rpc('redeem_pairing_code', { p_code: code }), 'code_expired');
    expect(await coupleOf(b)).toBeNull();
  });

  it('rejects an unknown code and your own code', async () => {
    const a = await signUp('a');
    await failsWith(a.client.rpc('redeem_pairing_code', { p_code: 'ZZZZZZ' }), 'code_not_found');
    const { data } = await ok(a.client.rpc('create_pairing_code'));
    await failsWith(a.client.rpc('redeem_pairing_code', { p_code: (data as { code: string }).code }), 'own_code');
  });

  it('a new code replaces the previous unused one', async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    const first = ((await ok(a.client.rpc('create_pairing_code'))).data as { code: string }).code;
    await ok(a.client.rpc('create_pairing_code'));
    await failsWith(b.client.rpc('redeem_pairing_code', { p_code: first }), 'code_not_found');
  });

  it('rejects pairing when either side is already in a couple', async () => {
    const [a, b, c] = [await signUp('a'), await signUp('b'), await signUp('c')];
    await pair(a, b);
    await failsWith(a.client.rpc('create_pairing_code'), 'already_paired');
    const { data } = await ok(c.client.rpc('create_pairing_code'));
    await failsWith(a.client.rpc('redeem_pairing_code', { p_code: (data as { code: string }).code }), 'already_paired');
  });

  it('a couple can never get a third member, even bypassing the RPCs', async () => {
    const [a, b, c] = [await signUp('a'), await signUp('b'), await signUp('c')];
    await pair(a, b);
    const { error } = await admin.from('profiles').update({ couple_id: await coupleOf(a) }).eq('id', c.id);
    expect(error?.message).toBe('couple_full');
  });
});

describe('pairing by email invite', () => {
  it('invitee sees the invite with the sender name and accepting pairs them', async () => {
    const [a, b] = [await signUp('Anna'), await signUp('Ben')];
    await ok(a.client.rpc('send_pairing_invite', { p_email: `  ${b.email.toUpperCase()} ` }));

    const { data: invites } = await ok(b.client.rpc('my_pending_invites'));
    expect(invites).toHaveLength(1);
    expect(invites![0].from_name).toBe('Anna');

    const { data } = await ok(
      b.client.rpc('respond_pairing_invite', { p_invite_id: invites![0].invite_id, p_accept: true }),
    );
    expect(data).toMatchObject({ accepted: true, partner_name: 'Anna' });
    expect(await coupleOf(a)).toBe(await coupleOf(b));
  });

  it('an invite sent before the partner has an account shows up after they sign up', async () => {
    const a = await signUp('Anna');
    const email = `${unique('later')}@test.local`;
    await ok(a.client.rpc('send_pairing_invite', { p_email: email }));
    const b = await signUp('Ben', email);
    const { data } = await ok(b.client.rpc('my_pending_invites'));
    expect(data!.map((i) => i.from_name)).toEqual(['Anna']);
  });

  it('declining leaves both unpaired', async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    await ok(a.client.rpc('send_pairing_invite', { p_email: b.email }));
    const { data } = await ok(b.client.rpc('my_pending_invites'));
    await ok(b.client.rpc('respond_pairing_invite', { p_invite_id: data![0].invite_id, p_accept: false }));
    expect(await coupleOf(b)).toBeNull();
    expect((await ok(b.client.rpc('my_pending_invites'))).data).toEqual([]);
  });

  it('pairing declines all other pending invites of both partners', async () => {
    const [a, b, c] = [await signUp('a'), await signUp('b'), await signUp('c')];
    await ok(c.client.rpc('send_pairing_invite', { p_email: b.email }));
    await ok(a.client.rpc('send_pairing_invite', { p_email: c.email }));
    await pair(a, b);
    expect((await ok(b.client.rpc('my_pending_invites'))).data).toEqual([]);
    expect((await ok(c.client.rpc('my_pending_invites'))).data).toEqual([]);
  });

  it('only the addressee can answer an invite', async () => {
    const [a, b, c] = [await signUp('a'), await signUp('b'), await signUp('c')];
    const { data: id } = await ok(a.client.rpc('send_pairing_invite', { p_email: b.email }));
    await failsWith(c.client.rpc('respond_pairing_invite', { p_invite_id: id!, p_accept: true }), 'invite_not_found');
  });

  it('rejects own email, bad email and an already paired invitee', async () => {
    const [a, b, c] = [await signUp('a'), await signUp('b'), await signUp('c')];
    await failsWith(a.client.rpc('send_pairing_invite', { p_email: a.email }), 'own_email');
    await failsWith(a.client.rpc('send_pairing_invite', { p_email: 'not-an-email' }), 'invalid_email');
    await pair(b, c);
    await failsWith(a.client.rpc('send_pairing_invite', { p_email: b.email }), 'partner_already_paired');
  });
});

describe('unpair', () => {
  it('dissolves the couple for both and they can pair again', async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    await pair(a, b);
    const couple = await coupleOf(a);
    await ok(b.client.rpc('unpair'));
    expect(await coupleOf(a)).toBeNull();
    expect(await coupleOf(b)).toBeNull();
    const { data } = await ok(admin.from('couples').select('dissolved_at').eq('id', couple!).single());
    expect(data!.dissolved_at).not.toBeNull();
    await pair(a, b);
    expect(await coupleOf(a)).not.toBe(couple);
  });

  it('fails when not paired', async () => {
    const a = await signUp('a');
    await failsWith(a.client.rpc('unpair'), 'not_paired');
  });
});
