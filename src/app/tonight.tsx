import { Image } from 'expo-image';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { RecipeRow } from '../components/RecipeRow';
import { CardFace, SwipeCard, type SwipeCardHandle, type SwipeDirection } from '../components/SwipeCard';
import { useAuth } from '../data/auth';
import { cachedRecipes } from '../data/discover';
import { errorText } from '../data/errors';
import { type MatchRow, useMatchList } from '../data/matches';
import { useProfile } from '../data/profile';
import { photoUrl, type RecipeSummary } from '../data/recipes';
import { dismissTonight, type TonightFilters, tonightDismissed, useTonight } from '../data/tonight';
import { t } from '../i18n';
import { COOK_TIME_OPTIONS, filterMatches, matchCuisines } from '../logic/matches';
import { ACTIVE_STATUSES, TOP_N } from '../logic/tonight';
import { colors, font, radius, spacing } from '../theme/tokens';

const toItem = (m: MatchRow) => ({
  recipeId: m.recipe.id,
  createdAt: m.createdAt,
  cookTimeMin: m.recipe.cook_time_min,
  cuisine: m.recipe.cuisine,
  recipe: m.recipe,
});

export default function Tonight() {
  const { session: auth } = useAuth();
  const userId = auth!.user.id;
  const { partner } = useProfile();
  const tonight = useTonight(userId);
  const { matches } = useMatchList();
  const [dismissed, setDismissed] = useState(() => tonightDismissed(userId));
  const [error, setError] = useState<unknown>(null);

  const items = useMemo(() => (matches ?? []).map(toItem), [matches]);
  // All recipes, not just current matches: a past winner may no longer be a match.
  const [recipes, setRecipes] = useState<Map<number, RecipeSummary>>(new Map());
  useEffect(() => {
    cachedRecipes().then((all) => setRecipes(new Map(all.map((r) => [r.id, r]))), setError);
  }, []);
  const run = (fn: () => Promise<unknown>) => () => {
    setError(null);
    fn().catch(setError);
  };

  const s = tonight.data?.session ?? null;
  const me = tonight.data?.me;
  const active = !!s && ACTIVE_STATUSES.includes(s.status);
  const partnerName = partner?.display_name ?? '';

  let body: ReactNode;
  if (!partner) {
    body = (
      <Centered>
        <Text style={styles.body}>{t('tonight.unpaired')}</Text>
        <Button label={t('pair.cta')} onPress={() => router.replace('/pair')} />
      </Centered>
    );
  } else if (tonight.error) {
    body = (
      <Centered>
        <Text style={styles.body}>{errorText(tonight.error)}</Text>
        <Button label={t('common.retry')} onPress={tonight.reload} />
      </Centered>
    );
  } else if (!tonight.data || matches === null) {
    body = (
      <Centered>
        <ActivityIndicator color={colors.primaryStrong} />
      </Centered>
    );
  } else if (s?.status === 'done' && dismissed !== s.id && s.winnerRecipeId) {
    body = (
      <Winner
        recipe={recipes.get(s.winnerRecipeId) ?? null}
        recipeId={s.winnerRecipeId}
        onDone={() => {
          dismissTonight(userId, s.id);
          setDismissed(s.id);
        }}
      />
    );
  } else if (active && s && me) {
    const waiting = (
      <Centered>
        <ActivityIndicator color={colors.primaryStrong} />
        <Text style={styles.body}>{t('tonight.waiting', { name: partnerName })}</Text>
      </Centered>
    );
    if (s.status === 'swiping') {
      body = me.swipeDone ? (
        waiting
      ) : (
        <SwipeRound
          key={s.id}
          pool={filterMatches(items, s.filters)
            .filter((i) => !tonight.data!.mySwiped.has(i.recipeId))
            .map((i) => i.recipe)}
          onSwipe={tonight.swipe}
          onFinished={run(tonight.finishSwiping)}
        />
      );
    } else if (s.status === 'choosing') {
      body = (
        <Choosing
          options={s.shortlist.map((id) => recipes.get(id)).filter((r): r is RecipeSummary => !!r)}
          onChoose={(id) => run(() => tonight.choose(id))()}
          onReshuffle={run(tonight.reshuffle)}
        />
      );
    } else if (s.status === 'shortlisting') {
      body = me.topDone ? (
        waiting
      ) : (
        <PickTop
          options={s.shortlist.map((id) => recipes.get(id)).filter((r): r is RecipeSummary => !!r)}
          onSubmit={(ids) => run(() => tonight.submitTop(ids))()}
        />
      );
    } else {
      body = me.rankDone ? (
        waiting
      ) : (
        <Rank
          options={s.shortlist.map((id) => recipes.get(id)).filter((r): r is RecipeSummary => !!r)}
          onSubmit={(ids) => run(() => tonight.submitRanking(ids))()}
        />
      );
    }
  } else {
    body = (
      <StartForm
        items={items}
        history={(tonight.data.history ?? []).map((h) => ({ ...h, recipe: recipes.get(h.recipeId) }))}
        onStart={(filters) => run(() => tonight.start(filters))()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Button label={`‹ ${t('recipes.back')}`} variant="text" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>{t('tonight.title')}</Text>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorText(error)}
        </Text>
      ) : null}
      <View style={styles.flex}>{body}</View>
      {active ? (
        <View style={styles.footer}>
          <Button label={t('tonight.cancel')} variant="text" onPress={run(tonight.cancel)} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Centered({ children }: { children: ReactNode }) {
  return <View style={[styles.flex, styles.center]}>{children}</View>;
}

function StartForm({
  items,
  history,
  onStart,
}: {
  items: ReturnType<typeof toItem>[];
  history: { recipeId: number; completedAt: string; recipe?: RecipeSummary }[];
  onStart: (f: TonightFilters) => void;
}) {
  const [filters, setFilters] = useState<TonightFilters>({ maxMinutes: null, cuisine: null });
  const pool = filterMatches(items, filters);
  const cuisines = matchCuisines(items);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('tonight.cta')}</Text>
      <Text style={styles.muted}>{t('tonight.intro')}</Text>
      <Text style={styles.label}>{t('matches.time')}</Text>
      <View style={styles.wrap}>
        {[null, ...COOK_TIME_OPTIONS].map((min) => (
          <Chip
            key={String(min)}
            label={min === null ? t('matches.anyTime') : t('matches.upTo', { min })}
            selected={filters.maxMinutes === min}
            onPress={() => setFilters((f) => ({ ...f, maxMinutes: min }))}
          />
        ))}
      </View>
      {cuisines.length > 1 ? (
        <>
          <Text style={styles.label}>{t('matches.cuisine')}</Text>
          <View style={styles.wrap}>
            {[null, ...cuisines].map((c) => (
              <Chip
                key={c ?? 'all'}
                label={c ?? t('matches.anyCuisine')}
                selected={filters.cuisine === c}
                onPress={() => setFilters((f) => ({ ...f, cuisine: c }))}
              />
            ))}
          </View>
        </>
      ) : null}
      <Text style={styles.body}>
        {pool.length > 0 ? t('tonight.poolCount', { count: pool.length }) : t('tonight.poolEmpty')}
      </Text>
      <Button label={t('tonight.start')} onPress={() => onStart(filters)} disabled={pool.length === 0} />

      <Text style={styles.sectionTitle}>{t('tonight.history')}</Text>
      {history.length === 0 ? <Text style={styles.muted}>{t('tonight.historyEmpty')}</Text> : null}
      {history.map((h) =>
        h.recipe ? (
          <RecipeRow
            key={h.completedAt}
            recipe={h.recipe}
            onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: String(h.recipeId) } })}
            trailing={<Text style={styles.muted}>{new Date(h.completedAt).toLocaleDateString()}</Text>}
          />
        ) : null,
      )}
    </ScrollView>
  );
}

function SwipeRound({
  pool,
  onSwipe,
  onFinished,
}: {
  pool: RecipeSummary[];
  onSwipe: (id: number, liked: boolean) => Promise<unknown>;
  onFinished: () => void;
}) {
  // Order is shuffled once per phone for this round.
  const [deck, setDeck] = useState(() => shuffled(pool));
  const [total] = useState(pool.length);
  const [error, setError] = useState<unknown>(null);
  const top = useRef<SwipeCardHandle>(null);
  const finished = useRef(false);

  const finishIfEmpty = (remaining: RecipeSummary[]) => {
    if (remaining.length === 0 && !finished.current) {
      finished.current = true;
      onFinished();
    }
  };

  const onSwiped = (dir: SwipeDirection) => {
    const card = deck[0];
    if (!card) return;
    const rest = deck.slice(1);
    setDeck(rest);
    setError(null);
    onSwipe(card.id, dir === 'right').then(
      () => finishIfEmpty(rest),
      (e) => {
        setDeck((d) => [card, ...d]);
        setError(e);
      },
    );
  };

  if (total === 0) {
    return (
      <Centered>
        <Text style={styles.body}>{t('tonight.nothingToSwipe')}</Text>
        <Button label={t('tonight.finish')} onPress={() => finishIfEmpty([])} />
      </Centered>
    );
  }

  const [current, next] = deck;
  return (
    <View style={styles.flex}>
      <Text style={styles.progress}>
        {t('tonight.swipeTitle')} · {t('tonight.swipeProgress', { done: total - deck.length, total })}
      </Text>
      {error ? <Text style={styles.error}>{t('discover.saveFailed', { message: errorText(error) })}</Text> : null}
      <View style={styles.stack}>
        {next ? (
          <View style={[StyleSheet.absoluteFill, styles.under]}>
            <CardFace recipe={next} badge={null} />
          </View>
        ) : null}
        {current ? (
          <SwipeCard
            key={current.id}
            ref={top}
            recipe={current}
            badge={null}
            onSwiped={onSwiped}
            onOpen={() => router.push({ pathname: '/recipe/[id]', params: { id: String(current.id) } })}
          />
        ) : (
          <Centered>
            <ActivityIndicator color={colors.primaryStrong} />
          </Centered>
        )}
      </View>
      <View style={styles.actions}>
        <Button label={`✕ ${t('discover.nope')}`} variant="text" onPress={() => top.current?.swipe('left')} disabled={!current} />
        <Button label={`♥ ${t('discover.like')}`} onPress={() => top.current?.swipe('right')} disabled={!current} />
      </View>
    </View>
  );
}

function Choosing({
  options,
  onChoose,
  onReshuffle,
}: {
  options: RecipeSummary[];
  onChoose: (id: number) => void;
  onReshuffle: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('tonight.choosingTitle')}</Text>
      <Text style={styles.muted}>{options.length ? t('tonight.choosingBody') : t('tonight.nothingLiked')}</Text>
      {options.map((r) => (
        <RecipeRow key={r.id} recipe={r} onPress={() => onChoose(r.id)} />
      ))}
      <Button label={t('tonight.reshuffle')} variant={options.length ? 'text' : 'primary'} onPress={onReshuffle} />
    </ScrollView>
  );
}

function PickTop({ options, onSubmit }: { options: RecipeSummary[]; onSubmit: (ids: number[]) => void }) {
  const count = Math.min(TOP_N, options.length);
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < count ? [...p, id] : p));
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('tonight.topTitle', { count })}</Text>
      <Text style={styles.muted}>{t('tonight.topBody', { count, total: options.length })}</Text>
      {options.map((r) => (
        <RecipeRow
          key={r.id}
          recipe={r}
          accessibilityRole="checkbox"
          checked={picked.includes(r.id)}
          selected={picked.includes(r.id)}
          onPress={() => toggle(r.id)}
          trailing={picked.includes(r.id) ? <Text style={styles.mark}>✓</Text> : null}
        />
      ))}
      <Text style={styles.body}>{t('tonight.topSelected', { selected: picked.length, count })}</Text>
      <Button label={t('tonight.submit')} onPress={() => onSubmit(picked)} disabled={picked.length !== count} />
    </ScrollView>
  );
}

/** Tap in order of preference; the order is the ranking (accessible alternative to dragging). */
function Rank({ options, onSubmit }: { options: RecipeSummary[]; onSubmit: (ids: number[]) => void }) {
  const [order, setOrder] = useState<number[]>([]);
  const tap = (id: number) => setOrder((o) => (o.includes(id) ? o.slice(0, o.indexOf(id)) : [...o, id]));
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('tonight.rankTitle')}</Text>
      <Text style={styles.muted}>{t('tonight.rankBody')}</Text>
      {options.map((r) => {
        const rank = order.indexOf(r.id);
        return (
          <RecipeRow
            key={r.id}
            recipe={r}
            selected={rank >= 0}
            onPress={() => tap(r.id)}
            trailing={rank >= 0 ? <Text style={styles.mark}>{rank + 1}</Text> : null}
          />
        );
      })}
      <Button label={t('tonight.submit')} onPress={() => onSubmit(order)} disabled={order.length !== options.length} />
      <Button label={t('tonight.reset')} variant="text" onPress={() => setOrder([])} disabled={order.length === 0} />
    </ScrollView>
  );
}

function Winner({ recipe, recipeId, onDone }: { recipe: RecipeSummary | null; recipeId: number; onDone: () => void }) {
  return (
    <ScrollView contentContainerStyle={[styles.content, styles.winner]}>
      <Text style={styles.winnerLabel}>{t('tonight.winnerTitle')}</Text>
      {recipe ? (
        <>
          <Image source={photoUrl(recipe.image_url, 'full')} style={styles.winnerPhoto} contentFit="cover" />
          <Text style={styles.winnerTitle} accessibilityRole="header">
            {recipe.title}
          </Text>
        </>
      ) : null}
      <Button
        label={t('tonight.openRecipe')}
        onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: String(recipeId) } })}
      />
      <Button label={t('tonight.done')} variant="text" onPress={onDone} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm },
  headerTitle: { fontSize: font.title, fontWeight: '800', color: colors.text },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  sectionTitle: { fontSize: font.title, fontWeight: '700', color: colors.text, marginTop: spacing.xl },
  label: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  body: { fontSize: font.body, color: colors.text, textAlign: 'center', marginVertical: spacing.sm },
  muted: { fontSize: font.small, color: colors.textMuted },
  error: { fontSize: font.body, fontWeight: '600', color: colors.primaryStrong, textAlign: 'center', padding: spacing.sm },
  progress: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, textAlign: 'center' },
  stack: { flex: 1, margin: spacing.md },
  under: { transform: [{ scale: 0.95 }, { translateY: 12 }] },
  actions: { flexDirection: 'row', justifyContent: 'space-evenly', paddingBottom: spacing.md },
  mark: { fontSize: font.title, fontWeight: '800', color: colors.primaryStrong, minWidth: 28, textAlign: 'center' },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.sm, alignItems: 'center' },
  winner: { alignItems: 'center' },
  winnerLabel: { fontSize: font.title, fontWeight: '700', color: colors.textMuted, marginTop: spacing.lg },
  winnerPhoto: { width: '100%', aspectRatio: 1, borderRadius: radius.lg, backgroundColor: colors.border },
  winnerTitle: { fontSize: font.hero, fontWeight: '900', color: colors.text, textAlign: 'center' },
});
