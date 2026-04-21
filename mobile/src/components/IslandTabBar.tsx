import React, { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "@/src/utils/haptics";
import { BG, GOLD, TEXT, TEXT_FAINT } from "@/src/theme/tokens";

type IconName = keyof typeof Ionicons.glyphMap;

const ICON_MAP: Record<string, { on: IconName; off: IconName }> = {
  index: { on: "grid", off: "grid-outline" },
  sales: { on: "bar-chart", off: "bar-chart-outline" },
  products: { on: "cube", off: "cube-outline" },
  explore: { on: "apps", off: "apps-outline" },
  settings: { on: "settings", off: "settings-outline" },
};

function TabItem({
  focused,
  label,
  iconOn,
  iconOff,
  onPress,
  onLongPress,
}: {
  focused: boolean;
  label: string;
  iconOn: IconName;
  iconOff: IconName;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      tension: 160,
      friction: 14,
    }).start();
  }, [focused, anim]);

  const iconTranslate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, -2],
  });
  const dotScale = anim;
  const dotOpacity = anim;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
    >
      <Animated.View style={{ transform: [{ translateY: iconTranslate }] }}>
        <Ionicons
          name={focused ? iconOn : iconOff}
          size={22}
          color={focused ? GOLD : TEXT_FAINT}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.dot,
          { opacity: dotOpacity, transform: [{ scale: dotScale }] },
        ]}
      />
    </Pressable>
  );
}

export function IslandTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View style={styles.island}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label =
            typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : options.title ?? route.name;

          const icons = ICON_MAP[route.name] ?? {
            on: "ellipse" as IconName,
            off: "ellipse-outline" as IconName,
          };

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              haptic.selection();
              navigation.navigate(route.name as never, route.params as never);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          return (
            <TabItem
              key={route.key}
              focused={focused}
              label={label}
              iconOn={icons.on}
              iconOff={icons.off}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 6,
    backgroundColor: "transparent",
  },
  island: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(22,27,51,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 32,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: "100%",
    maxWidth: 420,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
      },
      android: {
        elevation: 14,
      },
    }),
  },
  item: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  pressed: {
    opacity: 0.6,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: GOLD,
    marginTop: 2,
  },
  // unused — retained to silence type-check aware lint configs; harmless.
  label: { color: TEXT },
});
