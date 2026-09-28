import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { RecipeMeta } from '../../components/RecipeMeta';
import { useAuth } from '../../data/auth';
import { errorText } from '../../data/errors';
import { useExclusionStates } from '../../data/exclusions';
import { useRecipeSettings } from '../../data/filters';
import { isVisibleMatch, removeMatch } from '../../data/matches';
import { useProfile } from '../../data/profile';
import { getRecipe, photoUrl, type RecipeDetail } from '../../data/recipes';
import { isNoLeftovers, setLeftoversOk } from '../../data/week';
import { t } from '../../i18n';
import { displayName } from '../../logic/exclusions';
import { colors, font, radius, spacing } from '../../theme/tokens';

export default function Recipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { partner } = useProfile();
  const ex = useExclusionStates(session!.user.id, partner?.id ?? null);
  const [recipe, setRecipe] = useState<RecipeDetail | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const mySettings = useRecipeSettings();
  const hidden = mySettings.settings?.hidden.has(Number(id)) ?? false;

  const [matched, setMatched] = useState(false);
  const [removeError, setRemoveError] = useState<unknown>(null);
  // Marked "Not good for leftovers" in the week plan; undone here too.
  const [noLeftovers, setNoLeftovers] = useState(false);

  const load = useCallback(() => {
    setError(null);
    getRecipe(Number(id)).then(setRecipe, setError);
    isVisibleMatch(Number(id)).then(setMatched, () => setMatched(false));
    isNoLeftovers(Number(id)).then(setNoLeftovers, () => setNoLeftovers(false));
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

  /** "Seafood" for a line that person can't eat (the exclusion that covers it), else null. */
  const coveredBy = (states: typeof ex.mine, ingredientId: number): string | null => {
    const s = states?.get(ingredientId);
    if (!s || s.state === 'none') return null;
    return displayName(ex.names.get(s.state === 'implied' ? s.via : ingredientId) ?? '');
  };
  const excludedBy = (id: number) => coveredBy(ex.mine, id);
  const partnerExcludedBy = (id: number) => coveredBy(ex.partner, id);
  const blocked = recipe.ingredients.some((l) => excludedBy(l.ingredientId) !== null);
  const partnerBlocked = recipe.ingredients.some((l) => partnerExcludedBy(l.ingredientId) !== null);

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
          {mySettings.settings ? (
            <View style={styles.doNotEatRow}>
              {hidden ? <Text style={styles.partnerNote}>{t('filters.markedHere')}</Text> : null}
              <Button
                label={hidden ? t('filters.unmark') : t('filters.doNotEat')}
                variant="text"
                onPress={() => mySettings.setHidden(recipe.id, !hidden)}
              />
              {mySettings.saveError ? (
                <Text style={styles.excludedNote}>
                  {t('filters.saveFailed', { message: errorText(mySettings.saveError) })}
                </Text>
              ) : null}
            </View>
          ) : null}
          {blocked ? (
            <View style={styles.warning} accessibilityRole="alert">
              <Text style={styles.warningText}>{t('recipes.containsExcluded')}</Text>
            </View>
          ) : null}
          {partner && partnerBlocked ? (
            <View style={styles.partnerBadge}>
              <Text style={styles.partnerBadgeText}>{t('discover.partnerWontEat', { name: partner.display_name })}</Text>
            </View>
          ) : null}

          <Text style={styles.heading}>{t('recipes.ingredients')}</Text>
          <View style={styles.card}>
            {recipe.ingredients.map((line, i) => {
              const by = excludedBy(line.ingredientId);
              const partnerBy = partnerExcludedBy(line.ingredientId);
              return (
                <View key={i} style={[styles.line, i > 0 && styles.lineBorder]}>
                  <View style={styles.lineMain}>
                    <Text style={[styles.lineName, by !== null && styles.lineNameExcluded]}>{line.name}</Text>
                    {by !== null ? (
                      <Text style={styles.excludedNote}>{t('recipes.excludedBecause', { name: by })}</Text>
                    ) : null}
                    {partner && partnerBy !== null ? (
                      <Text style={styles.partnerNote}>
                        {t('recipes.partnerExcludedBecause', { partner: partner.display_name, name: partnerBy })}
                      </Text>
                    ) : null}
                  </View>
                  {line.detail ? <Text style={styles.lineDetail}>{line.detail}</Text> : null}
                </View>
              );
            })}
          </View>

          {matched ? (
            <View style={styles.removeRow}>
              {removeError ? <Text style={styles.excludedNote}>{errorText(removeError)}</Text> : null}
              <Button
                label={t('matches.remove')}
                variant="text"
                onPress={() =>
                  Alert.alert(t('matches.removeTitle', { title: recipe.title }), t('matches.removeBody'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('matches.remove'),
                      style: 'destructive',
                      onPress: () => {
                        setRemoveError(null);
                        removeMatch(recipe.id).then(() => setMatched(false), setRemoveError);
                      },
                    },
                  ])
                }
              />
              {noLeftovers ? (
                <Button
                  label={t('week.goodLeftoversAgain')}
                  variant="text"
                  onPress={() => {
                    setRemoveError(null);
                    setLeftoversOk(recipe.id, true).then(() => setNoLeftovers(false), setRemoveError);
                  }}
                />
              ) : null}
            </View>
          ) : null}

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
  removeRow: { alignItems: 'flex-start', marginTop: spacing.sm },
  doNotEatRow: { alignItems: 'flex-start' },
  partnerBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  partnerBadgeText: { fontSize: font.small, fontWeight: '700', color: colors.onAccent },
  partnerNote: { fontSize: font.small, fontWeight: '600', color: colors.textMuted },
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
