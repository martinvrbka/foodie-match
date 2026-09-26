import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { errorText } from '../data/errors';
import { redeemPairingCode } from '../data/pairing';
import { useProfile } from '../data/profile';
import { t } from '../i18n';
import { parsePairingCode } from '../logic/pairing';
import { colors, font, radius, spacing } from '../theme/tokens';

/** Scans the partner's pairing QR code and pairs straight away. */
export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const { reload } = useProfile();
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);

  const onScanned = async (data: string) => {
    if (busy.current) return; // the camera reports the same code many times per second
    const code = parsePairingCode(data);
    if (!code) {
      setMessage(t('pair.notOurCode'));
      return;
    }
    busy.current = true;
    setMessage(t('pair.pairing'));
    try {
      await redeemPairingCode(code);
      reload();
      router.back(); // the pair screen now shows "You're paired with …"
    } catch (e) {
      setMessage(errorText(e));
      setTimeout(() => (busy.current = false), 2000); // let them retry
    }
  };

  if (!permission) return <View style={styles.safe} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={styles.body}>{t('pair.cameraNeeded')}</Text>
        {permission.canAskAgain ? (
          <Button label={t('pair.allowCamera')} onPress={requestPermission} />
        ) : (
          <Text style={styles.body}>{t('pair.cameraDenied')}</Text>
        )}
        <Button label={`‹ ${t('recipes.back')}`} variant="text" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.camera}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => onScanned(data)}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.panel}>
          <Text style={styles.body}>{message ?? t('pair.scanHint')}</Text>
          <Button label={`‹ ${t('recipes.back')}`} variant="text" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  camera: { flex: 1, backgroundColor: colors.overlay },
  overlay: { flex: 1, justifyContent: 'flex-end', padding: spacing.md },
  panel: { padding: spacing.md, gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface },
  body: { fontSize: font.body, color: colors.text, textAlign: 'center' },
});
