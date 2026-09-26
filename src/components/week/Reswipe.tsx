import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { errorText } from '../../data/errors';
import type { RecipeSummary } from '../../data/recipes';
import { t } from '../../i18n';
import { colors, font, spacing } from '../../theme/tokens';
import { Button } from '../Button';
import { CardFace, SwipeCard, type SwipeCardHandle, type SwipeDirection } from '../SwipeCard';

interface Props {
  /** This week's selection I haven't swiped yet, in card order. */
  cards: RecipeSummary[];
  /** Size of the whole selection (for "n of 30"). */
  total: number;
  onSwipe: (recipeId: number, liked: boolean) => Promise<unknown>;
  /** Undoes my last re-swipe on the server; resolves with its recipe id. */
  onUndo: () => Promise<number>;
  /** "Enough — plan with these", or the last card was swiped. */
  onDone: () => void;
}

/** Re-swipe of this week's matches: like = plan it this week, left = not this week. */
export function Reswipe({ cards, total, onSwipe, onUndo, onDone }: Props) {
  const [deck, setDeck] = useState(cards);
  const [last, setLast] = useState<RecipeSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [undoing, setUndoing] = useState(false);
  const top = useRef<SwipeCardHandle>(null);
  const pending = useRef<Promise<boolean>>(Promise.resolve(true));
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  const onSwiped = (dir: SwipeDirection) => {
    const card = deck[0];
    if (!card) return;
    const rest = deck.slice(1);
    setDeck(rest);
    setError(null);
    setLast(card);
    pending.current = onSwipe(card.id, dir === 'right').then(
      () => {
        if (rest.length === 0) finish();
        return true;
      },
      (e) => {
        setDeck((d) => [card, ...d]);
        setLast(null);
        setError(e);
        return false;
      },
    );
  };

  const undo = async () => {
    if (!last) return;
    setUndoing(true);
    try {
      if (await pending.current) {
        await onUndo();
        setDeck((d) => [last, ...d]);
      }
      setLast(null);
    } catch (e) {
      setError(e);
    } finally {
      setUndoing(false);
    }
  };

  const [current, next] = deck;
  return (
    <View style={styles.flex}>
      <Text style={styles.title}>{t('week.reswipeTitle')}</Text>
      <Text style={styles.progress}>
        {t('week.reswipeHint')} · {t('week.reswipeProgress', { done: total - deck.length, total })}
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t('discover.saveFailed', { message: errorText(error) })}
        </Text>
      ) : null}
      <View style={styles.stack}>
        {next ? (
          <View style={[StyleSheet.absoluteFill, styles.under]}>
            <CardFace recipe={next} badge={null} />
          </View>
        ) : null}
        {current ? (
          <SwipeCard
            key={current.id}
            ref={top}
            recipe={current}
            badge={null}
            onSwiped={onSwiped}
            onOpen={() => router.push({ pathname: '/recipe/[id]', params: { id: String(current.id) } })}
          />
        ) : (
          <View style={[styles.flex, styles.center]}>
            <ActivityIndicator color={colors.primaryStrong} />
          </View>
        )}
      </View>
      <View style={styles.actions}>
        <Button label={`✕ ${t('discover.nope')}`} variant="text" onPress={() => top.current?.swipe('left')} disabled={!current} />
        <Button label={`↶ ${t('week.undo')}`} variant="text" onPress={undo} disabled={!last || undoing} />
        <Button label={`♥ ${t('discover.like')}`} onPress={() => top.current?.swipe('right')} disabled={!current} />
      </View>
      <View style={styles.footer}>
        <Button label={t('week.enough')} variant="text" onPress={finish} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: font.title, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: spacing.sm },
  progress: { fontSize: font.small, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.md },
  error: { fontSize: font.body, fontWeight: '600', color: colors.primaryStrong, textAlign: 'center', padding: spacing.sm },
  stack: { flex: 1, margin: spacing.md },
  under: { transform: [{ scale: 0.95 }, { translateY: 12 }] },
  actions: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  footer: { alignItems: 'center', paddingBottom: spacing.sm },
});
