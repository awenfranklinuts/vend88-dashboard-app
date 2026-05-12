import React from "react";
import { View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { useI18n } from "../../src/context/I18nContext";
import { Skeleton } from "../../src/components/Skeleton";
import { IslandTabBar } from "../../src/components/IslandTabBar";
import { BG } from "../../src/theme/tokens";

export default function TabLayout() {
  const { token, loading } = useAuth();
  const { t } = useI18n();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, padding: 20, paddingTop: 80 }}>
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
    <Tabs
      tabBar={(props) => <IslandTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: BG },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("tab_dashboard") }} />
      <Tabs.Screen name="sales" options={{ title: t("tab_sales") }} />
      {/* Products tab temporarily hidden — keep route mounted but exclude from the tab bar. */}
      <Tabs.Screen name="products" options={{ title: t("tab_products"), href: null }} />
      <Tabs.Screen name="stores" options={{ title: t("tab_stores") }} />
      <Tabs.Screen name="explore" options={{ title: t("tab_modules") }} />
      <Tabs.Screen name="settings" options={{ title: t("tab_settings") }} />
      <Tabs.Screen name="handover" options={{ title: t("tab_handover") }} />
    </Tabs>
  );
}
