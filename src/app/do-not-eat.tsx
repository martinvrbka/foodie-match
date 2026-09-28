// My "Do not eat" marks, to undo a mis-tap or a change of taste. Only I see this list.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { RecipeMeta } from '../components/RecipeMeta';
import { cachedRecipes } from '../data/discover';
import { errorText } from '../data/errors';
import { useRecipeSettings } from '../data/filters';
import { photoUrl, type RecipeSummary } from '../data/recipes';
import { t } from '../i18n';
import { colors, font, radius, spacing } from '../theme/tokens';

export default function DoNotEat() {
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { settings, loadError, saveError, reload, setHidden } = useRecipeSettings();

  const load = useCallback(() => {
    setError(null);
    cachedRecipes().then(setRecipes, setError);
  }, []);
  useEffect(load, [load]);

  const marked = useMemo(
    () => (recipes && settings ? recipes.filter((r) => settings.hidden.has(r.id)) : null),
    [recipes, settings],
  );
  const shownError = error ?? loadError;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Button label={`‹ ${t('recipes.back')}`} variant="text" onPress={() => router.back()} />
        <Text style={styles.title}>{t('filters.listTitle')}</Text>
        <Text style={styles.intro}>{t('filters.listIntro')}</Text>
      </View>
      {saveError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t('filters.saveFailed', { message: errorText(saveError) })}
        </Text>
      ) : null}
      {shownError ? (
        <View style={styles.center}>
          <Text style={styles.body}>{errorText(shownError)}</Text>
          <Button
            label={t('common.retry')}
            onPress={() => {
              load();
              reload();
            }}
          />
        </View>
      ) : !marked ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primaryStrong} />
        </View>
      ) : (
        <FlatList
          data={marked}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={[styles.body, styles.empty]}>{t('filters.listEmpty')}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Image
                source={photoUrl(item.image_url, 'small')}
                style={styles.thumb}
                contentFit="cover"
                accessibilityLabel={t('recipes.photo', { title: item.title })}
              />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <RecipeMeta recipe={item} />
              </View>
              <Button
                label={t('filters.unmark')}
                accessibilityLabel={t('filters.unmarkFor', { title: item.title })}
                variant="text"
                onPress={() => setHidden(item.id, false)}
              />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, alignItems: 'flex-start', gap: spacing.xs },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text, paddingHorizontal: spacing.sm },
  intro: { fontSize: font.body, color: colors.textMuted, paddingHorizontal: spacing.sm },
  error: { fontSize: font.body, fontWeight: '600', color: colors.primaryStrong, paddingHorizontal: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  body: { fontSize: font.body, color: colors.text, textAlign: 'center' },
  empty: { paddingTop: spacing.xl },
  list: { padding: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.border },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: { fontSize: font.body, fontWeight: '700', color: colors.text },
});
