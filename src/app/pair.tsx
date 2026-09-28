import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { InviteCard } from '../components/InviteCard';
import { TextField } from '../components/TextField';
import { useAuth } from '../data/auth';
import { errorText } from '../data/errors';
import { createPairingCode, redeemPairingCode, sendInvite, unpair, useInvites } from '../data/pairing';
import { useProfile } from '../data/profile';
import { t } from '../i18n';
import { formatCountdown, parsePairingCode, qrPayload, secondsLeft } from '../logic/pairing';
import { colors, font, radius, spacing } from '../theme/tokens';

export default function Pair() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const { partner, reload } = useProfile();
  const invites = useInvites(userId);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Button label={`‹ ${t('recipes.back')}`} variant="text" onPress={() => router.back()} />
        </View>
        {partner ? (
          <Paired name={partner.display_name} onUnpaired={reload} />
        ) : (
          <>
            <Text style={styles.title}>{t('pair.title')}</Text>
            <Text style={styles.muted}>{t('pair.intro')}</Text>
            {invites.incoming.map((inv) => (
              <InviteCard key={inv.invite_id} invite={inv} onAnswered={invites.reload} />
            ))}
            <MyCode />
            <Section title={t('pair.scanTitle')}>
              <Button label={t('pair.scan')} onPress={() => router.push('/scan')} />
            </Section>
            <EnterCode onPaired={reload} />
            <InviteByEmail sent={invites.sent} onSent={invites.reload} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** My QR code + typed code, valid for 10 minutes. */
function MyCode() {
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!code) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [code]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setCode(await createPairingCode());
      setNow(Date.now());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const left = code ? secondsLeft(code.expires_at, now) : 0;
  return (
    <Section title={t('pair.myCodeTitle')}>
      {error ? <Text style={styles.error}>{errorText(error)}</Text> : null}
      {code && left > 0 ? (
        <View style={styles.codeBox}>
          <View style={styles.qr} accessibilityLabel={t('pair.qrLabel', { code: code.code })}>
            <QRCode value={qrPayload(code.code)} size={200} color={colors.text} backgroundColor={colors.surface} />
          </View>
          <Text style={styles.code} accessibilityLabel={code.code.split('').join(' ')}>
            {code.code}
          </Text>
          <Text style={styles.muted}>{t('pair.expiresIn', { time: formatCountdown(left) })}</Text>
          <Text style={styles.muted}>{t('pair.myCodeHint')}</Text>
        </View>
      ) : (
        <>
          {code ? <Text style={styles.muted}>{t('pair.expired')}</Text> : null}
          <Button label={t(code ? 'pair.newCode' : 'pair.showCode')} onPress={create} busy={busy} />
        </>
      )}
    </Section>
  );
}

function EnterCode({ onPaired }: { onPaired: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = parsePairingCode(text);

  const submit = async () => {
    if (!code) return setError(t('pair.codeInvalid'));
    setBusy(true);
    setError(null);
    try {
      await redeemPairingCode(code);
      onPaired();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Section title={t('pair.enterTitle')}>
      <TextField
        label={t('pair.codeLabel')}
        placeholder="ABC23X"
        value={text}
        onChangeText={setText}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        onSubmitEditing={submit}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={t('pair.pair')} onPress={submit} busy={busy} disabled={!text.trim()} />
    </Section>
  );
}

function InviteByEmail({ sent, onSent }: { sent: string[]; onSent: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendInvite(email);
      setEmail('');
      onSent();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t('pair.emailTitle')}>
      <Text style={styles.muted}>{t('pair.emailHint')}</Text>
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onSubmitEditing={submit}
      />
      {error ? <Text style={styles.error}>{errorText(error)}</Text> : null}
      <Button label={t('pair.sendInvite')} onPress={submit} busy={busy} disabled={!email.trim()} />
      {sent.map((to) => (
        <Text key={to} style={styles.muted}>
          {t('pair.waitingFor', { email: to })}
        </Text>
      ))}
    </Section>
  );
}

function Paired({ name, onUnpaired }: { name: string; onUnpaired: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const confirm = () =>
    Alert.alert(t('pair.unpairTitle', { name }), t('pair.unpairBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('pair.unpair'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setError(null);
          try {
            await unpair();
            onUnpaired();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t('home.pairedWith', { name })}</Text>
      <Text style={styles.muted}>{t('pair.pairedHint')}</Text>
      {error ? <Text style={styles.error}>{errorText(error)}</Text> : null}
      <Button label={t('pair.startSwiping')} onPress={() => router.navigate('/')} />
      <Button label={t('pair.unpair')} variant="text" onPress={confirm} busy={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { alignItems: 'flex-start' },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.small, color: colors.textMuted },
  error: { fontSize: font.body, fontWeight: '600', color: colors.primaryStrong },
  section: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  sectionTitle: { fontSize: font.title, fontWeight: '700', color: colors.text },
  codeBox: { alignItems: 'center', gap: spacing.sm },
  qr: { padding: spacing.md, backgroundColor: colors.surface },
  code: { fontSize: 36, fontWeight: '800', letterSpacing: 6, color: colors.text },
});
