import { router } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { AvailabilityPanel } from '../../components/week/AvailabilityPanel';
import { Calendar } from '../../components/week/Calendar';
import { rangeLabel } from '../../components/week/format';
import { Reswipe } from '../../components/week/Reswipe';
import { SetupGrid } from '../../components/week/SetupGrid';
import { useAuth } from '../../data/auth';
import { cachedRecipes } from '../../data/discover';
import { errorText } from '../../data/errors';
import { useMatchList } from '../../data/matches';
import { useProfile } from '../../data/profile';
import type { RecipeSummary } from '../../data/recipes';
import { availabilityFor, candidatesFor, editContext, useWeek, type WeekPlan } from '../../data/week';
import { t } from '../../i18n';
import { isGenerated, mondayOf, startedWithoutAccept, startOptions } from '../../logic/week';
import { colors, font, spacing } from '../../theme/tokens';

export default function Week() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const { me, partner } = useProfile();
  const week = useWeek();
  const { matches } = useMatchList();
  const [recipes, setRecipes] = useState<Map<number, RecipeSummary>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // When I last opened each plan before now: partner changes after it get "Changed by".
  const [seenBefore, setSeenBefore] = useState<Map<string, string | null>>(new Map());
  const finishing = useRef(new Set<string>());
  const seenAsked = useRef(new Set<string>());

  useEffect(() => {
    cachedRecipes().then((all) => setRecipes(new Map(all.map((r) => [r.id, r]))), setError);
  }, []);

  const data = week.data;
  const plans = data?.plans ?? [];
  const plan: WeekPlan | null =
    plans.find((p) => p.id === selectedId) ?? plans.find((p) => p.phase === 'active') ?? plans[0] ?? null;
  const slots = (plan && data?.slots.get(plan.id)) || [];
  const members = (plan && data?.members.get(plan.id)) || [];
  const swipes = (plan && data?.swipes.get(plan.id)) || [];
  const mine = members.find((m) => m.userId === userId);
  const partnerMember = members.find((m) => m.userId !== userId);
  const matchRows = matches ?? [];
  // This week's selection (still matches) that I haven't re-swiped yet.
  const visible = new Set(matchRows.map((m) => m.recipe.id));
  const selection = (plan?.picks ?? []).filter((id) => visible.has(id)).flatMap((id) => recipes.get(id) ?? []);
  const mySwiped = new Set(swipes.filter((s) => s.userId === userId).map((s) => s.recipeId));
  const unswiped = selection.filter((r) => !mySwiped.has(r.id));
  const names = useMemo(
    () => new Map([...(me ? [[me.id, me.display_name] as const] : []), ...(partner ? [[partner.id, partner.display_name] as const] : [])]),
    [me, partner],
  );

  // Opening a plan: remember when I last saw it, then mark it seen.
  const planId = plan?.id ?? null;
  useEffect(() => {
    if (!planId || seenAsked.current.has(planId)) return;
    seenAsked.current.add(planId);
    week.markSeen(planId).then(
      (prev) => setSeenBefore((m) => new Map(m).set(planId, prev)),
      () => setSeenBefore((m) => new Map(m).set(planId, null)),
    );
  }, [planId, week]);

  // The partner generated while I was still re-swiping: my swiping ends.
  useEffect(() => {
    if (plan && isGenerated(plan.status) && mine && !mine.reswipeDone && !finishing.current.has(plan.id)) {
      finishing.current.add(plan.id);
      week.finishReswipe(plan.id).catch(() => finishing.current.delete(plan.id));
    }
  }, [plan, mine, week]);

  const run = (fn: () => Promise<unknown>) => async () => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const start = (firstDay: string) =>
    run(async () => {
      const r = await week.start(firstDay);
      setSelectedId(r.id);
      setNotice(r.joined && partner ? t('week.alreadyStarted', { name: partner.display_name }) : null);
    })();

  let body: ReactNode;
  if (!partner) {
    body = (
      <Centered>
        <Text style={styles.body}>{t('week.unpaired')}</Text>
        <Button label={t('pair.cta')} onPress={() => router.push('/pair')} />
      </Centered>
    );
  } else if (week.error) {
    body = (
      <Centered>
        <Text style={styles.body}>{errorText(week.error)}</Text>
        <Button label={t('common.retry')} onPress={week.reload} />
      </Centered>
    );
  } else if (!data || matches === null || recipes.size === 0) {
    body = (
      <Centered>
        <ActivityIndicator color={colors.primaryStrong} />
      </Centered>
    );
  } else if (!plan) {
    const opts = startOptions(plans, data.today);
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('week.cta')}</Text>
        <Text style={styles.muted}>{t('week.intro')}</Text>
        <Button label={t('week.planNextWeek')} onPress={() => start(opts.nextWeek)} busy={busy} />
        <Text style={[styles.muted, styles.centerText]}>{rangeLabel(opts.nextWeek, opts.nextWeek)}</Text>
        {opts.restOfThisWeek ? (
          <>
            <Button label={t('week.planRestOfWeek')} variant="text" onPress={() => start(opts.restOfThisWeek!)} disabled={busy} />
            <Text style={[styles.muted, styles.centerText]}>{rangeLabel(opts.restOfThisWeek, mondayOf(data.today))}</Text>
          </>
        ) : null}
      </ScrollView>
    );
  } else if (plan.status === 'setup') {
    body = (
      <SetupGrid
        plan={plan}
        slots={slots}
        notice={notice ?? (plan.startedBy !== userId ? t('week.alreadyStarted', { name: partner.display_name }) : null)}
        onCells={(cells) => run(() => week.setCells(plan.id, cells))()}
        onLeftovers={(n) => run(() => week.setLeftovers(plan.id, n))()}
        onBegin={run(() => week.beginChoosing(plan, slots, matchRows))}
        busy={busy}
      />
    );
  } else if (plan.status === 'choosing' && mine && !mine.reswipeDone && unswiped.length > 0) {
    body = (
      <Reswipe
        key={plan.id}
        cards={unswiped}
        total={selection.length}
        onSwipe={(id, liked) => week.reswipe(plan.id, id, liked)}
        onUndo={() => week.undoReswipe(plan.id)}
        onDone={run(() => week.finishReswipe(plan.id))}
      />
    );
  } else if (plan.status === 'choosing') {
    const candidates = candidatesFor(plan, swipes, matchRows);
    body = (
      <AvailabilityPanel
        lines={availabilityFor(plan, slots, candidates, data)}
        candidateCount={candidates.length}
        partnerName={partner.display_name}
        partnerDone={!!partnerMember?.reswipeDone}
        onGenerate={run(() => week.generate(plan, slots, candidates, data.noLeftovers))}
        busy={busy}
      />
    );
  } else {
    const since = seenBefore.get(plan.id);
    const banners: string[] = [];
    if (
      plan.generatedBy &&
      plan.generatedBy !== userId &&
      since !== undefined &&
      (since === null || Date.parse(plan.generatedAt ?? '') > Date.parse(since))
    ) {
      banners.push(t('week.madeBy', { name: names.get(plan.generatedBy) ?? '' }));
    }
    if (plan.status === 'accepted' && plan.acceptedBy) {
      banners.push(t('week.acceptedBy', { name: names.get(plan.acceptedBy) ?? '' }));
    }
    if (startedWithoutAccept(plan, data.today)) banners.push(t('week.notAccepted'));
    const ctx = editContext(data);
    body = (
      <Calendar
        plan={plan}
        slots={slots}
        recipes={recipes}
        matches={matchRows.map((m) => m.recipe)}
        ctx={ctx}
        userId={userId}
        names={names}
        markersSince={since}
        banners={banners}
        onSave={(after) => week.saveEdit(plan.id, slots, after)}
        onLeftoversOk={async (recipeId, ok, after) => {
          await week.setLeftoversOk(recipeId, ok);
          if (after) await week.saveEdit(plan.id, slots, after);
        }}
        onAccept={run(() => week.accept(plan.id))}
        onRegenerate={run(() => week.generate(plan, slots, candidatesFor(plan, swipes, matchRows), data.noLeftovers))}
        onDelete={run(async () => {
          await week.remove(plan.id);
          setSelectedId(null);
        })}
        busy={busy}
      />
    );
  }

  // Switch between this week and next week, or start the week that has no plan yet.
  const opts = data ? startOptions(plans, data.today) : null;
  const thisMonday = data ? mondayOf(data.today) : '';
  const tabs =
    partner && data && plan ? (
      <View style={styles.tabs}>
        {plans.map((p) => (
          <Chip
            key={p.id}
            label={p.weekStart === thisMonday ? t('week.thisWeek') : t('week.nextWeek')}
            selected={p.id === plan.id}
            onPress={() => {
              setSelectedId(p.id);
              setNotice(null);
            }}
          />
        ))}
        {opts && !plans.some((p) => p.weekStart === opts.nextWeek) ? (
          <Chip label={`+ ${t('week.planNextWeek')}`} onPress={() => start(opts.nextWeek)} />
        ) : null}
        {opts?.restOfThisWeek ? (
          <Chip label={`+ ${t('week.planRestOfWeek')}`} onPress={() => start(opts.restOfThisWeek!)} />
        ) : null}
      </View>
    ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t('week.title')}</Text>
          {plan ? <Text style={styles.muted}>{rangeLabel(plan.firstDay, plan.weekStart)}</Text> : null}
        </View>
      </View>
      {tabs}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorText(error)}
        </Text>
      ) : null}
      <View style={styles.flex}>{body}</View>
    </SafeAreaView>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <View style={[styles.flex, styles.center]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  headerText: { flex: 1 },
  headerTitle: { fontSize: font.title, fontWeight: '800', color: colors.text },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  body: { fontSize: font.body, color: colors.text, textAlign: 'center' },
  muted: { fontSize: font.small, color: colors.textMuted },
  centerText: { textAlign: 'center', marginTop: -spacing.sm },
  error: { fontSize: font.body, fontWeight: '600', color: colors.primaryStrong, textAlign: 'center', padding: spacing.sm },
});
