import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { signOut, useAuth } from '../data/auth';
import { errorText } from '../data/errors';
import { useMyProfile } from '../data/profile';
import { t } from '../i18n';
import { colors, font, spacing } from '../theme/tokens';

export default function Home() {
  const { session } = useAuth();
  const { me, partner, loading, error, reload } = useMyProfile(session!.user.id);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primaryStrong} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        {error ? (
          <>
            <Text style={styles.body}>{errorText(error)}</Text>
            <Button label={t('common.retry')} onPress={reload} />
          </>
        ) : (
          <>
            <Text style={styles.title}>{t('home.greeting', { name: me?.display_name ?? '' })}</Text>
            <Text style={styles.muted}>{t('home.signedInAs', { email: me?.email ?? '' })}</Text>
            <Text style={styles.body}>
              {partner ? t('home.pairedWith', { name: partner.display_name }) : t('home.pairingSoon')}
            </Text>
          </>
        )}
        {signOutError ? <Text style={styles.body}>{signOutError}</Text> : null}
        <Button
          label={t('auth.signOut')}
          variant="text"
          onPress={() => signOut().catch((e) => setSignOutError(errorText(e)))}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.small, color: colors.textMuted },
  body: { fontSize: font.body, color: colors.text },
});
