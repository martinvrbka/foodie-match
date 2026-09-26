import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, font, radius, spacing } from '../theme/tokens';

interface Props {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Shows a trailing ✕ (for removable chips). */
  removable?: boolean;
  accessibilityLabel?: string;
}

export function Chip({ label, selected, onPress, removable, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole={removable ? 'button' : 'switch'}
      accessibilityState={removable ? undefined : { checked: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed]}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]}>
        {label}
        {removable ? '  ✕' : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  pressed: { opacity: 0.8 },
  label: { fontSize: font.small, fontWeight: '600', color: colors.text },
  selectedLabel: { color: colors.onPrimary },
});
