import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { useThemeTokens } from "../context/ThemeContext";
import { haptic } from "../utils/haptics";
import { RADIUS_LG, ThemeTokens } from "../theme/tokens";

const RING_BASE = 96;

type Styles = ReturnType<typeof makeStyles>;

function PulsingRing({ delay, color, styles }: { delay: number; color: string; styles: Styles }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: 2400,
        easing: Easing.out(Easing.quad),
      }),
      -1,
      false
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const style = useAnimatedStyle(() => {
    const p = (progress.value + delay) % 1;
    return {
      transform: [{ scale: 1 + p * 1.6 }],
      opacity: 0.45 * (1 - p),
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        { borderColor: color },
        style,
      ]}
    />
  );
}

function ConnectingDot({ styles }: { styles: Styles }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => cancelAnimation(v);
  }, [v]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.3 + v.value * 0.7,
    transform: [{ scale: 0.9 + v.value * 0.25 }],
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

export function OfflineScreen() {
  const { online, checking, hasBeenOnline, recheck } = useNetwork();
  const { t } = useI18n();
  const tokens = useThemeTokens();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [tryingAt, setTryingAt] = useState<number | null>(null);

  const onRetry = useCallback(async () => {
    haptic.selection();
    setTryingAt(Date.now());
    await recheck();
  }, [recheck]);

  if (online) return null;
  // When offline but we've been online earlier in the session, the app likely
  // has cached data to keep showing — defer to the lightweight OfflineNotice
  // banner instead of taking over the screen.
  if (hasBeenOnline) return null;

  const busy = checking;

  return (
    <View style={styles.root} pointerEvents="auto">
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.body}>
          <View style={styles.iconWrap}>
            <PulsingRing delay={0} color={tokens.GOLD} styles={styles} />
            <PulsingRing delay={0.5} color={tokens.GOLD} styles={styles} />
            <View style={styles.iconCircle}>
              <Ionicons name="cloud-offline-outline" size={40} color={tokens.GOLD} />
            </View>
          </View>

          <View style={styles.textBlock}>
            <Text style={styles.title}>{t("offline_title")}</Text>
            <Text style={styles.subtitle}>{t("offline_subtitle")}</Text>
          </View>

          <View style={styles.tipsCard}>
            <TipRow icon="wifi-outline" text={t("offline_tip_wifi")} styles={styles} tokens={tokens} />
            <View style={styles.tipDivider} />
            <TipRow icon="cellular-outline" text={t("offline_tip_cellular")} styles={styles} tokens={tokens} />
            <View style={styles.tipDivider} />
            <TipRow icon="airplane-outline" text={t("offline_tip_airplane")} styles={styles} tokens={tokens} />
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityLabel={t("offline_retry")}
            disabled={busy}
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retryBtn,
              pressed && styles.retryBtnPressed,
              busy && styles.retryBtnBusy,
            ]}
          >
            <Ionicons
              name={busy ? "sync-outline" : "refresh-outline"}
              size={16}
              color={tokens.TEXT_INVERSE}
            />
            <Text style={styles.retryText}>
              {busy ? t("offline_checking") : t("offline_retry")}
            </Text>
          </Pressable>

          <View style={styles.statusRow}>
            <ConnectingDot styles={styles} />
            <Text style={styles.statusText}>
              {tryingAt
                ? t("offline_no_connection_last_try")
                : t("offline_auto_reconnect")}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function TipRow({
  icon,
  text,
  styles,
  tokens,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  styles: Styles;
  tokens: ThemeTokens;
}) {
  return (
    <View style={styles.tipRow}>
      <View style={styles.tipIconWrap}>
        <Ionicons name={icon} size={14} color={tokens.GOLD} />
      </View>
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.BG,
      zIndex: 10000,
      elevation: 10000,
    },
    safe: {
      flex: 1,
      paddingHorizontal: 24,
      justifyContent: "space-between",
    },
    body: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 28,
    },
    iconWrap: {
      width: RING_BASE,
      height: RING_BASE,
      alignItems: "center",
      justifyContent: "center",
    },
    ring: {
      position: "absolute",
      width: RING_BASE,
      height: RING_BASE,
      borderRadius: RING_BASE / 2,
      borderWidth: 1,
    },
    iconCircle: {
      width: RING_BASE,
      height: RING_BASE,
      borderRadius: RING_BASE / 2,
      backgroundColor: t.GOLD_DIM,
      borderWidth: 1,
      borderColor: t.GOLD_DIM,
      alignItems: "center",
      justifyContent: "center",
    },
    textBlock: {
      alignItems: "center",
      gap: 8,
      maxWidth: 320,
    },
    title: {
      color: t.TEXT,
      fontSize: 24,
      fontWeight: "800",
      letterSpacing: -0.3,
      textAlign: "center",
    },
    subtitle: {
      color: t.TEXT_DIM,
      fontSize: 13,
      fontWeight: "500",
      textAlign: "center",
      lineHeight: 19,
    },
    tipsCard: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: t.CARD,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.CARD_BORDER,
      borderRadius: RADIUS_LG,
      paddingVertical: 6,
      paddingHorizontal: 14,
    },
    tipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
    },
    tipIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: t.GOLD_DIM,
      alignItems: "center",
      justifyContent: "center",
    },
    tipText: {
      flex: 1,
      color: t.TEXT_DIM,
      fontSize: 12.5,
      fontWeight: "500",
      letterSpacing: -0.1,
    },
    tipDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.CARD_BORDER,
      marginLeft: 40,
    },
    footer: {
      alignItems: "center",
      gap: 14,
      paddingBottom: 8,
    },
    retryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: t.GOLD,
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 14,
      minWidth: 220,
    },
    retryBtnPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.99 }],
    },
    retryBtnBusy: {
      opacity: 0.6,
    },
    retryText: {
      color: t.TEXT_INVERSE,
      fontSize: 14,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: t.GOLD,
    },
    statusText: {
      color: t.TEXT_FAINT,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
  });
