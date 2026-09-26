import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { RecipeMeta } from '../../components/RecipeMeta';
import { useAuth } from '../../data/auth';
import { errorText } from '../../data/errors';
import { useMyExclusionStates } from '../../data/exclusions';
import { getRecipe, photoUrl, type RecipeDetail } from '../../data/recipes';
import { t } from '../../i18n';
import { displayName } from '../../logic/exclusions';
import { colors, font, radius, spacing } from '../../theme/tokens';

export default function Recipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const mine = useMyExclusionStates(session!.user.id);
  const [recipe, setRecipe] = useState<RecipeDetail | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    getRecipe(Number(id)).then(setRecipe, setError);
  }, [id]);
  useEffect(load, [load]);

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('recipes.back')}
      onPress={() => router.back()}
      style={[styles.back, { top: insets.top + spacing.sm }]}
    >
      <Text style={styles.backLabel}>‹ {t('recipes.back')}</Text>
    </Pressable>
  );

  if (error || recipe === null) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.body}>{error ? errorText(error) : t('recipes.notFound')}</Text>
        {error ? <Button label={t('common.retry')} onPress={load} /> : null}
        {back}
      </View>
    );
  }
  if (recipe === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primaryStrong} />
      </View>
    );
  }

  /** "Seafood" for a line I can't eat (the exclusion that covers it), else null. */
  const excludedBy = (ingredientId: number): string | null => {
    const s = mine.states?.get(ingredientId);
    if (!s || s.state === 'none') return null;
    return displayName(mine.names.get(s.state === 'implied' ? s.via : ingredientId) ?? '');
  };
  const blocked = recipe.ingredients.some((l) => excludedBy(l.ingredientId) !== null);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
        <Image
          source={photoUrl(recipe.image_url, 'full')}
          placeholder={photoUrl(recipe.image_url, 'small')}
          style={styles.photo}
          contentFit="cover"
          transition={200}
          accessibilityLabel={t('recipes.photo', { title: recipe.title })}
        />
        <View style={styles.content}>
          <Text style={styles.title}>{recipe.title}</Text>
          <RecipeMeta recipe={recipe} />
          {blocked ? (
            <View style={styles.warning} accessibilityRole="alert">
              <Text style={styles.warningText}>{t('recipes.containsExcluded')}</Text>
            </View>
          ) : null}

          <Text style={styles.heading}>{t('recipes.ingredients')}</Text>
          <View style={styles.card}>
            {recipe.ingredients.map((line, i) => {
              const by = excludedBy(line.ingredientId);
              return (
                <View key={i} style={[styles.line, i > 0 && styles.lineBorder]}>
                  <View style={styles.lineMain}>
                    <Text style={[styles.lineName, by !== null && styles.lineNameExcluded]}>{line.name}</Text>
                    {by !== null ? (
                      <Text style={styles.excludedNote}>{t('recipes.excludedBecause', { name: by })}</Text>
                    ) : null}
                  </View>
                  {line.detail ? <Text style={styles.lineDetail}>{line.detail}</Text> : null}
                </View>
              );
            })}
          </View>

          <Text style={styles.heading}>{t('recipes.steps')}</Text>
          {recipe.instructions.map((step, i) => (
            <View key={i} style={styles.step}>
              <Text style={styles.stepNumber}>{i + 1}</Text>
              <Text style={[styles.body, styles.stepText]}>{step}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      {back}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  photo: { width: '100%', aspectRatio: 1, backgroundColor: colors.border },
  back: {
    position: 'absolute',
    left: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  backLabel: { fontSize: font.body, fontWeight: '700', color: colors.text },
  content: { padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  heading: { fontSize: font.title, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  lineBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  lineMain: { flex: 1, gap: 2 },
  lineName: { fontSize: font.body, fontWeight: '600', color: colors.text },
  lineNameExcluded: { color: colors.primaryStrong },
  excludedNote: { fontSize: font.small, fontWeight: '600', color: colors.primaryStrong },
  lineDetail: { fontSize: font.body, color: colors.textMuted, textAlign: 'right', flexShrink: 1, maxWidth: '45%' },
  warning: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.primaryStrong,
    backgroundColor: colors.surface,
  },
  warningText: { fontSize: font.body, fontWeight: '700', color: colors.primaryStrong },
  body: { fontSize: font.body, color: colors.text, lineHeight: 24 },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNumber: {
    fontSize: font.largeBold,
    fontWeight: '800',
    color: colors.primaryStrong,
    minWidth: 24,
  },
  stepText: { flex: 1 },
});
