import { router } from 'expo-router';
import { useState } from 'react';
import { AuthForm } from '../components/AuthForm';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { signIn } from '../data/auth';
import { errorText } from '../data/errors';
import { t } from '../i18n';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password); // the root layout switches to the app
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <AuthForm title={t('auth.signInTitle')} error={error}>
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <TextField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        onSubmitEditing={submit}
      />
      <Button label={t('auth.signIn')} onPress={submit} busy={busy} disabled={!email.trim() || !password} />
      <Button label={t('auth.toSignUp')} variant="text" onPress={() => router.replace('/sign-up')} />
    </AuthForm>
  );
}
