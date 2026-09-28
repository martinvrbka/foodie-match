// Profile: what Home had besides navigation (now in the bottom panel): who I am, pairing,
// invites, "I don't eat" and sign out. Opened from the Swipe screen's header.
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { InviteCard } from '../components/InviteCard';
import { signOut, useAuth } from '../data/auth';
import { errorText } from '../data/errors';
import { useInvites } from '../data/pairing';
import { useProfile } from '../data/profile';
import { t } from '../i18n';
import { colors, font, radius, spacing } from '../theme/tokens';

export default function Profile() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const { me, partner, error, reload } = useProfile();
  const invites = useInvites(userId);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Button label={`‹ ${t('recipes.back')}`} variant="text" onPress={() => router.back()} />
      </View>
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

        <Button label={t('exclusions.title')} variant="text" onPress={() => router.push('/exclusions')} />
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
  header: { flexDirection: 'row', paddingHorizontal: spacing.sm },
  content: { padding: spacing.lg, gap: spacing.md },
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
  pairedText: { fontSize: font.body, fontWeight: '700', color: colors.text },
});
