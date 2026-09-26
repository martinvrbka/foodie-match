import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, font, radius, spacing } from '../theme/tokens';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'text';
  disabled?: boolean;
  busy?: boolean;
  /** Screen-reader label when the visible label is a symbol (e.g. "+"). */
  accessibilityLabel?: string;
}

export function Button({ label, onPress, variant = 'primary', disabled, busy, accessibilityLabel }: Props) {
  const primary = variant === 'primary';
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary && styles.primary,
        inactive && styles.inactive,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.onPrimary : colors.primaryStrong} />
      ) : (
        <Text style={[styles.label, { color: primary ? colors.onPrimary : colors.primaryStrong }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primaryStrong },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  label: { fontSize: font.body, fontWeight: '700' },
});
