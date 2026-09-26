// Plain list of all recipes. Temporary way in to the detail screen until
// the Discover card stack exists.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { RecipeMeta } from '../components/RecipeMeta';
import { errorText } from '../data/errors';
import { listRecipes, photoUrl, type RecipeSummary } from '../data/recipes';
import { t } from '../i18n';
import { colors, font, radius, spacing } from '../theme/tokens';

export default function Recipes() {
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    listRecipes().then(setRecipes, setError);
  }, []);
  useEffect(load, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Button label={`‹ ${t('recipes.back')}`} variant="text" onPress={() => router.back()} />
        <Text style={styles.title}>{t('recipes.title')}</Text>
        {recipes ? <Text style={styles.count}>{t('recipes.count', { count: recipes.length })}</Text> : null}
      </View>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.body}>{errorText(error)}</Text>
          <Button label={t('common.retry')} onPress={load} />
        </View>
      ) : !recipes ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primaryStrong} />
        </View>
      ) : (
        <FlatList
          data={recipes}
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
