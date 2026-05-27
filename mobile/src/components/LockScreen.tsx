import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useAppLock } from "../context/AppLockContext";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useThemeTokens } from "../context/ThemeContext";
import { haptic } from "../utils/haptics";
import { ThemeTokens } from "../theme/tokens";

// expo-local-authentication is optional at runtime — match the pattern used
// elsewhere so the bundle still evaluates without the dev-client rebuild.
type LocalAuthModule = typeof import("expo-local-authentication");
let LocalAuth: LocalAuthModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LocalAuth = require("expo-local-authentication");
} catch {
  LocalAuth = null;
}

type BiometricKind = "face" | "fingerprint" | "biometric";

/**
 * Animated lock mark — CommBank-inspired flipping diamond.
 *
 * Architecture: one flipping "card" container that owns the Y-axis rotation
 * and edge-on foreshortening. Inside the card, a rotated-45° gold square
 * forms the diamond shape, and an upright lock glyph sits centered on top
 * of it. Because the glyph lives INSIDE the flipping card, it always rides
 * the face (no sibling z-order issues, no clipping against the page bg).
 *
 * Behind the card a soft halo pulses each time a face comes square-on.
 * Pure RN Animated, native driver.
 */
function AnimatedLockMark({ tint, bg }: { tint: string; bg: string }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2800,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotateY = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Perspective foreshortening: scaleX narrows toward 0 at every 90°.
  const scaleX = spin.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 0.08, 1, 0.08, 1],
  });

  // Halo pulses on each face-on moment (twice per loop).
  const haloOpacity = spin.interpolate({
    inputRange: [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 1],
    outputRange: [0.55, 0.15, 0, 0.15, 0.55, 0.15, 0, 0.15, 0.55],
  });
  const haloScale = spin.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 1.35, 1, 1.35, 1],
  });

  // Subtle shading dip mid-flip.
  const faceOpacity = spin.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 0.85, 0.78, 0.85, 1],
  });

  return (
    <View style={lockMarkStyles.wrap} pointerEvents="none">
      {/* Soft halo behind the card */}
      <Animated.View
        style={[
          lockMarkStyles.halo,
          {
            backgroundColor: tint,
            opacity: haloOpacity,
            transform: [{ scale: haloScale }],
          },
        ]}
      />

      {/* Flipping card — owns the rotation and scale for both the diamond
          background and the lock glyph inside it. */}
      <Animated.View
        style={[
          lockMarkStyles.card,
          {
            opacity: faceOpacity,
            transform: [
              { perspective: 700 },
              { rotateY },
              { scaleX },
            ],
          },
        ]}
      >
        {/* Diamond background: a square rotated 45°. */}
        <View
          style={[
            lockMarkStyles.diamond,
            { backgroundColor: tint },
          ]}
        />
        {/* Upright lock glyph centered on the face. */}
        <View style={lockMarkStyles.glyph}>
          <Ionicons name="lock-closed" size={44} color={bg} />
        </View>
      </Animated.View>
    </View>
  );
}

const CARD = 108; // bounding box of the flipping card
const DIAMOND = 76; // edge length of the (un-rotated) square that forms the diamond

const lockMarkStyles = StyleSheet.create({
  wrap: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: CARD * 1.5,
    height: CARD * 1.5,
    borderRadius: (CARD * 1.5) / 2,
  },
  card: {
    width: CARD,
    height: CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  diamond: {
    position: "absolute",
    width: DIAMOND,
    height: DIAMOND,
    borderRadius: 12,
    transform: [{ rotate: "45deg" }],
  },
  glyph: {
    alignItems: "center",
    justifyContent: "center",
  },
});

export function LockScreen() {
  const { unlock } = useAppLock();
  const { signOut, email } = useAuth();
  const { t } = useI18n();
  const tokens = useThemeTokens();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<BiometricKind>("biometric");

  useEffect(() => {
    (async () => {
      if (!LocalAuth) return;
      try {
        const types = await LocalAuth.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION)) {
          setKind("face");
        } else if (types.includes(LocalAuth.AuthenticationType.FINGERPRINT)) {
          setKind("fingerprint");
        } else {
          setKind("biometric");
        }
      } catch {
        setKind("biometric");
      }
    })();
  }, []);

  const tryUnlock = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await unlock(t("lock_prompt"));
    if (ok) {
      haptic.success();
    } else {
      haptic.error();
      setFailed(true);
    }
    setBusy(false);
  }, [busy, unlock, t]);

  const handleSignOut = useCallback(async () => {
    haptic.warning();
    await signOut();
  }, [signOut]);

  const iconName: keyof typeof Ionicons.glyphMap =
    kind === "face" ? "scan-outline" : "finger-print";

  const buttonLabel =
    kind === "face"
      ? t("lock_use_face_id")
      : kind === "fingerprint"
        ? t("lock_use_fingerprint")
        : t("lock_use_biometric");

  return (
    <View style={styles.root} pointerEvents="auto">
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.body}>
          <AnimatedLockMark tint={tokens.GOLD} bg={tokens.BG} />
          <Text style={styles.title}>{t("lock_title")}</Text>
          <Text style={styles.subtitle}>
            {email ? t("lock_subtitle_signed_in", { email }) : t("lock_subtitle")}
          </Text>

          <Pressable
            accessibilityLabel={buttonLabel}
            onPress={tryUnlock}
            disabled={busy}
            style={({ pressed }) => [
              styles.unlockBtn,
              pressed && styles.unlockBtnPressed,
              busy && { opacity: 0.6 },
            ]}
          >
            <Ionicons name={iconName} size={18} color={tokens.TEXT_INVERSE} />
            <Text style={styles.unlockText}>
              {busy ? t("lock_authenticating") : buttonLabel}
            </Text>
          </Pressable>

          {failed ? (
            <Text style={styles.failedHint}>{t("lock_failed_hint")}</Text>
          ) : (
            <Text style={styles.hint}>{t("lock_hint")}</Text>
          )}
        </View>

        <Pressable
          accessibilityLabel={t("settings_sign_out")}
          onPress={handleSignOut}
          style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="log-out-outline" size={14} color={tokens.DANGER} />
          <Text style={styles.signOutText}>{t("settings_sign_out")}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.BG,
      zIndex: 9999,
      elevation: 9999,
    },
    safe: {
      flex: 1,
      justifyContent: "space-between",
      paddingHorizontal: 24,
    },
    body: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      paddingHorizontal: 12,
    },
    title: {
      color: t.TEXT,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.2,
      marginTop: 4,
    },
    subtitle: {
      color: t.TEXT_DIM,
      fontSize: 13,
      textAlign: "center",
      maxWidth: 280,
    },
    unlockBtn: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: t.GOLD,
      paddingVertical: 14,
      paddingHorizontal: 22,
      borderRadius: 14,
      minWidth: 220,
    },
    unlockBtnPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.99 }],
    },
    unlockText: {
      color: t.TEXT_INVERSE,
      fontWeight: "700",
      fontSize: 14,
      letterSpacing: 0.4,
    },
    hint: {
      color: t.TEXT_DIM,
      fontSize: 12,
      marginTop: 6,
    },
    failedHint: {
      color: t.DANGER,
      fontSize: 12,
      marginTop: 6,
    },
    signOutBtn: {
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 14,
      backgroundColor: t.CARD,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.CARD_BORDER,
      marginBottom: 8,
    },
    signOutText: {
      color: t.DANGER,
      fontWeight: "600",
      fontSize: 12,
    },
  });
