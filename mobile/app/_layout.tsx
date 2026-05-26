import { useMemo } from "react";
import {
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { AuthProvider } from "../src/context/AuthContext";
import { I18nProvider } from "../src/context/I18nContext";
import { NetworkProvider } from "../src/context/NetworkContext";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import { OfflineScreen } from "../src/components/OfflineScreen";

// Keep the native splash visible until the auth bootstrap finishes
// (see app/index.tsx which calls SplashScreen.hideAsync once ready).
SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore if already hidden.
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedAppShell />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedAppShell() {
  const { tokens, scheme } = useTheme();
  const navTheme = useMemo(
    () => ({
      ...DefaultTheme,
      dark: scheme === "dark",
      colors: {
        ...DefaultTheme.colors,
        background: tokens.BG,
        card: tokens.BG,
        border: tokens.BG,
        text: tokens.TEXT,
        primary: tokens.GOLD,
        notification: tokens.GOLD,
      },
    }),
    [tokens, scheme]
  );

  return (
    <NavigationThemeProvider value={navTheme}>
      <I18nProvider>
        <NetworkProvider>
          <AuthProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                animation: "fade",
                animationDuration: 140,
                contentStyle: { backgroundColor: tokens.BG },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="product/[id]" />
            </Stack>
            <OfflineScreen />
          </AuthProvider>
        </NetworkProvider>
      </I18nProvider>
      <StatusBar style={tokens.STATUS_BAR === "light" ? "light" : "dark"} />
    </NavigationThemeProvider>
  );
}
