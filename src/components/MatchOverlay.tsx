import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMatchCelebration } from '../data/matches';
import { useProfile } from '../data/profile';
import { photoUrl } from '../data/recipes';
import { t } from '../i18n';
import { colors, font, radius, spacing } from '../theme/tokens';
import { Button } from './Button';

/** Full-screen "It's a match!" over whatever screen is open. */
export function MatchOverlay() {
  const { current, dismiss } = useMatchCelebration();
  const { partner } = useProfile();
  useEffect(() => {
    if (current) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [current]);
  if (!current) return null;
  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <Text style={styles.title} accessibilityRole="header">
        {t('discover.matchTitle')}
      </Text>
      <Image source={photoUrl(current.image_url, 'medium')} style={styles.photo} contentFit="cover" />
      <Text style={styles.recipe}>{current.title}</Text>
      <Text style={styles.body}>
        {partner ? t('discover.matchBody', { name: partner.display_name }) : t('discover.matchBodyNoName')}
      </Text>
      <Button
        label={t('discover.viewRecipe')}
        onPress={() => {
          dismiss();
          router.push({ pathname: '/recipe/[id]', params: { id: String(current.id) } });
        }}
      />
      <Pressable accessibilityRole="button" onPress={dismiss} style={styles.keep}>
        <Text style={styles.keepText}>{t('discover.keepSwiping')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  title: { fontSize: 40, fontWeight: '900', color: colors.onAccent },
  photo: { width: 220, height: 220, borderRadius: radius.lg, backgroundColor: colors.border },
  recipe: { fontSize: font.title, fontWeight: '800', color: colors.onAccent, textAlign: 'center' },
  body: { fontSize: font.body, color: colors.onAccent },
  keep: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.lg },
  keepText: { fontSize: font.body, fontWeight: '700', color: colors.onAccent },
});
