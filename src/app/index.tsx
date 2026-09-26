import { StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import { colors, font, spacing } from '../theme/tokens';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('common.appName')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.primaryStrong },
});
