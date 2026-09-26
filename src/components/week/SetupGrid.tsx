import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Slot, WeekPlan } from '../../data/week';
import { t } from '../../i18n';
import { slotKey } from '../../logic/plan';
import { MAX_LEFTOVERS, type Meal, MEALS, planDays } from '../../logic/week';
import { colors, font, radius, spacing } from '../../theme/tokens';
import { Button } from '../Button';
import { dayLabel, mealName } from './format';

interface Props {
  plan: WeekPlan;
  slots: Slot[];
  notice: string | null;
  onCells: (cells: { day: string; meal: Meal }[]) => void;
  onLeftovers: (n: number) => void;
  onBegin: () => void;
  busy: boolean;
}

/** Days × meals to plan (lunch and dinner on by default) and the leftover setting. */
export function SetupGrid({ plan, slots, notice, onCells, onLeftovers, onBegin, busy }: Props) {
  const days = planDays(plan.firstDay);
  const on = new Set(slots.map(slotKey));
  const cells = () => slots.map((s) => ({ day: s.day, meal: s.meal }));

  const toggleCell = (day: string, meal: Meal) =>
    onCells(on.has(slotKey({ day, meal })) ? cells().filter((c) => !(c.day === day && c.meal === meal)) : [...cells(), { day, meal }]);
  const toggleMeal = (meal: Meal) => {
    const allOn = days.every((day) => on.has(slotKey({ day, meal })));
    const others = cells().filter((c) => c.meal !== meal);
    onCells(allOn ? others : [...others, ...days.map((day) => ({ day, meal }))]);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {notice ? (
        <Text style={styles.notice} accessibilityRole="alert">
          {notice}
        </Text>
      ) : null}
      <Text style={styles.title}>{t('week.setupTitle')}</Text>
      <Text style={styles.muted}>{t('week.setupHint')}</Text>

      <View style={styles.row}>
        <View style={styles.dayCol} />
        {MEALS.map((meal) => (
          <Pressable key={meal} accessibilityRole="button" onPress={() => toggleMeal(meal)} style={styles.head} hitSlop={4}>
            <Text style={styles.headText} numberOfLines={1}>
              {mealName(meal)}
            </Text>
          </Pressable>
        ))}
      </View>
      {days.map((day) => (
        <View key={day} style={styles.row}>
          <Text style={[styles.dayCol, styles.dayText]}>{dayLabel(day)}</Text>
          {MEALS.map((meal) => {
            const active = on.has(slotKey({ day, meal }));
            return (
              <Pressable
                key={meal}
                accessibilityRole="switch"
                accessibilityState={{ checked: active }}
                accessibilityLabel={t('week.cellLabel', { meal: mealName(meal), day: dayLabel(day) })}
                onPress={() => toggleCell(day, meal)}
                style={[styles.cell, active && styles.cellOn]}
              >
                <Text style={[styles.cellText, active && styles.cellTextOn]}>{active ? '✓' : ''}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={styles.muted}>{t('week.slotCount', { count: slots.length })}</Text>

      <Text style={styles.label}>{t('week.leftovers')}</Text>
      <View style={styles.stepper}>
        <Button
          label="−"
          variant="text"
          accessibilityLabel={t('week.fewer')}
          onPress={() => onLeftovers(plan.leftovers - 1)}
          disabled={plan.leftovers <= 0}
        />
        <Text style={styles.count} accessibilityLabel={`${t('week.leftovers')}: ${plan.leftovers}`}>
          {plan.leftovers}
        </Text>
        <Button
          label="+"
          variant="text"
          accessibilityLabel={t('week.more')}
          onPress={() => onLeftovers(plan.leftovers + 1)}
          disabled={plan.leftovers >= MAX_LEFTOVERS}
        />
      </View>
      <Text style={styles.muted}>{t('week.leftoversHint')}</Text>

      <Button label={t('week.chooseDishes')} onPress={onBegin} disabled={slots.length === 0} busy={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.small, color: colors.textMuted },
  notice: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.accent,
    color: colors.onAccent,
    fontSize: font.body,
    fontWeight: '700',
  },
  label: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dayCol: { width: 72 },
  dayText: { fontSize: font.small, fontWeight: '700', color: colors.text },
  head: { flex: 1, minHeight: 40, justifyContent: 'center', alignItems: 'center' },
  headText: { fontSize: font.small, fontWeight: '700', color: colors.primaryStrong },
  cell: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellOn: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  cellText: { fontSize: font.body, fontWeight: '800', color: colors.text },
  cellTextOn: { color: colors.onPrimary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  count: { fontSize: font.title, fontWeight: '800', color: colors.text, minWidth: 32, textAlign: 'center' },
});
