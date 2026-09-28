// All recipes, unfiltered by exclusions, with filters for my swipes and our matches, my
// advanced filters and my "Do not eat" marks (only my own settings apply here).
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { FilterPanel } from '../components/FilterPanel';
import { UndoToast } from '../components/UndoToast';
import { useAuth } from '../data/auth';
import { cachedRecipes, loadMyRecipeMarks, type SwipeFilter } from '../data/discover';
import { RecipeMeta } from '../components/RecipeMeta';
import { errorText } from '../data/errors';
import { toFilterable, useRecipeSettings } from '../data/filters';
import { photoUrl, type RecipeSummary } from '../data/recipes';
import { t } from '../i18n';
import { activeFilterCount, filterOptions, NO_FILTERS, visibleInOverview } from '../logic/filters';
import { colors, font, radius, spacing } from '../theme/tokens';

const FILTERS: { key: SwipeFilter; label: 'recipes.filterAll' | 'recipes.filterLiked' | 'recipes.filterNope' | 'recipes.filterMatches' }[] = [
  { key: 'all', label: 'recipes.filterAll' },
  { key: 'liked', label: 'recipes.filterLiked' },
  { key: 'nope', label: 'recipes.filterNope' },
  { key: 'matches', label: 'recipes.filterMatches' },
];

type Marks = Awaited<ReturnType<typeof loadMyRecipeMarks>>;

export default function Recipes() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [marks, setMarks] = useState<Marks | null>(null);
  const [filter, setFilter] = useState<SwipeFilter>('all');
  const [error, setError] = useState<unknown>(null);
  const { settings, loadError, saveError, reload, setFilters, setHidden } = useRecipeSettings();
  const [panelOpen, setPanelOpen] = useState(false);
  /** The recipe just marked "Do not eat", while Undo is offered. */
  const [justHidden, setJustHidden] = useState<RecipeSummary | null>(null);
  const hideToast = useCallback(() => setJustHidden(null), []);

  const load = useCallback(() => {
    setError(null);
    cachedRecipes().then(setRecipes, setError);
  }, []);
  useEffect(load, [load]);
  // Swipes change in Discover, so refresh the marks whenever this screen is shown.
  useFocusEffect(
    useCallback(() => {
      loadMyRecipeMarks(userId).then(setMarks, setError);
    }, [userId]),
  );

  const options = useMemo(() => filterOptions((recipes ?? []).map(toFilterable)), [recipes]);
  const shown = useMemo(() => {
    if (!recipes || !settings) return null;
    if (filter !== 'all' && !marks) return null;
    const allowed = new Set(
      visibleInOverview(recipes.map(toFilterable), settings.filters, settings.hidden).map((r) => r.id),
    );
    return recipes.filter((r) => allowed.has(r.id) && (filter === 'all' || marks![filter].has(r.id)));
  }, [recipes, marks, filter, settings]);
  const activeCount = settings ? activeFilterCount(settings.filters) : 0;
  const shownError = error ?? loadError;
  const retry = () => {
    load();
    reload();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Button label={`‹ ${t('recipes.back')}`} variant="text" onPress={() => router.back()} />
        <Text style={styles.title}>{t('recipes.title')}</Text>
        {shown ? <Text style={styles.count}>{t('recipes.count', { count: shown.length })}</Text> : null}
      </View>
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.key === 'all' || !marks ? t(f.label) : `${t(f.label)} (${marks[f.key].size})`}
            selected={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </View>
      {settings ? (
        <View style={styles.advancedRow}>
          <Button
            label={activeCount > 0 ? t('filters.advancedCount', { count: activeCount }) : t('filters.advanced')}
            variant="text"
            onPress={() => setPanelOpen((o) => !o)}
          />
          <Button
            label={t('filters.listLink', { count: settings.hidden.size })}
            variant="text"
            onPress={() => router.push('/do-not-eat')}
          />
        </View>
      ) : null}
      {saveError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t('filters.saveFailed', { message: errorText(saveError) })}
        </Text>
      ) : null}
      {shownError ? (
        <View style={styles.center}>
          <Text style={styles.body}>{errorText(shownError)}</Text>
          <Button label={t('common.retry')} onPress={retry} />
        </View>
      ) : !shown ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primaryStrong} />
        </View>
      ) : (
        <FlatList
          data={shown}
          ListHeaderComponent={
            panelOpen && settings ? <FilterPanel filters={settings.filters} options={options} onChange={setFilters} /> : null
          }
          ListEmptyComponent={
            activeCount > 0 ? (
              <View style={[styles.center, styles.emptyList]}>
                <Text style={styles.body}>{t('filters.emptyOverview')}</Text>
                <Button label={t('filters.clear')} onPress={() => setFilters(NO_FILTERS)} />
              </View>
            ) : (
              <Text style={[styles.body, styles.emptyList]}>{t('recipes.filterEmpty')}</Text>
            )
          }
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: String(item.id) } })}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Image
                source={photoUrl(item.image_url, 'small')}
                style={styles.thumb}
                contentFit="cover"
                transition={150}
                accessibilityLabel={t('recipes.photo', { title: item.title })}
              />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <RecipeMeta recipe={item} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('filters.doNotEatFor', { title: item.title })}
                onPress={() => {
                  setHidden(item.id, true);
                  setJustHidden(item);
                }}
                hitSlop={8}
                style={styles.doNotEat}
              >
                <Text style={styles.doNotEatLabel}>{t('filters.doNotEat')}</Text>
              </Pressable>
            </Pressable>
          )}
        />
      )}
      {justHidden ? (
        <UndoToast
          key={justHidden.id}
          message={t('filters.hiddenToast')}
          onUndo={() => {
            setHidden(justHidden.id, false);
            setJustHidden(null);
          }}
          onTimeout={hideToast}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, alignItems: 'flex-start' },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text, paddingHorizontal: spacing.sm },
  count: { fontSize: font.small, color: colors.textMuted, paddingHorizontal: spacing.sm },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.md },
  emptyList: { paddingTop: spacing.xl },
  advancedRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: spacing.sm },
  error: { fontSize: font.body, fontWeight: '600', color: colors.primaryStrong, paddingHorizontal: spacing.md },
  doNotEat: { minHeight: 44, maxWidth: 72, justifyContent: 'center' },
  doNotEatLabel: { fontSize: font.small, fontWeight: '700', color: colors.primaryStrong, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  body: { fontSize: font.body, color: colors.text, textAlign: 'center' },
  list: { padding: spacing.md, paddingBottom: spacing.xxl * 2, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.8 },
  thumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.border },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: { fontSize: font.body, fontWeight: '700', color: colors.text },
});
