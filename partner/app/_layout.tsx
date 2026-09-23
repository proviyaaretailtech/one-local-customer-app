import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { queryClient } from '@/src/query-client';
import { AuthProvider, useAuth } from '@/src/auth';
import { useAlertPoller } from '@/src/use-alert';
import { colors } from '@/src/theme';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, session } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  useAlertPoller();

  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === 'sign-in';
    if (!session && !inAuthGroup) {
      router.replace('/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/orders');
    }
  }, [ready, session, segments, router]);

  return children;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AuthGate>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'slide_from_right',
                  contentStyle: { backgroundColor: colors.surface },
                }}
              />
            </AuthGate>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
