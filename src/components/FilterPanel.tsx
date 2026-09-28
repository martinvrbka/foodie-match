import { StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import { MAX_TIME_OPTIONS, NO_FILTERS, type RecipeFilters, toggleValue } from '../logic/filters';
import type { Difficulty } from '../logic/recipes';
import { colors, font, spacing } from '../theme/tokens';
import { Button } from './Button';
import { Chip } from './Chip';

interface Props {
  filters: RecipeFilters;
  /** Only values recipes actually have (filterOptions). */
  options: { difficulties: Difficulty[]; cuisines: string[] };
  onChange: (f: RecipeFilters) => void;
}

/** Max time (single choice), difficulty and cuisine (several). "Clear filters" keeps "Do not eat" marks. */
export function FilterPanel({ filters, options, onChange }: Props) {
  return (
    <View style={styles.panel}>
      <Text style={styles.note}>{t('filters.alsoMatching')}</Text>

      <Text style={styles.heading}>{t('filters.maxTime')}</Text>
      <View style={styles.chips}>
        <Chip
          label={t('filters.any')}
          selected={filters.maxMinutes === null}
          onPress={() => onChange({ ...filters, maxMinutes: null })}
        />
        {MAX_TIME_OPTIONS.map((min) => (
          <Chip
            key={min}
            label={t('filters.minutes', { min })}
            selected={filters.maxMinutes === min}
            onPress={() => onChange({ ...filters, maxMinutes: filters.maxMinutes === min ? null : min })}
          />
        ))}
      </View>

      {options.difficulties.length > 0 ? (
        <>
          <Text style={styles.heading}>{t('filters.difficulty')}</Text>
          <View style={styles.chips}>
            {options.difficulties.map((d) => (
              <Chip
                key={d}
                label={t(`filters.${d}`)}
                selected={filters.difficulties.includes(d)}
                onPress={() => onChange({ ...filters, difficulties: toggleValue(filters.difficulties, d) })}
              />
            ))}
          </View>
        </>
      ) : null}

      {options.cuisines.length > 0 ? (
        <>
          <Text style={styles.heading}>{t('filters.cuisine')}</Text>
          <View style={styles.chips}>
            {options.cuisines.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={filters.cuisines.includes(c)}
                onPress={() => onChange({ ...filters, cuisines: toggleValue(filters.cuisines, c) })}
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.clear}>
        <Button label={t('filters.clear')} variant="text" onPress={() => onChange(NO_FILTERS)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.sm, paddingTop: spacing.sm },
  note: { fontSize: font.small, fontWeight: '600', color: colors.textMuted },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  clear: { alignItems: 'flex-start' },
});
