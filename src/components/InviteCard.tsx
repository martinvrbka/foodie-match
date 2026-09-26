import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorText } from '../data/errors';
import { type IncomingInvite, respondInvite } from '../data/pairing';
import { t } from '../i18n';
import { colors, font, radius, spacing } from '../theme/tokens';
import { Button } from './Button';

/** "Anna wants to pair with you" with Accept / Decline. */
export function InviteCard({ invite, onAnswered }: { invite: IncomingInvite; onAnswered: () => void }) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<unknown>(null);

  const answer = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline');
    setError(null);
    try {
      await respondInvite(invite.invite_id, accept);
      onAnswered(); // on accept, the profile updates by itself via realtime
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={styles.text}>{t('pair.inviteFrom', { name: invite.from_name })}</Text>
      {error ? <Text style={styles.error}>{errorText(error)}</Text> : null}
      <View style={styles.row}>
        <View style={styles.grow}>
          <Button label={t('pair.accept')} onPress={() => answer(true)} busy={busy === 'accept'} disabled={!!busy} />
        </View>
        <View style={styles.grow}>
          <Button label={t('pair.decline')} variant="text" onPress={() => answer(false)} busy={busy === 'decline'} disabled={!!busy} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface },
  text: { fontSize: font.body, fontWeight: '700', color: colors.text },
  error: { fontSize: font.small, fontWeight: '600', color: colors.primaryStrong },
  row: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
});
