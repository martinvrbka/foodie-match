import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ingredientMap from '../../data/ingredient-map.json';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { TextField } from '../components/TextField';
import { useAuth } from '../data/auth';
import { errorText } from '../data/errors';
import { useExclusions } from '../data/exclusions';
import { setOnboarded } from '../data/profile';
import { t } from '../i18n';
import {
  displayName,
  exclusionStates,
  isPresetActive,
  PRESETS,
  searchIngredients,
} from '../logic/exclusions';
import type { IngredientMap } from '../logic/ingredients';
import { colors, font, radius, spacing } from '../theme/tokens';

const map = ingredientMap as unknown as IngredientMap;

export default function Exclusions() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const firstRun = onboarding === '1';
  const { session } = useAuth();
  const userId = session!.user.id;
  const ex = useExclusions(userId);
  const [query, setQuery] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<unknown>(null);

  const byId = useMemo(() => new Map((ex.ingredients ?? []).map((i) => [i.id, i])), [ex.ingredients]);
  const states = useMemo(() => exclusionStates(ex.ingredients ?? [], ex.explicit), [ex.ingredients, ex.explicit]);
  const sections = useMemo(() => searchIngredients(ex.ingredients ?? [], query, map), [ex.ingredients, query]);
  const selected = useMemo(
    () =>
      [...ex.explicit]
        .map((id) => byId.get(id))
        .filter((i) => i !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [ex.explicit, byId],
  );

  const finish = async () => {
    if (!firstRun) return router.back();
    setFinishing(true);
    setFinishError(null);
    try {
      await setOnboarded(userId);
      router.replace('/');
    } catch (e) {
      setFinishError(e);
      setFinishing(false);
    }
  };

  if (ex.loadError || !ex.ingredients) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        {ex.loadError ? (
          <>
            <Text style={styles.body}>{errorText(ex.loadError)}</Text>
            <Button label={t('common.retry')} onPress={ex.reload} />
          </>
        ) : (
          <ActivityIndicator color={colors.primaryStrong} />
        )}
      </SafeAreaView>
    );
  }

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>{t(firstRun ? 'exclusions.onboardingTitle' : 'exclusions.title')}</Text>
      <Text style={styles.muted}>{t('exclusions.intro')}</Text>

      <Text style={styles.subheading}>{t('exclusions.presets')}</Text>
      <View style={styles.wrap}>
        {PRESETS.map((p) => (
          <Chip
            key={p.key}
            label={t(`presets.${p.key}`)}
            selected={isPresetActive(p.key, ex.ingredients!, ex.explicit)}
            onPress={() => ex.applyPreset(p.key)}
          />
        ))}
      </View>

      <Text style={styles.subheading}>
        {selected.length ? t('exclusions.selected', { count: selected.length }) : t('exclusions.selectedNone')}
      </Text>
      {selected.length > 0 ? (
        <View style={styles.wrap}>
          {selected.map((i) => (
            <Chip
              key={i.id}
              label={displayName(i.name)}
              selected
              removable
              accessibilityLabel={t('exclusions.removeChip', { name: displayName(i.name) })}
              onPress={() => ex.remove(i.id)}
            />
          ))}
        </View>
      ) : null}

      {ex.saveError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorText(ex.saveError)}
        </Text>
      ) : null}

      <View style={styles.search}>
        <TextField
          label={t('exclusions.search')}
          placeholder={t('exclusions.searchPlaceholder')}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      {sections.length === 0 ? <Text style={styles.muted}>{t('exclusions.noResults', { query })}</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <SectionList
        sections={sections}
        keyExtractor={(i) => String(i.id)}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        initialNumToRender={30}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{t(`categories.${section.category}`)}</Text>
        )}
        renderItem={({ item }) => {
          const s = states.get(item.id) ?? { state: 'none' };
          const excluded = s.state !== 'none';
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: excluded, disabled: s.state === 'implied' }}
              disabled={s.state === 'implied'}
              onPress={() => ex.toggle(item.id)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.rowText}>
                <Text style={styles.body}>{displayName(item.name)}</Text>
                {s.state === 'implied' ? (
                  <Text style={styles.muted}>
                    {t('exclusions.via', { name: displayName(byId.get(s.via)?.name ?? '') })}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.box, excluded && styles.boxOn, s.state === 'implied' && styles.boxImplied]}>
                {excluded ? <Text style={styles.check}>✓</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
      <View style={styles.footer}>
        {finishError ? <Text style={styles.error}>{errorText(finishError)}</Text> : null}
        <Button
          label={t(firstRun ? 'exclusions.continue' : 'exclusions.done')}
          onPress={finish}
          busy={finishing}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  header: { gap: spacing.sm, paddingTop: spacing.md },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  subheading: { fontSize: font.body, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  search: { marginTop: spacing.md },
  sectionHeader: {
    fontSize: font.small,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
  rowText: { flex: 1, gap: 2 },
  box: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  boxImplied: { opacity: 0.5 },
  check: { color: colors.onPrimary, fontWeight: '800', fontSize: font.body },
  body: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.small, color: colors.textMuted },
  error: { fontSize: font.body, fontWeight: '600', color: colors.primaryStrong },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
