import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import { AuthProvider } from "@/src/context/AuthContext";
import { I18nProvider } from "@/src/context/I18nContext";
import { OfflineBanner } from "@/src/components/OfflineBanner";

export default function RootLayout() {
  return (
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
            </Stack>
            <OfflineBanner />
          </AuthProvider>
        </I18nProvider>
        <StatusBar style="light" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
