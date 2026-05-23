import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useNetwork } from "../context/NetworkContext";
import { useI18n } from "../context/I18nContext";
import { haptic } from "../utils/haptics";
import { GOLD, TEXT } from "../theme/tokens";

/**
 * Inline, non-blocking strip shown when the device is offline but the session
 * has cached data (i.e. we previously reached the API). Rendered at the top of
 * each screen — above the page header / date — so the user knows they're
 * looking at the latest available data while we silently retry.
 */
export function OfflineNotice() {
  const { online, hasBeenOnline, checking, recheck } = useNetwork();
  const { t } = useI18n();

  const visible = !online && hasBeenOnline;

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => cancelAnimation(pulse);
  }, [visible, pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.65,
    transform: [{ scale: 0.85 + pulse.value * 0.4 }],
  }));

  if (!visible) return null;

  const onTap = () => {
    if (checking) return;
    haptic.selection();
    void recheck();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("offline_notice_label")}
      onPress={onTap}
      style={({ pressed }) => [styles.strip, pressed && styles.stripPressed]}
    >
      <View style={styles.row}>
        <Animated.View style={[styles.dot, dotStyle]} />
        <Ionicons name="cloud-offline-outline" size={13} color={GOLD} />
        <Text style={styles.text} numberOfLines={1}>
          {checking ? t("offline_checking") : t("offline_notice_label")}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    width: "100%",
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "rgba(212,175,55,0.08)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(212,175,55,0.28)",
  },
  stripPressed: {
    opacity: 0.85,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GOLD,
  },
  text: {
    color: TEXT,
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
