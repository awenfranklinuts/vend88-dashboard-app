import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  AppStateStatus,
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
 * Animated lock mark — no bubble background. Renders three concentric,
 * pulsing accent rings behind a subtle "breathing" lock glyph. The rings
 * stagger their phase so the effect reads as a calm radar pulse rather
 * than a heartbeat. Pure RN Animated (no extra deps).
 */
function AnimatedLockMark({ tint, bg }: { tint: string; bg: string }) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loopRing = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 2400,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
    const r1 = loopRing(ring1, 0);
    const r2 = loopRing(ring2, 800);
    const r3 = loopRing(ring3, 1600);
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    r1.start();
    r2.start();
    r3.start();
    b.start();
    return () => {
      r1.stop();
      r2.stop();
      r3.stop();
      b.stop();
    };
  }, [ring1, ring2, ring3, breathe]);

  const ringStyle = (val: Animated.Value): any => ({
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.2,
    borderColor: tint,
    opacity: val.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] }),
    transform: [
      {
        scale: val.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.2] }),
      },
    ],
  });

  const lockScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const shackleY = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -1.5],
  });

  return (
    <View style={lockMarkStyles.wrap} pointerEvents="none">
      <Animated.View style={ringStyle(ring1)} />
      <Animated.View style={ringStyle(ring2)} />
      <Animated.View style={ringStyle(ring3)} />

      {/* Custom lock built from primitives — shackle (arc) + body (rounded
          rect) + keyhole dot. Avoids the round icon bubble entirely. */}
      <Animated.View style={[lockMarkStyles.lock, { transform: [{ scale: lockScale }] }]}>
        <Animated.View
          style={[
            lockMarkStyles.shackle,
            { borderColor: tint, transform: [{ translateY: shackleY }] },
          ]}
        />
        <View style={[lockMarkStyles.body, { backgroundColor: tint }]}>
          <View style={[lockMarkStyles.keyhole, { backgroundColor: bg }]} />
          <View style={[lockMarkStyles.keyholeStem, { backgroundColor: bg }]} />
        </View>
      </Animated.View>
    </View>
  );
}

const lockMarkStyles = StyleSheet.create({
  wrap: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  lock: {
    width: 56,
    height: 64,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  shackle: {
    width: 30,
    height: 28,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 4,
    borderBottomWidth: 0,
    marginBottom: -2,
  },
  body: {
    width: 44,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  keyhole: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  keyholeStem: {
    width: 3,
    height: 7,
    marginTop: -1,
    borderRadius: 1,
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
  const promptedRef = useRef(false);

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

  // Auto-prompt once when the lock screen mounts.
  useEffect(() => {
    if (promptedRef.current) return;
    promptedRef.current = true;
    void tryUnlock();
  }, [tryUnlock]);

  // Re-prompt automatically when the app comes back to the foreground while locked.
  useEffect(() => {
    let lastState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      if (lastState !== "active" && next === "active" && !busy) {
        void tryUnlock();
      }
      lastState = next;
    });
    return () => sub.remove();
  }, [busy, tryUnlock]);

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
