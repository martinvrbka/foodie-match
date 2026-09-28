import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { CardFace, SwipeCard, type SwipeCardHandle, type SwipeDirection } from '../components/SwipeCard';
import { useAuth } from '../data/auth';
import { type DiscoverData, loadDiscover, swipe, undoLastSwipe } from '../data/discover';
import { errorText } from '../data/errors';
import { exclusionsVersion } from '../data/exclusions';
import { filtersVersion, saveFilters } from '../data/filters';
import { useMatchCelebration } from '../data/matches';
import { useProfile } from '../data/profile';
import { t } from '../i18n';
import { buildDeck, type DeckCard } from '../logic/deck';
import { NO_FILTERS } from '../logic/filters';
import { colors, font, radius, spacing } from '../theme/tokens';

interface LastSwipe {
  card: DeckCard;
  /** Resolves to true once the server has the swipe (false if saving failed); undo waits for it. */
  saved: Promise<boolean>;
}

export default function Discover() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [data, setData] = useState<DiscoverData | null>(null);
  const [deck, setDeck] = useState<DeckCard[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [last, setLast] = useState<LastSwipe | null>(null);
  const [undoing, setUndoing] = useState(false);
  const { celebrate } = useMatchCelebration();
  const { me } = useProfile();
  const top = useRef<SwipeCardHandle>(null);
  const builtFor = useRef<string | null>(null);
  const coupleId = me?.couple_id ?? '';
  // Rebuild when exclusions, my filters/marks or the couple changed since the deck was built.
  // Read when needed, not per render: the versions change on other screens.
  const deckKey = useCallback(() => `${exclusionsVersion()}|${filtersVersion()}|${coupleId}`, [coupleId]);

  const load = useCallback(() => {
    setLoadError(null);
    const key = deckKey();
    loadDiscover(userId).then((d) => {
      builtFor.current = key;
      setData(d);
      setDeck(buildDeck({ ...d.deckInput, rng: Math.random }));
      setLast(null);
    }, setLoadError);
  }, [userId, deckKey]);

  const clearMyFilters = () => {
    setActionError(null);
    saveFilters(NO_FILTERS).then(load, (e) => setActionError(errorText(e)));
  };

  // Build on first open, and rebuild when exclusions or pairing changed meanwhile.
  useFocusEffect(
    useCallback(() => {
      if (builtFor.current !== deckKey()) load();
    }, [load, deckKey]),
  );

  const onSwiped = (dir: SwipeDirection) => {
    const card = deck[0];
    if (!card || !data) return;
    const liked = dir === 'right';
    setDeck((d) => d.slice(1));
    setActionError(null);
    if (liked) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const saved = swipe(card.recipeId, liked).then(
      ({ matched }) => {
        if (matched) {
          celebrate(card.recipeId);
        }
        return true;
      },
      (e) => {
        // Not saved: put the card back on top.
        setDeck((d) => [card, ...d]);
        setLast(null);
        setActionError(t('discover.saveFailed', { message: errorText(e) }));
        return false;
      },
    );
    setLast({ card, saved });
  };

  const undo = async () => {
    if (!last) return;
    setUndoing(true);
    setActionError(null);
    try {
      if (!(await last.saved)) return;
      await undoLastSwipe();
      setDeck((d) => [last.card, ...d]);
      setLast(null); // one step only
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setUndoing(false);
    }
  };

  const openRecipe = (recipeId: number) =>
    router.push({ pathname: '/recipe/[id]', params: { id: String(recipeId) } });

  if (loadError || !data) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        {loadError ? (
          <>
            <Text style={styles.body}>{errorText(loadError)}</Text>
            <Button label={t('common.retry')} onPress={load} />
          </>
        ) : (
          <ActivityIndicator color={colors.primaryStrong} />
        )}
      </SafeAreaView>
    );
  }

  const badgeFor = (card: DeckCard) =>
    card.partnerExcluded && data.partnerName ? t('discover.partnerWontEat', { name: data.partnerName }) : null;
  const [current, next] = [deck[0], deck[1]];
  const currentRecipe = current && data.recipes.get(current.recipeId);
  const nextRecipe = next && data.recipes.get(next.recipeId);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Button label={`‹ ${t('recipes.back')}`} variant="text" onPress={() => router.back()} />
        <Text style={styles.title}>{t('discover.title')}</Text>
      </View>

      <View style={styles.stack}>
        {currentRecipe ? (
          <>
            {nextRecipe ? (
              <View style={[StyleSheet.absoluteFill, styles.under]}>
                <CardFace recipe={nextRecipe} badge={badgeFor(next)} />
              </View>
            ) : null}
            <SwipeCard
              key={current.recipeId}
              ref={top}
              recipe={currentRecipe}
              badge={badgeFor(current)}
              onSwiped={onSwiped}
              onOpen={() => openRecipe(current.recipeId)}
            />
          </>
        ) : data.filtersHoldBack ? (
          <View style={[styles.center, styles.empty]}>
            <Text style={styles.body}>
              {data.deckInput.partner ? t('filters.emptyMatching') : t('filters.emptyMatchingSolo')}
            </Text>
            <Button label={t('filters.clear')} onPress={clearMyFilters} />
            <Button label={t('recipes.browse')} variant="text" onPress={() => router.push('/recipes')} />
          </View>
        ) : (
          <View style={[styles.center, styles.empty]}>
            <Text style={styles.emptyTitle}>{t('discover.emptyTitle')}</Text>
            <Text style={styles.body}>{t('discover.emptyBody')}</Text>
            <Button label={t('exclusions.title')} onPress={() => router.push('/exclusions')} />
            <Button label={t('recipes.browse')} variant="text" onPress={() => router.push('/recipes')} />
          </View>
        )}
      </View>

      {actionError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {actionError}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <RoundButton
          label="✕"
          accessibilityLabel={t('discover.nope')}
          onPress={() => top.current?.swipe('left')}
          disabled={!currentRecipe}
        />
        <RoundButton
          label="↺"
          small
          accessibilityLabel={t('discover.undo')}
          onPress={undo}
          disabled={!last || undoing}
        />
        <RoundButton
          label="♥"
          primary
          accessibilityLabel={t('discover.like')}
          onPress={() => top.current?.swipe('right')}
          disabled={!currentRecipe}
        />
      </View>

    </SafeAreaView>
  );
}

function RoundButton(props: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  small?: boolean;
}) {
  const size = props.small ? 52 : 68;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={{ disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.round,
        { width: size, height: size },
        props.primary && styles.roundPrimary,
        props.disabled && styles.roundDisabled,
        pressed && styles.roundPressed,
      ]}
    >
      <Text style={[styles.roundLabel, props.primary && styles.roundLabelPrimary, props.small && styles.roundLabelSmall]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm },
  title: { fontSize: font.title, fontWeight: '800', color: colors.text },
  stack: { flex: 1, marginHorizontal: spacing.md, marginTop: spacing.sm },
  under: { transform: [{ scale: 0.95 }, { translateY: 12 }] },
  empty: { flex: 1 },
  emptyTitle: { fontSize: font.title, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: font.body, color: colors.text, textAlign: 'center' },
  error: { fontSize: font.body, fontWeight: '600', color: colors.primaryStrong, textAlign: 'center', padding: spacing.sm },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.lg,
  },
  round: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roundPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  roundDisabled: { opacity: 0.4 },
  roundPressed: { transform: [{ scale: 0.94 }] },
  roundLabel: { fontSize: 30, fontWeight: '800', color: colors.text },
  roundLabelPrimary: { color: colors.onPrimary },
  roundLabelSmall: { fontSize: font.title },
});
