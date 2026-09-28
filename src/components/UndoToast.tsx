import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import { colors, font, radius, spacing } from '../theme/tokens';

/** How long "Undo" is offered (DECISIONS.md, open question DL-018). */
export const UNDO_MS = 5000;

interface Props {
  message: string;
  onUndo: () => void;
  /** Called when the time is up; the parent then stops rendering the toast. */
  onTimeout: () => void;
}

/** A bar at the bottom of the screen with an Undo button, gone after UNDO_MS. */
export function UndoToast({ message, onUndo, onTimeout }: Props) {
  useEffect(() => {
    const timer = setTimeout(onTimeout, UNDO_MS);
    return () => clearTimeout(timer);
  }, [message, onTimeout]);

  return (
    <View style={styles.toast} accessibilityLiveRegion="polite">
      <Text style={styles.message}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={8} style={styles.action}>
        <Text style={styles.actionLabel}>{t('filters.undo')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.toast,
  },
  message: { flex: 1, fontSize: font.body, color: colors.onToast },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  actionLabel: { fontSize: font.body, fontWeight: '800', color: colors.toastAction },
});
