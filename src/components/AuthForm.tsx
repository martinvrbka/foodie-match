import { type ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { colors, font, spacing } from '../theme/tokens';

/** Shared layout for the sign-in and sign-up screens. */
export function AuthForm({ title, error, children }: { title: string; error: string | null; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior="height" style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>{t('common.appName')}</Text>
          <Text style={styles.tagline}>{t('auth.tagline')}</Text>
          <Text style={styles.title}>{title}</Text>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <View style={styles.fields}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  brand: { fontSize: font.hero, fontWeight: '800', color: colors.primaryStrong, textAlign: 'center' },
  tagline: { fontSize: font.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  error: { fontSize: font.body, color: colors.primaryStrong, fontWeight: '600' },
  fields: { gap: spacing.md },
});
