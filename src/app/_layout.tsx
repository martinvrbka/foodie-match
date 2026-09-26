import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MatchOverlay } from '../components/MatchOverlay';
import { AuthProvider, useAuth } from '../data/auth';
import { MatchProvider } from '../data/matches';
import { ProfileProvider } from '../data/profile';
import { colors } from '../theme/tokens';

function Routes() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primaryStrong} />
      </View>
    );
  }
  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="index" />
        <Stack.Screen name="discover" />
        <Stack.Screen name="matches" />
        <Stack.Screen name="pair" />
        <Stack.Screen name="tonight" />
        <Stack.Screen name="week" />
        <Stack.Screen name="scan" />
        <Stack.Screen name="exclusions" />
        <Stack.Screen name="recipes" />
        <Stack.Screen name="recipe/[id]" />
      </Stack.Protected>
    </Stack>
  );
  if (!session) return stack;
  // Signed in: shared profile state, and "It's a match!" over any screen.
  return (
    <ProfileProvider userId={session.user.id}>
      <MatchProvider>
        {stack}
        <MatchOverlay />
      </MatchProvider>
    </ProfileProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
