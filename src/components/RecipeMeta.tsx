import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import type { RecipeSummary } from '../data/recipes';
import { t } from '../i18n';
import { colors, font } from '../theme/tokens';

/** "about 45 min · Easy · Italian · Pasta" */
export function RecipeMeta({ recipe, style }: { recipe: RecipeSummary; style?: StyleProp<TextStyle> }) {
  const time =
    recipe.cook_time_min === null
      ? null
      : t(recipe.cook_time_estimated ? 'recipes.minutesEstimated' : 'recipes.minutes', { min: recipe.cook_time_min });
  const difficulty = recipe.difficulty ? t(`filters.${recipe.difficulty}`) : null;
  const parts = [time, difficulty, recipe.cuisine, recipe.category].filter(Boolean);
  return <Text style={[styles.meta, style]}>{parts.join(' · ')}</Text>;
}

const styles = StyleSheet.create({
  meta: { fontSize: font.small, color: colors.textMuted },
});
