import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorText } from '../../data/errors';
import { photoUrl, type RecipeSummary } from '../../data/recipes';
import type { Slot, WeekPlan } from '../../data/week';
import { t } from '../../i18n';
import {
  clearSlot,
  dropLeftoversOf,
  type EditContext,
  type EditError,
  type EditResult,
  leftoverPairs,
  moveSlot,
  type PlanSlot,
  prepSchedule,
  setLocked,
  type SlotKey,
  slotKey,
  swapSlot,
} from '../../logic/plan';
import { colors, font, radius, spacing } from '../../theme/tokens';
import { Button } from '../Button';
import { RecipeRow } from '../RecipeRow';
import { dayLabel, mealName, noteText, rangeLabel, weekdayName } from './format';

interface Props {
  plan: WeekPlan;
  slots: Slot[];
  recipes: Map<number, RecipeSummary>;
  /** All our visible matches (Swap may use any of them). */
  matches: RecipeSummary[];
  ctx: EditContext;
  userId: string;
  names: Map<string, string>;
  /** "Changed by" markers are shown for partner changes after this; undefined = not known yet. */
  markersSince: string | null | undefined;
  /** Notices at the top ("Accepted by …"). */
  banners: string[];
  onSave: (after: PlanSlot[]) => Promise<unknown>;
  /** Marks a dish (not) good for leftovers; `after` = slots to save with it, if any. */
  onLeftoversOk: (recipeId: number, ok: boolean, after: PlanSlot[] | null) => Promise<unknown>;
  onAccept: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
  busy: boolean;
}

/** The week's calendar: every slot with its dish, tap for actions; prep schedule below. */
export function Calendar(props: Props) {
  const { plan, slots, recipes, matches, ctx, userId, names, markersSince, banners, busy } = props;
  const [selected, setSelected] = useState<SlotKey | null>(null);
  const [moving, setMoving] = useState<SlotKey | null>(null);
  const [swapping, setSwapping] = useState<SlotKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const title = (id: number | null) => (id === null ? '' : (recipes.get(id)?.title ?? ''));
  const pairs = leftoverPairs(slots);
  const cookOf = new Map(pairs.map((p) => [slotKey(p.leftover), p.cook]));
  const cooks = new Set(pairs.map((p) => slotKey(p.cook)));
  const days = [...new Set(slots.map((s) => s.day))].sort();

  const errorMessage = (e: EditError, recipeId: number | null) =>
    ({
      already_planned: t('week.alreadyPlanned', { title: title(recipeId) }),
      leftover_timing: t('week.leftoverTiming'),
      past_day: t('week.pastDay'),
      locked: t('week.lockedError'),
    })[e];

  const apply = (result: EditResult, recipeId: number | null) => {
    setMoving(null);
    setSwapping(null);
    if (!result.ok) {
      setMessage(errorMessage(result.error, recipeId));
      return;
    }
    setMessage(null);
    setSelected(null);
    props.onSave(result.slots).catch((e) => setMessage(errorText(e)));
  };

  const tapSlot = (s: Slot) => {
    const key = slotKey(s);
    if (moving && moving !== key) {
      const from = slots.find((x) => slotKey(x) === moving)!;
      apply(moveSlot(slots, moving, key, ctx), from.recipeId);
      return;
    }
    setMoving(null);
    setSelected(selected === key ? null : key);
  };

  const markLeftovers = (recipeId: number, ok: boolean) => {
    setSelected(null);
    const noLeft = new Set(ctx.noLeftovers);
    if (ok) noLeft.delete(recipeId);
    else noLeft.add(recipeId);
    const after = ok ? null : dropLeftoversOf(slots, recipeId, { ...ctx, noLeftovers: noLeft });
    props.onLeftoversOk(recipeId, ok, after).catch((e) => setMessage(errorText(e)));
  };

  const confirmDelete = () =>
    Alert.alert(t('week.deleteTitle', { range: rangeLabel(plan.firstDay, plan.weekStart) }), t('week.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('week.delete'), style: 'destructive', onPress: props.onDelete },
    ]);

  const movingSlot = moving ? slots.find((s) => slotKey(s) === moving) : null;

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        {banners.map((b) => (
          <Text key={b} style={styles.banner} accessibilityRole="alert">
            {b}
          </Text>
        ))}
        {message ? (
          <Text style={styles.error} accessibilityRole="alert">
            {message}
          </Text>
        ) : null}
        {movingSlot ? (
          <View style={styles.moveBar}>
            <Text style={styles.moveText}>{t('week.moveHint', { title: title(movingSlot.recipeId) })}</Text>
            <Button label={t('common.cancel')} variant="text" onPress={() => setMoving(null)} />
          </View>
        ) : null}

        {days.map((day) => {
          const past = day < ctx.today;
          return (
            <View key={day} style={styles.day}>
              <Text style={[styles.dayTitle, past && styles.past]}>
                {dayLabel(day)}
                {past ? ` · ${t('week.readOnly')}` : ''}
              </Text>
              {slots
                .filter((s) => s.day === day)
                .map((s) => {
                  const key = slotKey(s);
                  const recipe = s.recipeId === null ? null : recipes.get(s.recipeId);
                  const cook = cookOf.get(key);
                  const partnerChange =
                    markersSince !== undefined &&
                    s.changedBy !== null &&
                    s.changedBy !== userId &&
                    (markersSince === null || Date.parse(s.changedAt ?? '') > Date.parse(markersSince));
                  const open = selected === key && !moving;
                  return (
                    <View key={key}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${mealName(s.meal)}: ${recipe?.title ?? t('week.notes.cleared')}`}
                        onPress={() => tapSlot(s)}
                        style={({ pressed }) => [
                          styles.slot,
                          open && styles.slotOpen,
                          moving === key && styles.slotOpen,
                          past && styles.slotPast,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.meal}>{mealName(s.meal)}</Text>
                        {recipe ? (
                          <Image source={photoUrl(recipe.image_url, 'small')} style={styles.thumb} contentFit="cover" />
                        ) : null}
                        <View style={styles.slotText}>
                          {recipe ? (
                            <Text style={styles.dish} numberOfLines={2}>
                              {recipe.title}
                            </Text>
                          ) : (
                            <Text style={styles.note}>
                              {noteText(s.note ?? 'nothing_matched', names.get(s.changedBy ?? '') ?? '')}
                            </Text>
                          )}
                          <View style={styles.tags}>
                            {cook ? (
                              <Text style={[styles.tag, styles.tagLeftover]}>
                                {t('week.leftoverOf', { day: weekdayName(cook.day) })}
                              </Text>
                            ) : null}
                            {cooks.has(key) ? (
                              <Text style={[styles.tag, styles.tagLeftover]}>{t('week.cookDouble')}</Text>
                            ) : null}
                            {s.locked ? <Text style={styles.tag}>🔒 {t('week.locked')}</Text> : null}
                            {recipe && s.note === 'no_longer_leftover' ? (
                              <Text style={styles.tagNote}>{noteText(s.note, '')}</Text>
                            ) : null}
                            {partnerChange ? (
                              <Text style={[styles.tag, styles.tagChanged]}>
                                {t('week.changedBy', { name: names.get(s.changedBy!) ?? '' })}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </Pressable>
                      {open ? (
                        <View style={styles.actions}>
                          {s.recipeId !== null ? (
                            <Button
                              label={t('week.openRecipe')}
                              variant="text"
                              onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: String(s.recipeId) } })}
                            />
                          ) : null}
                          {!past && !s.locked ? (
                            <>
                              <Button label={t('week.swap')} variant="text" onPress={() => setSwapping(key)} />
                              {s.recipeId !== null ? (
                                <>
                                  <Button label={t('week.move')} variant="text" onPress={() => setMoving(key)} />
                                  <Button label={t('week.clear')} variant="text" onPress={() => apply(clearSlot(slots, key, ctx), s.recipeId)} />
                                </>
                              ) : null}
                            </>
                          ) : null}
                          {!past ? (
                            <Button
                              label={s.locked ? t('week.unlock') : t('week.lock')}
                              variant="text"
                              onPress={() => apply(setLocked(slots, key, !s.locked, ctx), s.recipeId)}
                            />
                          ) : null}
                          {s.recipeId !== null && !past ? (
                            ctx.noLeftovers.has(s.recipeId) ? (
                              <Button
                                label={t('week.goodLeftoversAgain')}
                                variant="text"
                                onPress={() => markLeftovers(s.recipeId!, true)}
                              />
                            ) : (
                              <Button
                                label={t('week.notGoodLeftovers')}
                                variant="text"
                                onPress={() => markLeftovers(s.recipeId!, false)}
                              />
                            )
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>{t('week.prepTitle')}</Text>
        {pairs.length === 0 ? <Text style={styles.muted}>{t('week.prepEmpty')}</Text> : null}
        {prepSchedule(slots).map((p) => (
          <View key={slotKey(p.cook)} style={styles.prep}>
            <Text style={styles.prepTitle}>{t('week.prepEntry', { day: dayLabel(p.cook.day) })}</Text>
            <Text style={styles.body}>
              {t('week.prepDetail', {
                title: title(p.recipeId),
                cookMeal: mealName(p.cook.meal).toLowerCase(),
                leftoverDay: weekdayName(p.leftover.day),
                leftoverMeal: mealName(p.leftover.meal).toLowerCase(),
              })}
            </Text>
          </View>
        ))}

        <View style={styles.buttons}>
          {plan.status === 'generated' ? <Button label={t('week.accept')} onPress={props.onAccept} busy={busy} /> : null}
          <Button label={t('week.regenerate')} variant="text" onPress={props.onRegenerate} disabled={busy} />
          <Text style={[styles.muted, styles.centerText]}>{t('week.regenerateHint')}</Text>
          <Button label={t('week.delete')} variant="text" onPress={confirmDelete} disabled={busy} />
        </View>
      </ScrollView>

      <Modal visible={swapping !== null} animationType="slide" onRequestClose={() => setSwapping(null)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.sectionTitle}>{t('week.swapTitle')}</Text>
            <Button label={t('common.cancel')} variant="text" onPress={() => setSwapping(null)} />
          </View>
          <Text style={[styles.muted, styles.modalHint]}>{t('week.swapHint')}</Text>
          <FlatList
            data={[...matches].sort((a, b) => a.title.localeCompare(b.title))}
            keyExtractor={(r) => String(r.id)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.muted}>{t('week.swapEmpty')}</Text>}
            renderItem={({ item }) => (
              <RecipeRow recipe={item} onPress={() => swapping && apply(swapSlot(slots, swapping, item.id, ctx), item.id)} />
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  banner: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.accent,
    color: colors.onAccent,
    fontSize: font.body,
    fontWeight: '700',
  },
  error: { fontSize: font.body, fontWeight: '700', color: colors.primaryStrong, textAlign: 'center' },
  moveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.secondary,
  },
  moveText: { flex: 1, fontSize: font.body, fontWeight: '700', color: colors.onSecondary },
  day: { gap: spacing.xs, marginTop: spacing.sm },
  dayTitle: { fontSize: font.body, fontWeight: '800', color: colors.text },
  past: { color: colors.textMuted },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
  },
  slotOpen: { borderColor: colors.primaryStrong },
  slotPast: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
  meal: { width: 72, fontSize: font.small, fontWeight: '700', color: colors.textMuted },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.border },
  slotText: { flex: 1, gap: spacing.xs },
  dish: { fontSize: font.body, fontWeight: '700', color: colors.text },
  note: { fontSize: font.small, color: colors.textMuted, fontStyle: 'italic' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: font.small,
  },
  tagLeftover: { backgroundColor: colors.secondary, color: colors.onSecondary },
  tagChanged: { backgroundColor: colors.accent, color: colors.onAccent, fontWeight: '700' },
  tagNote: { fontSize: font.small, color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingVertical: spacing.xs },
  sectionTitle: { fontSize: font.title, fontWeight: '800', color: colors.text, marginTop: spacing.lg },
  muted: { fontSize: font.small, color: colors.textMuted },
  body: { fontSize: font.body, color: colors.text },
  prep: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, gap: spacing.xs },
  prepTitle: { fontSize: font.body, fontWeight: '800', color: colors.text },
  buttons: { gap: spacing.sm, marginTop: spacing.lg },
  centerText: { textAlign: 'center' },
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  modalHint: { paddingHorizontal: spacing.md },
  list: { padding: spacing.md, gap: spacing.sm },
});
