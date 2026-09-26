import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { t } from '../../i18n';
import type { Availability } from '../../logic/plan';
import { colors, font, radius, spacing } from '../../theme/tokens';
import { Button } from '../Button';
import { groupName } from './format';

interface Props {
  lines: Availability[];
  candidateCount: number;
  partnerName: string;
  partnerDone: boolean;
  onGenerate: () => void;
  busy: boolean;
}

/** After re-swiping: dishes per slot type, which types are short, and Generate. */
export function AvailabilityPanel({ lines, candidateCount, partnerName, partnerDone, onGenerate, busy }: Props) {
  const anyShort = lines.some((l) => l.short);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('week.availabilityTitle')}</Text>
      {candidateCount === 0 ? (
        <>
          <Text style={styles.body} accessibilityRole="alert">
            {t('week.needMatches')}
          </Text>
          <Button label={t('week.swipeMore')} onPress={() => router.push('/discover')} />
        </>
      ) : (
        <>
          {lines.map((l) => (
            <View key={l.group} style={styles.line}>
              <Text style={styles.lineText}>
                {t('week.availLine', {
                  label: groupName(l.group),
                  count: l.dishes,
                  dishes: l.dishes === 1 ? t('week.dishOne') : t('week.dishMany'),
                  slots: l.slots,
                })}
              </Text>
              {l.short ? <Text style={styles.short}>{t('week.short')}</Text> : null}
            </View>
          ))}
          {anyShort ? (
            <>
              <Text style={styles.muted}>{t('week.shortHint')}</Text>
              <Button label={t('week.swipeMore')} variant="text" onPress={() => router.push('/discover')} />
            </>
          ) : null}
          <Text style={styles.muted}>
            {partnerDone ? t('week.partnerDone', { name: partnerName }) : t('week.partnerChoosing', { name: partnerName })}
          </Text>
          <Button label={t('week.generate')} onPress={onGenerate} busy={busy} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  body: { fontSize: font.body, fontWeight: '700', color: colors.text },
  muted: { fontSize: font.small, color: colors.textMuted },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  lineText: { flex: 1, fontSize: font.body, color: colors.text },
  short: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.accent,
    color: colors.onAccent,
    fontSize: font.small,
    fontWeight: '700',
  },
});
