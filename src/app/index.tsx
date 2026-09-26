import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { InviteCard } from '../components/InviteCard';
import { signOut, useAuth } from '../data/auth';
import { errorText } from '../data/errors';
import { matchesLastSeen, useMatchList } from '../data/matches';
import { useInvites } from '../data/pairing';
import { useTonight } from '../data/tonight';
import { useProfile } from '../data/profile';
import { t } from '../i18n';
import { countNewMatches } from '../logic/matches';
import { ACTIVE_STATUSES } from '../logic/tonight';
import { colors, font, radius, spacing } from '../theme/tokens';

export default function Home() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const { me, partner, loading, error, reload } = useProfile();
  const invites = useInvites(userId);
  const { matches } = useMatchList();
  const tonight = useTonight(userId);
  const tonightSession = tonight.data?.session;
  const tonightActive = !!tonightSession && ACTIVE_STATUSES.includes(tonightSession.status);
  // The partner started a round I haven't swiped in yet.
  const tonightInvite =
    tonightActive && tonightSession.startedBy !== userId && tonightSession.status === 'swiping' && !tonight.data?.me?.swipeDone;
  // Re-read "last seen" whenever Home is shown again (e.g. back from Matches).
  const [lastSeen, setLastSeen] = useState(() => matchesLastSeen(userId));
  useFocusEffect(useCallback(() => setLastSeen(matchesLastSeen(userId)), [userId]));
  const newMatches = countNewMatches(
    (matches ?? []).map((m) => ({ recipeId: m.recipe.id, createdAt: m.createdAt, cookTimeMin: null, cuisine: null })),
    lastSeen,
  );
  const [signOutError, setSignOutError] = useState<string | null>(null);

  // First run: ask what they don't eat before anything else.
  useEffect(() => {
    if (me && !me.onboarded) router.replace({ pathname: '/exclusions', params: { onboarding: '1' } });
  }, [me]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primaryStrong} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <>
            <Text style={styles.body}>{errorText(error)}</Text>
            <Button label={t('common.retry')} onPress={reload} />
          </>
        ) : (
          <>
            <Text style={styles.title}>{t('home.greeting', { name: me?.display_name ?? '' })}</Text>
            <Text style={styles.muted}>{t('home.signedInAs', { email: me?.email ?? '' })}</Text>
          </>
        )}

        {partner ? (
          <View style={styles.paired}>
            <Text style={styles.pairedText}>{t('home.pairedWith', { name: partner.display_name })}</Text>
            <Button label={t('pair.manage')} variant="text" onPress={() => router.push('/pair')} />
          </View>
        ) : (
          <>
            {invites.incoming.map((inv) => (
              <InviteCard key={inv.invite_id} invite={inv} onAnswered={invites.reload} />
            ))}
            <Button label={t('pair.cta')} onPress={() => router.push('/pair')} />
          </>
        )}

        {partner && tonightInvite ? (
          <View style={styles.invite} accessibilityRole="alert">
            <Text style={styles.inviteText}>{t('tonight.joinBanner', { name: partner.display_name })}</Text>
            <Button label={t('tonight.join')} onPress={() => router.push('/tonight')} />
          </View>
        ) : partner ? (
          <Button
            label={tonightActive ? t('tonight.continue') : t('tonight.cta')}
            onPress={() => router.push('/tonight')}
          />
        ) : null}
        <Button
          label={t('discover.title')}
          variant={partner ? 'text' : 'primary'}
          onPress={() => router.push('/discover')}
        />
        {partner ? (
          <View>
            <Button
              label={t('matches.button', { count: matches?.length ?? 0 })}
              variant="text"
              onPress={() => router.push('/matches')}
            />
            {newMatches > 0 ? (
              <Text style={styles.newBadge} accessibilityRole="alert">
                {t('matches.newCount', { count: newMatches })}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Button label={t('exclusions.title')} variant="text" onPress={() => router.push('/exclusions')} />
        <Button label={t('recipes.browse')} variant="text" onPress={() => router.push('/recipes')} />
        {signOutError ? <Text style={styles.body}>{signOutError}</Text> : null}
        <Button
          label={t('auth.signOut')}
          variant="text"
          onPress={() => signOut().catch((e) => setSignOutError(errorText(e)))}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.small, color: colors.textMuted },
  body: { fontSize: font.body, color: colors.text },
  paired: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.success,
    alignItems: 'flex-start',
  },
  invite: { padding: spacing.md, gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.accent },
  inviteText: { fontSize: font.body, fontWeight: '700', color: colors.onAccent },
  newBadge: {
    alignSelf: 'center',
    marginTop: -spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.accent,
    color: colors.onAccent,
    fontSize: font.small,
    fontWeight: '700',
  },
  pairedText: { fontSize: font.body, fontWeight: '700', color: colors.text },
});
