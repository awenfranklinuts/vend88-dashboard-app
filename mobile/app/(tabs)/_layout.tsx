import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { useAuth } from "@/src/context/AuthContext";
import { Skeleton } from "@/src/components/Skeleton";
import { haptic } from "@/src/utils/haptics";
import { BG, CARD_BORDER, GOLD, TEXT_FAINT } from "@/src/theme/tokens";

function HapticTabButton(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        haptic.selection();
        props.onPressIn?.(ev);
      }}
    />
  );
}

export default function TabLayout() {
  const { token, loading } = useAuth();

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
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: TEXT_FAINT,
        tabBarButton: (props) => <HapticTabButton {...props} />,
        tabBarStyle: {
          height: 72,
          paddingTop: 10,
          paddingBottom: 16,
          backgroundColor: BG,
          borderTopWidth: 1,
          borderTopColor: CARD_BORDER,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "grid" : "grid-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: "Sales",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "bar-chart" : "bar-chart-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: "Products",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "cube" : "cube-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Modules",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "apps" : "apps-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
