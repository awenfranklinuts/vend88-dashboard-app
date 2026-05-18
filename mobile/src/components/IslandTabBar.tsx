import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "../utils/haptics";
import {
  ACCENT,
  CARD_BORDER,
  GOLD,
  TEXT,
  TEXT_DIM,
  TEXT_FAINT,
} from "../theme/tokens";

type IconName = keyof typeof Ionicons.glyphMap;

const ICON_MAP: Record<string, { on: IconName; off: IconName }> = {
  index: { on: "grid", off: "grid-outline" },
  sales: { on: "bar-chart", off: "bar-chart-outline" },
  products: { on: "cube", off: "cube-outline" },
  stores: { on: "storefront", off: "storefront-outline" },
  explore: { on: "apps", off: "apps-outline" },
  settings: { on: "settings", off: "settings-outline" },
  handover: { on: "swap-horizontal", off: "swap-horizontal-outline" },
};

// Routes shown as the always-visible primary icons. Anything not listed here
// becomes part of the expandable "More" panel.
// Note: "products" is temporarily hidden — re-add it here when ready.
const PRIMARY_ROUTES = ["index", "sales", "stores", "settings"];

// Routes surfaced inside the expandable panel (label + helper text).
const MORE_META: Record<
  string,
  { label: string; hint: string; tint: string; icon: IconName }
> = {
  handover: {
    label: "Handover & End of Day",
    hint: "Staff session, sales summary and closing report",
    tint: GOLD,
    icon: "swap-horizontal",
  },
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
          { opacity: anim, transform: [{ scale: anim }] },
        ]}
      />
    </Pressable>
  );
}

export function IslandTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  // Primary visible routes (in declared order).
  const primaryRoutes = state.routes.filter((r) => PRIMARY_ROUTES.includes(r.name));
  // Routes available in the "more" expandable panel.
  const moreRoutes = state.routes.filter((r) => MORE_META[r.name]);

  // If user is currently on a "more" destination, reflect it as active in
  // the chevron tint even though no primary tab is highlighted.
  const focusedRoute = state.routes[state.index];
  const focusedIsMore = !!MORE_META[focusedRoute?.name ?? ""];

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: expanded ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [expanded, expandAnim]);

  // Auto-collapse the panel whenever the active tab changes.
  useEffect(() => {
    setExpanded(false);
  }, [state.index]);

  const toggleExpanded = () => {
    haptic.selection();
    setExpanded((v) => !v);
  };

  const panelOpacity = expandAnim;
  const panelTranslate = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  const chevronRotate = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const renderTab = (route: (typeof state.routes)[number]) => {
    const index = state.routes.findIndex((r) => r.key === route.key);
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
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      {expanded && (
        <Pressable
          accessibilityLabel="Close menu"
          onPress={() => setExpanded(false)}
          style={styles.scrim}
        />
      )}

      <Animated.View
        pointerEvents={expanded ? "auto" : "none"}
        style={[
          styles.panel,
          {
            opacity: panelOpacity,
            transform: [{ translateY: panelTranslate }],
          },
        ]}
      >
        <Text style={styles.panelTitle}>More</Text>
        {moreRoutes.length === 0 ? (
          <Text style={styles.panelEmpty}>No additional sections.</Text>
        ) : (
          moreRoutes.map((route, idx) => {
            const meta = MORE_META[route.name];
            const focused = state.routes[state.index]?.key === route.key;
            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!event.defaultPrevented) {
                haptic.selection();
                navigation.navigate(route.name as never, route.params as never);
                setExpanded(false);
              }
            };
            return (
              <Pressable
                key={route.key}
                accessibilityLabel={meta.label}
                accessibilityRole="button"
                onPress={onPress}
                style={({ pressed }) => [
                  styles.panelItem,
                  idx > 0 && styles.panelItemDivider,
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.panelIcon,
                    {
                      backgroundColor: `${meta.tint}22`,
                      borderColor: `${meta.tint}55`,
                    },
                  ]}
                >
                  <Ionicons name={meta.icon} size={18} color={meta.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.panelItemLabel, focused && { color: GOLD }]}
                    numberOfLines={1}
                  >
                    {meta.label}
                  </Text>
                  <Text style={styles.panelItemHint} numberOfLines={1}>
                    {meta.hint}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={TEXT_DIM} />
              </Pressable>
            );
          })
        )}
      </Animated.View>

      <View style={styles.island}>
        <View style={styles.islandRow}>{primaryRoutes.map(renderTab)}</View>
        {moreRoutes.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Hide more sections" : "Show more sections"}
            accessibilityState={{ expanded }}
            onPress={toggleExpanded}
            hitSlop={6}
            style={({ pressed }) => [
              styles.chevronHandle,
              pressed && styles.pressed,
            ]}
          >
            <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
              <Ionicons
                name="chevron-up"
                size={14}
                color={expanded || focusedIsMore ? GOLD : TEXT_DIM}
              />
            </Animated.View>
          </Pressable>
        )}
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
  scrim: {
    position: "absolute",
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  panel: {
    width: "100%",
    maxWidth: 420,
    marginBottom: 10,
    backgroundColor: "rgba(22,27,51,0.97)",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 8,
    paddingHorizontal: 6,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 12 },
      },
      android: { elevation: 16 },
    }),
  },
  panelTitle: {
    color: TEXT_DIM,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  panelEmpty: {
    color: TEXT_DIM,
    fontSize: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  panelItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 12,
  },
  panelItemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CARD_BORDER,
    borderRadius: 0,
  },
  panelIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  panelItemLabel: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  panelItemHint: {
    color: TEXT_DIM,
    fontSize: 11,
    marginTop: 2,
  },

  island: {
    flexDirection: "column",
    alignItems: "stretch",
    backgroundColor: "rgba(22,27,51,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 28,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
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
  islandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chevronHandle: {
    alignSelf: "center",
    marginTop: 2,
    paddingVertical: 4,
    paddingHorizontal: 22,
    borderRadius: 8,
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
  accent: { color: ACCENT },
});
