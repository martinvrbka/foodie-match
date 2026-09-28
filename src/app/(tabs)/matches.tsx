import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { RecipeMeta } from '../../components/RecipeMeta';
import { useAuth } from '../../data/auth';
import { errorText } from '../../data/errors';
import { markMatchesSeen, type MatchRow, removeMatch, useMatchList } from '../../data/matches';
import { useProfile } from '../../data/profile';
import { useTonight } from '../../data/tonight';
import { photoUrl } from '../../data/recipes';
import { t } from '../../i18n';
import { COOK_TIME_OPTIONS, filterMatches, type MatchFilter, matchCuisines } from '../../logic/matches';
import { ACTIVE_STATUSES } from '../../logic/tonight';
import { colors, font, radius, spacing } from '../../theme/tokens';

const toItem = (m: MatchRow) => ({
  recipeId: m.recipe.id,
  createdAt: m.createdAt,
  cookTimeMin: m.recipe.cook_time_min,
  cuisine: m.recipe.cuisine,
  row: m,
});

export default function Matches() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const { partner } = useProfile();
  const { matches, error, reload } = useMatchList();
  const [filter, setFilter] = useState<MatchFilter>({ maxMinutes: null, cuisine: null });
  const [removeError, setRemoveError] = useState<unknown>(null);
  // Tonight picks one of our matches, so it starts here (it used to be on Home).
  const tonight = useTonight(userId);
  const tonightSession = tonight.data?.session;
  const tonightActive = !!tonightSession && ACTIVE_STATUSES.includes(tonightSession.status);
  const tonightInvite =
    tonightActive && tonightSession.startedBy !== userId && tonightSession.status === 'swiping' && !tonight.data?.me?.swipeDone;

  const items = useMemo(() => (matches ?? []).map(toItem), [matches]);
  const shown = useMemo(() => filterMatches(items, filter), [items, filter]);
  const cuisines = useMemo(() => matchCuisines(items), [items]);

  // Opening this screen marks every current match as seen (server time of the newest one).
  useFocusEffect(
    useCallback(() => {
      const newest = filterMatches(items, { maxMinutes: null, cuisine: null })[0];
      if (newest) markMatchesSeen(userId, newest.createdAt);
    }, [items, userId]),
  );

  const confirmRemove = (m: MatchRow) =>
    Alert.alert(t('matches.removeTitle', { title: m.recipe.title }), t('matches.removeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('matches.remove'),
        style: 'destructive',
        onPress: () => {
          setRemoveError(null);
          removeMatch(m.recipe.id).then(reload, setRemoveError);
        },
      },
    ]);

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>{t('matches.title')}</Text>
      {partner && tonightInvite ? (
        <View style={styles.invite} accessibilityRole="alert">
          <Text style={styles.inviteText}>{t('tonight.joinBanner', { name: partner.display_name })}</Text>
          <Button label={t('tonight.join')} onPress={() => router.push('/tonight')} />
        </View>
      ) : partner && (items.length > 0 || tonightActive) ? (
        <Button
          label={tonightActive ? t('tonight.continue') : t('tonight.cta')}
          onPress={() => router.push('/tonight')}
        />
      ) : null}
      {items.length > 0 ? (
        <>
          <Text style={styles.label}>{t('matches.time')}</Text>
          <View style={styles.wrap}>
            {[null, ...COOK_TIME_OPTIONS].map((min) => (
              <Chip
                key={String(min)}
                label={min === null ? t('matches.anyTime') : t('matches.upTo', { min })}
                selected={filter.maxMinutes === min}
                onPress={() => setFilter((f) => ({ ...f, maxMinutes: min }))}
              />
            ))}
          </View>
          {cuisines.length > 1 ? (
            <>
              <Text style={styles.label}>{t('matches.cuisine')}</Text>
              <View style={styles.wrap}>
                {[null, ...cuisines].map((c) => (
                  <Chip
                    key={c ?? 'all'}
                    label={c ?? t('matches.anyCuisine')}
                    selected={filter.cuisine === c}
                    onPress={() => setFilter((f) => ({ ...f, cuisine: c }))}
                  />
                ))}
              </View>
            </>
          ) : null}
          <Text style={styles.muted}>{t('matches.removeHint')}</Text>
        </>
      ) : null}
      {removeError ? <Text style={styles.error}>{errorText(removeError)}</Text> : null}
    </View>
  );

  if (error || matches === null) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]} edges={['top', 'left', 'right']}>
        {error ? (
          <>
            <Text style={styles.body}>{errorText(error)}</Text>
            <Button label={t('common.retry')} onPress={reload} />
          </>
        ) : (
          <ActivityIndicator color={colors.primaryStrong} />
        )}
      </SafeAreaView>
    );
  }

  const empty = !partner ? t('matches.unpaired') : items.length === 0 ? t('matches.none') : t('matches.noneFiltered');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={shown}
        keyExtractor={(m) => String(m.recipeId)}
        numColumns={2}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.body}>{empty}</Text>
            {!partner ? (
              <Button label={t('pair.cta')} onPress={() => router.push('/pair')} />
            ) : null}
          </View>
        }
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.row.recipe.title}
            accessibilityHint={t('matches.removeHint')}
            onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: String(item.recipeId) } })}
            onLongPress={() => confirmRemove(item.row)}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          >
            <Image
              source={photoUrl(item.row.recipe.image_url, 'medium')}
              placeholder={photoUrl(item.row.recipe.image_url, 'small')}
              style={styles.photo}
              contentFit="cover"
              transition={150}
            />
            <View style={styles.tileText}>
              <Text style={styles.tileTitle} numberOfLines={2}>
                {item.row.recipe.title}
              </Text>
              <RecipeMeta recipe={item.row.recipe} />
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  header: { gap: spacing.sm, paddingBottom: spacing.md, alignItems: 'flex-start' },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  invite: { alignSelf: 'stretch', padding: spacing.md, gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.accent },
  inviteText: { fontSize: font.body, fontWeight: '700', color: colors.onAccent },
  label: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muted: { fontSize: font.small, color: colors.textMuted, marginTop: spacing.sm },
  error: { fontSize: font.body, fontWeight: '600', color: colors.primaryStrong },
  body: { fontSize: font.body, color: colors.text, textAlign: 'center' },
  list: { padding: spacing.md, gap: spacing.md },
  row: { gap: spacing.md },
  emptyBox: { gap: spacing.md, paddingTop: spacing.xl, alignItems: 'center' },
  tile: { flex: 1, maxWidth: '50%', borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  pressed: { opacity: 0.8 },
  photo: { width: '100%', aspectRatio: 1, backgroundColor: colors.border },
  tileText: { padding: spacing.sm, gap: 2 },
  tileTitle: { fontSize: font.body, fontWeight: '700', color: colors.text },
});
