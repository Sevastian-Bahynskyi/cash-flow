import { useEffect } from 'react';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/ui/tokens';
import { WebBackdrop } from '@/ui/WebBackdrop';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { ComposerProvider } from '@/features/transactions/composer/context/ComposerContext';

function AuthGate() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || !pathname) return;
    const rootSegment = segments[0];
    const onSignIn = rootSegment === 'sign-in';
    const onSignUp = rootSegment === 'sign-up';
    const onAuthCallback = rootSegment === 'auth-callback';
    const onOAuthRoute = rootSegment === 'oauth';
    const isPublicRoute = onSignIn || onSignUp || onAuthCallback || onOAuthRoute;
    if (!session && !isPublicRoute && pathname !== '/sign-in') {
      router.replace('/sign-in');
      return;
    }
    if (session && (onSignIn || onSignUp) && pathname !== '/') {
      router.replace('/');
    }
  }, [session, loading, pathname, segments, router]);

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
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="categories" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="budgets" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="alerts" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ai-rules" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="personal-history" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="auth-callback" />
        <Stack.Screen name="oauth/consent" />
      </Stack>
    </ComposerProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
        <WebBackdrop />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
