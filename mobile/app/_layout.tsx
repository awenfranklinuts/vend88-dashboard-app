import { useEffect, useState } from "react";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { AuthProvider } from "../src/context/AuthContext";
import { I18nProvider } from "../src/context/I18nContext";
import { NetworkProvider } from "../src/context/NetworkContext";
import { OfflineScreen } from "../src/components/OfflineScreen";
import { BG } from "../src/theme/tokens";

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: BG,
    card: BG,
    border: BG,
    text: "#ffffff",
  },
};

// Keep the native splash visible until startup providers mount.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore if already hidden.
});

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    const prepare = async () => {
      try {
        // Small minimum display so splash/logo does not flicker on fast starts.
        await new Promise((resolve) => setTimeout(resolve, 900));
      } finally {
        setAppIsReady(true);
      }
    };
    void prepare();
  }, []);

  useEffect(() => {
    if (!appIsReady) return;
    SplashScreen.hideAsync().catch(() => {
      // Ignore hide race conditions.
    });
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <I18nProvider>
            <NetworkProvider>
              <AuthProvider>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    animation: "fade",
                    animationDuration: 140,
                    contentStyle: { backgroundColor: BG },
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
          <StatusBar style="light" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
