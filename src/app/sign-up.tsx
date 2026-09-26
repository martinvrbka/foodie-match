import { router } from 'expo-router';
import { useState } from 'react';
import { AuthForm } from '../components/AuthForm';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { signUp } from '../data/auth';
import { errorText } from '../data/errors';
import { t } from '../i18n';

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signUp(name, email, password); // no confirmation email: signed in right away
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <AuthForm title={t('auth.signUpTitle')} error={error}>
      <TextField
        label={t('auth.name')}
        placeholder={t('auth.namePlaceholder')}
        value={name}
        onChangeText={setName}
        maxLength={40}
        autoComplete="name"
      />
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
        hint={t('auth.passwordHint')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        onSubmitEditing={submit}
      />
      <Button
        label={t('auth.signUp')}
        onPress={submit}
        busy={busy}
        disabled={!name.trim() || !email.trim() || !password}
      />
      <Button label={t('auth.toSignIn')} variant="text" onPress={() => router.replace('/sign-in')} />
    </AuthForm>
  );
}
