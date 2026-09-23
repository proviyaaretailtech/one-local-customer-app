import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import Head from "expo-router/head";
import { LogBox, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { CartProvider } from "@/src/cart";
import { AppShell } from '@/src/components/app-shell';
import { colors } from '@/src/theme';
import { CityMotionProvider } from '@/src/motion';
import { CustomerProvider } from '@/src/customer';
import { AuthProvider } from '@/src/auth';
import { IntroSplash } from '@/src/components/intro-splash';
import { CompareProvider } from '@/src/compare';
import { AppFrame } from '@/src/layout';

LogBox.ignoreAllLogs(true);

// Icon prewarm for expo go android - keep this logic
const prewarmIcons = () => {
  if (Platform.OS === "android") {
    try {
      const IonIcons = require("@react-native-vector-icons/ionicons").default;
      // no-op reference to warm the font
      IonIcons?.getImageSource?.("cart", 24);
    } catch {}
  }
};

export default function RootLayout() {
  useEffect(() => {
    prewarmIcons();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <CartProvider>
              <StatusBar style="dark" />
              <Head><title>OneCity</title></Head>
              <CustomerProvider><AuthProvider><CompareProvider><CityMotionProvider><AppFrame><AppShell><Stack screenOptions={{ headerShown: false, title: 'OneCity', animation: 'slide_from_right', contentStyle: { backgroundColor: colors.surface } }} /></AppShell><IntroSplash /></AppFrame></CityMotionProvider></CompareProvider></AuthProvider></CustomerProvider>
            </CartProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
