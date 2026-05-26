import React from "react";
import { View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { useI18n } from "../../src/context/I18nContext";
import { AppLockProvider, useAppLock } from "../../src/context/AppLockContext";
import { Skeleton } from "../../src/components/Skeleton";
import { IslandTabBar } from "../../src/components/IslandTabBar";
import { LockScreen } from "../../src/components/LockScreen";
import { useThemeTokens } from "../../src/context/ThemeContext";

function TabsWithLock() {
  const { t } = useI18n();
  const { locked } = useAppLock();
  const tokens = useThemeTokens();

  return (
    <View style={{ flex: 1, backgroundColor: tokens.BG }}>
      <Tabs
        tabBar={(props) => <IslandTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: tokens.BG },
        }}
      >
        <Tabs.Screen name="index" options={{ title: t("tab_dashboard") }} />
        <Tabs.Screen name="sales" options={{ title: t("tab_sales") }} />
        {/* Products tab temporarily hidden — keep route mounted but exclude from the tab bar. */}
        <Tabs.Screen name="products" options={{ title: t("tab_products"), href: null }} />
        <Tabs.Screen name="stores" options={{ title: t("tab_stores") }} />
        {/* Modules tab hidden from interface — keep route available for internal navigation. */}
        <Tabs.Screen name="explore" options={{ title: t("tab_modules"), href: null }} />
        <Tabs.Screen name="settings" options={{ title: t("tab_settings") }} />
        <Tabs.Screen name="handover" options={{ title: t("tab_handover") }} />
      </Tabs>
      {locked ? <LockScreen /> : null}
    </View>
  );
}

export default function TabLayout() {
  const { token, loading } = useAuth();
  const tokens = useThemeTokens();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.BG, padding: 20, paddingTop: 80 }}>
        <Skeleton height={28} width="40%" />
        <View style={{ height: 16 }} />
        <Skeleton height={90} radius={18} />
        <View style={{ height: 10 }} />
        <Skeleton height={90} radius={18} />
      </View>
    );
  }

  if (!token) {
    return <Redirect href="/login" />;
  }

  return (
    <AppLockProvider>
      <TabsWithLock />
    </AppLockProvider>
  );
}
