import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/ui/tokens';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { ComposerProvider } from '@/features/transactions/ComposerContext';
import { configureNotifications } from '@/lib/notifications';

function AuthGate() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const onSignIn = segments[0] === 'sign-in';
    const onAuthCallback = segments[0] === 'auth-callback';
    const onOAuthRoute = segments[0] === 'oauth';
    const isPublicRoute = onSignIn || onAuthCallback || onOAuthRoute;
    if (!session && !isPublicRoute) router.replace('/sign-in');
    else if (session && onSignIn) router.replace('/');
  }, [session, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }
  return (
    <ComposerProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="categories" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="budgets" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="alerts" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ai-rules" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="auth-callback" />
        <Stack.Screen name="oauth/consent" />
      </Stack>
    </ComposerProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    configureNotifications();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
