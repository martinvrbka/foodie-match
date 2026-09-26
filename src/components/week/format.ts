import { t, type StringKey } from '../../i18n';
import type { SlotNote } from '../../logic/plan';
import { addDays, type ISODate, type Meal, type MealGroup, weekdayIndex } from '../../logic/week';

const DAY_KEYS: StringKey[] = [
  'week.days.mon',
  'week.days.tue',
  'week.days.wed',
  'week.days.thu',
  'week.days.fri',
  'week.days.sat',
  'week.days.sun',
];
const MEAL_KEYS: Record<Meal, StringKey> = {
  breakfast: 'week.meals.breakfast',
  lunch: 'week.meals.lunch',
  snack: 'week.meals.snack',
  dinner: 'week.meals.dinner',
};
const GROUP_KEYS: Record<MealGroup, StringKey> = {
  breakfast: 'week.groups.breakfast',
  main: 'week.groups.main',
  snack: 'week.groups.snack',
};
const NOTE_KEYS: Record<SlotNote, StringKey> = {
  nothing_matched: 'week.notes.nothing_matched',
  cleared: 'week.notes.cleared',
  leftover_removed: 'week.notes.leftover_removed',
  no_longer_leftover: 'week.notes.no_longer_leftover',
  partner_passed: 'week.notes.partner_passed',
  eaten_tonight: 'week.notes.eaten_tonight',
};

export const weekdayName = (d: ISODate) => t(DAY_KEYS[weekdayIndex(d)]);

/** "Mon 28/9" */
export function dayLabel(d: ISODate): string {
  const [, month, day] = d.split('-').map(Number);
  return t('week.dayLabel', { weekday: weekdayName(d), day, month });
}

/** "Mon 28/9 – Sun 4/10" */
export const rangeLabel = (firstDay: ISODate, weekStart: ISODate) =>
  t('week.range', { from: dayLabel(firstDay), to: dayLabel(addDays(weekStart, 6)) });

export const mealName = (m: Meal) => t(MEAL_KEYS[m]);
export const groupName = (g: MealGroup) => t(GROUP_KEYS[g]);
export const noteText = (n: SlotNote, name: string) => t(NOTE_KEYS[n], { name });
