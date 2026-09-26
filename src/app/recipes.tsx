// All recipes, unfiltered by exclusions, with filters for my swipes and our matches.
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { useAuth } from '../data/auth';
import { cachedRecipes, loadMyRecipeMarks, type SwipeFilter } from '../data/discover';
import { RecipeMeta } from '../components/RecipeMeta';
import { errorText } from '../data/errors';
import { photoUrl, type RecipeSummary } from '../data/recipes';
import { t } from '../i18n';
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

  const shown = useMemo(() => {
    if (!recipes || filter === 'all') return recipes;
    if (!marks) return null;
    return recipes.filter((r) => marks[filter].has(r.id));
  }, [recipes, marks, filter]);

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
      {error ? (
        <View style={styles.center}>
          <Text style={styles.body}>{errorText(error)}</Text>
          <Button label={t('common.retry')} onPress={load} />
        </View>
      ) : !shown ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primaryStrong} />
        </View>
      ) : (
        <FlatList
          data={shown}
          ListEmptyComponent={<Text style={[styles.body, styles.emptyList]}>{t('recipes.filterEmpty')}</Text>}
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
            </Pressable>
          )}
        />
      )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  body: { fontSize: font.body, color: colors.text, textAlign: 'center' },
  list: { padding: spacing.md, gap: spacing.sm },
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
