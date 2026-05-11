import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { AuthProvider } from "../src/context/AuthContext";
import { I18nProvider } from "../src/context/I18nContext";
import { OfflineBanner } from "../src/components/OfflineBanner";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={DefaultTheme}>
          <I18nProvider>
            <AuthProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: "fade",
                  animationDuration: 140,
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="product/[id]" />
              </Stack>
              <OfflineBanner />
            </AuthProvider>
          </I18nProvider>
          <StatusBar style="light" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
