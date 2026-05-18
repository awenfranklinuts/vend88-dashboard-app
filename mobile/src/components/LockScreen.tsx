import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  AppStateStatus,
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
import { haptic } from "../utils/haptics";
import {
  BG,
  CARD,
  CARD_BORDER,
  DANGER,
  GOLD,
  GOLD_DIM,
  TEXT,
  TEXT_DIM,
} from "../theme/tokens";

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

export function LockScreen() {
  const { unlock } = useAppLock();
  const { signOut, email } = useAuth();
  const { t } = useI18n();
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
          <View style={styles.iconCircle}>
            <Ionicons name="lock-closed" size={32} color={GOLD} />
          </View>
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
            <Ionicons name={iconName} size={18} color={BG} />
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
          <Ionicons name="log-out-outline" size={14} color={DANGER} />
          <Text style={styles.signOutText}>{t("settings_sign_out")}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
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
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: GOLD_DIM,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  title: {
    color: TEXT,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.2,
    marginTop: 4,
  },
  subtitle: {
    color: TEXT_DIM,
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
    backgroundColor: GOLD,
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
    color: BG,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.4,
  },
  hint: {
    color: TEXT_DIM,
    fontSize: 12,
    marginTop: 6,
  },
  failedHint: {
    color: DANGER,
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
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    marginBottom: 8,
  },
  signOutText: {
    color: DANGER,
    fontWeight: "600",
    fontSize: 12,
  },
});
