import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { photoUrl, type RecipeSummary } from '../data/recipes';
import { colors, font, radius, spacing } from '../theme/tokens';
import { RecipeMeta } from './RecipeMeta';

interface Props {
  recipe: RecipeSummary;
  onPress: () => void;
  /** Shown on the right (a rank number, a tick…). */
  trailing?: ReactNode;
  selected?: boolean;
  accessibilityRole?: 'button' | 'checkbox';
  checked?: boolean;
}

/** Photo, title and meta in one tappable row. */
export function RecipeRow({ recipe, onPress, trailing, selected, accessibilityRole = 'button', checked }: Props) {
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === 'checkbox' ? { checked: !!checked } : undefined}
      accessibilityLabel={recipe.title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.selected, pressed && styles.pressed]}
    >
      <Image source={photoUrl(recipe.image_url, 'small')} style={styles.thumb} contentFit="cover" transition={150} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {recipe.title}
        </Text>
        <RecipeMeta recipe={recipe} />
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.primaryStrong },
  pressed: { opacity: 0.8 },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.border },
  text: { flex: 1, gap: spacing.xs },
  title: { fontSize: font.body, fontWeight: '700', color: colors.text },
});
