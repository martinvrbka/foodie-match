import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cachedRecipes } from '../data/discover';
import { errorText } from '../data/errors';
import { toFilterable, useRecipeSettings } from '../data/filters';
import { useProfile } from '../data/profile';
import type { RecipeSummary } from '../data/recipes';
import { t } from '../i18n';
import { activeFilterCount, filterOptions } from '../logic/filters';
import { colors, font, radius, spacing } from '../theme/tokens';
import { Button } from './Button';
import { FilterPanel } from './FilterPanel';

/** "Filters" / "Filters (2)": opens the filter panel over the current screen. */
export function FiltersButton({ onPress, variant = 'text' }: { onPress: () => void; variant?: 'text' | 'primary' }) {
  const { settings } = useRecipeSettings();
  const count = settings ? activeFilterCount(settings.filters) : 0;
  return (
    <Button
      label={count > 0 ? t('filters.buttonCount', { count }) : t('filters.button')}
      variant={variant}
      onPress={onPress}
    />
  );
}

/**
 * One panel for Swipe and Recipes. A change applies right away (no confirm button),
 * for both partners when paired; closing returns to the screen it was opened from.
 */
export function FilterSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { settings, saveError, setFilters } = useRecipeSettings();
  const { partner } = useProfile();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  useEffect(() => {
    if (visible) cachedRecipes().then(setRecipes, () => {});
  }, [visible]);
  const options = useMemo(() => filterOptions(recipes.map(toFilterable)), [recipes]);

  const go = (path: '/do-not-eat' | '/exclusions') => {
    onClose();
    router.push(path);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('filters.close')} />
      <SafeAreaView style={styles.sheet} edges={['bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {t('filters.title')}
          </Text>
          <Button label={t('filters.close')} variant="text" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {partner ? <Text style={styles.note}>{t('filters.shared', { name: partner.display_name })}</Text> : null}
          {saveError ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {t('filters.saveFailed', { message: errorText(saveError) })}
            </Text>
          ) : null}
          {settings ? <FilterPanel filters={settings.filters} options={options} onChange={setFilters} /> : null}
          <View style={styles.links}>
            <Button
              label={t('filters.listLink', { count: settings?.hidden.size ?? 0 })}
              variant="text"
              onPress={() => go('/do-not-eat')}
            />
            <Button label={t('exclusions.title')} variant="text" onPress={() => go('/exclusions')} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, opacity: 0.4 },
  sheet: {
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingTop: spacing.sm,
  },
  title: { fontSize: font.title, fontWeight: '800', color: colors.text },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  note: { fontSize: font.small, fontWeight: '600', color: colors.text },
  error: { fontSize: font.body, fontWeight: '600', color: colors.primaryStrong },
  links: { alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.sm },
});
