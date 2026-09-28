import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { FilterSheet, FiltersButton } from '../../components/FilterSheet';
import { InviteCard } from '../../components/InviteCard';
import { CardFace, SwipeCard, type SwipeCardHandle, type SwipeDirection } from '../../components/SwipeCard';
import { useAuth } from '../../data/auth';
import { type DiscoverData, loadDiscover, swipe, undoLastSwipe } from '../../data/discover';
import { errorText } from '../../data/errors';
import { exclusionsVersion } from '../../data/exclusions';
import { useRecipeSettings } from '../../data/filters';
import { useMatchCelebration } from '../../data/matches';
import { useInvites } from '../../data/pairing';
import { useProfile } from '../../data/profile';
import { t } from '../../i18n';
import { buildDeck, type DeckCard, keepOnTop } from '../../logic/deck';
import { colors, font, radius, spacing } from '../../theme/tokens';

interface LastSwipe {
  card: DeckCard;
  /** Resolves to true once the server has the swipe (false if saving failed); undo waits for it. */
  saved: Promise<boolean>;
}

/** The Swipe tab (start screen): like / nope, undo, and the Filters panel. */
export default function Swipe() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [data, setData] = useState<DiscoverData | null>(null);
  const [deck, setDeck] = useState<DeckCard[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [last, setLast] = useState<LastSwipe | null>(null);
  const [undoing, setUndoing] = useState(false);
  const { celebrate } = useMatchCelebration();
  const { me, partner } = useProfile();
  const invites = useInvites(userId);
  const { version: settingsVersion } = useRecipeSettings();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const top = useRef<SwipeCardHandle>(null);
  const builtFor = useRef<string | null>(null);
  const topId = useRef<number | null>(null);
  topId.current = deck[0]?.recipeId ?? null;
  // Swiped on this phone; a rebuild may start before the server has the latest swipe.
  const swipedHere = useRef(new Set<number>());
  const coupleId = me?.couple_id ?? '';
  // Rebuild when exclusions, the filters/marks (mine or my partner's change) or the couple
  // changed since the deck was built. Exclusions change on another screen: read when needed.
  const deckKey = useCallback(
    () => `${exclusionsVersion()}|${settingsVersion}|${coupleId}`,
    [settingsVersion, coupleId],
  );

  const load = useCallback(() => {
    setLoadError(null);
    const key = deckKey();
    loadDiscover(userId).then((d) => {
      builtFor.current = key;
      setData(d);
      // Already swiped cards never come back; the card I'm looking at stays if still allowed.
      const mySwiped = new Set([...d.deckInput.mySwiped, ...swipedHere.current]);
      setDeck(keepOnTop(buildDeck({ ...d.deckInput, mySwiped, rng: Math.random }), topId.current));
      setLast(null);
    }, setLoadError);
  }, [userId, deckKey]);

  // Build on first open, and rebuild when exclusions, filters or pairing changed. While this
  // tab is shown, a filter change (here or on my partner's phone) re-runs this at once.
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
    swipedHere.current.add(card.recipeId);
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
        swipedHere.current.delete(card.recipeId);
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
      swipedHere.current.delete(last.card.recipeId);
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
      <SafeAreaView style={[styles.safe, styles.center]} edges={['top', 'left', 'right']}>
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
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('discover.title')}</Text>
        <FiltersButton onPress={() => setFiltersOpen(true)} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.profile')}
          onPress={() => router.push('/profile')}
          style={({ pressed }) => [styles.avatar, pressed && styles.roundPressed]}
        >
          <Text style={styles.avatarLabel}>{(me?.display_name ?? '?').slice(0, 1).toUpperCase()}</Text>
        </Pressable>
      </View>
      {!partner
        ? invites.incoming.map((inv) => (
            <View key={inv.invite_id} style={styles.invite}>
              <InviteCard invite={inv} onAnswered={invites.reload} />
            </View>
          ))
        : null}

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
            <Text style={styles.body}>{t('filters.empty')}</Text>
            <FiltersButton variant="primary" onPress={() => setFiltersOpen(true)} />
          </View>
        ) : (
          <View style={[styles.center, styles.empty]}>
            <Text style={styles.emptyTitle}>{t('discover.emptyTitle')}</Text>
            <Text style={styles.body}>{t('discover.emptyBody')}</Text>
            <Button label={t('exclusions.title')} onPress={() => router.push('/exclusions')} />
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
      <FilterSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} />
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
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  title: { flex: 1, fontSize: font.title, fontWeight: '800', color: colors.text },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  avatarLabel: { fontSize: font.body, fontWeight: '800', color: colors.onAccent },
  invite: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
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
