import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { BarlowCondensed_700Bold_Italic, BarlowCondensed_800ExtraBold_Italic } from '@expo-google-fonts/barlow-condensed';
import { Barlow_500Medium, Barlow_600SemiBold, Barlow_600SemiBold_Italic, Barlow_700Bold_Italic } from '@expo-google-fonts/barlow';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/ui/tokens';
import { WebBackdrop } from '@/ui/WebBackdrop';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { DataProvider } from '@/core/data/store';
import { ToastProvider } from '@/ui/kit/ui';
import { DetailProvider } from '@/ui/kit/money';
import { configureNotificationHandling } from '@/lib/notifications';

configureNotificationHandling();

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
    <DataProvider>
      <ToastProvider>
        <DetailProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
            <Stack.Screen name="(tabs)" />
            {['budgets', 'budgets-plan', 'where', 'shared', 'bank', 'categories', 'rules'].map((name) => (
              <Stack.Screen key={name} name={name} options={{ animation: 'slide_from_right' }} />
            ))}
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="sign-up" />
            <Stack.Screen name="auth-callback" />
            <Stack.Screen name="oauth/consent" />
          </Stack>
        </DetailProvider>
      </ToastProvider>
    </DataProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_700Bold_Italic,
    BarlowCondensed_800ExtraBold_Italic,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_600SemiBold_Italic,
    Barlow_700Bold_Italic,
  });
  // the aura's type is the look; wait for it, but never block the app on a font failure
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <WebBackdrop />
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
