import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { RecipeMeta } from '../../components/RecipeMeta';
import { errorText } from '../../data/errors';
import { getRecipe, photoUrl, type RecipeDetail } from '../../data/recipes';
import { t } from '../../i18n';
import { colors, font, radius, spacing } from '../../theme/tokens';

export default function Recipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
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

          <Text style={styles.heading}>{t('recipes.ingredients')}</Text>
          <View style={styles.card}>
            {recipe.ingredients.map((line, i) => (
              <Text key={i} style={styles.body}>
                • {line}
              </Text>
            ))}
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
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
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
