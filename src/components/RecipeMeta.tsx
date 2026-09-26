import { StyleSheet, Text } from 'react-native';
import type { RecipeSummary } from '../data/recipes';
import { t } from '../i18n';
import { colors, font } from '../theme/tokens';

/** "about 45 min · Italian · Pasta" */
export function RecipeMeta({ recipe }: { recipe: RecipeSummary }) {
  const time =
    recipe.cook_time_min === null
      ? null
      : t(recipe.cook_time_estimated ? 'recipes.minutesEstimated' : 'recipes.minutes', { min: recipe.cook_time_min });
  const parts = [time, recipe.cuisine, recipe.category].filter(Boolean);
  return <Text style={styles.meta}>{parts.join(' · ')}</Text>;
}

const styles = StyleSheet.create({
  meta: { fontSize: font.small, color: colors.textMuted },
});
