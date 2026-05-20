import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";

import Constants from "expo-constants";
import { useAuth } from "../../src/context/AuthContext";
import { Language, useI18n } from "../../src/context/I18nContext";
import {
  LOCK_GRACE_DEFAULT_MS,
  LOCK_GRACE_OPTIONS,
  useAppLock,
} from "../../src/context/AppLockContext";
import { api } from "../../src/services/api";
import { haptic } from "../../src/utils/haptics";
import {
  BG,
  CARD,
  CARD_BORDER,
  DANGER,
  DANGER_DIM,
  GOLD,
  TEXT,
  TEXT_DIM,
  SCREEN_PADDING,
} from "../../src/theme/tokens";
import { ScreenHeader } from "../../src/components/ScreenHeader";

const NOTIFY_KEY = "vend88-notifications-enabled";
const AUTH_TOKEN_KEY = "vend88-auth-token";
const AUTH_EMAIL_KEY = "vend88-auth-email";

type AdminProfileResponse = {
  status_code?: number;
  email?: string;
  first_name?: string;
  last_name?: string;
};

function toDisplayName(email: string, fallbackName: string, firstName?: string, lastName?: string): string {
  const fullName = [firstName, lastName]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .join(" ");

  if (fullName) {
    return fullName;
  }

  const localPart = email.split("@")[0] ?? "";
  if (!localPart) {
    return fallbackName;
  }

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "V8";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  hint?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
};

function Row({ icon, iconColor = GOLD, label, hint, right, onPress, destructive }: RowProps) {
  const content = (
    <View style={styles.row}>
      <View
        style={[
          styles.rowIcon,
          { backgroundColor: destructive ? DANGER_DIM : "rgba(212,175,55,0.12)" },
        ]}
      >
        <Ionicons name={icon} size={16} color={destructive ? DANGER : iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, destructive && { color: DANGER }]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={TEXT_DIM} /> : null)}
    </View>
  );

  if (!onPress) return <View style={styles.rowWrap}>{content}</View>;
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={({ pressed }) => [styles.rowWrap, pressed && { opacity: 0.85 }]}
    >
      {content}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { language, languageLabel, setLanguage, t } = useI18n();
  const {
    enabled: biometric,
    supported: biometricSupported,
    graceMs,
    enable: enableLock,
    disable: disableLock,
    lockNow,
    setGraceMs,
  } = useAppLock();
  const defaultProfileName = t("settings_app_name");
  const [notifications, setNotifications] = useState(true);
  const [profileName, setProfileName] = useState(defaultProfileName);
  const [profileEmail, setProfileEmail] = useState("accounts@vend88.com");

  useEffect(() => {
    (async () => {
      const [notif, storedEmail, storedToken] = await Promise.all([
        SecureStore.getItemAsync(NOTIFY_KEY),
        SecureStore.getItemAsync(AUTH_EMAIL_KEY),
        SecureStore.getItemAsync(AUTH_TOKEN_KEY),
      ]);

      if (notif !== null) setNotifications(notif === "1");

      const email = storedEmail?.trim();
      if (email) {
        setProfileEmail(email);
        setProfileName(toDisplayName(email, defaultProfileName));
      }

      if (!storedToken) {
        return;
      }

      try {
        const response = await api.post<AdminProfileResponse>("/admin/profile", {
          token: storedToken,
        });
        const data = response.data;
        if (data?.status_code !== 200) {
          return;
        }

        const nextEmail = (data.email ?? email ?? "").trim();
        if (nextEmail) {
          setProfileEmail(nextEmail);
        }
        setProfileName(
          toDisplayName(nextEmail || "", defaultProfileName, data.first_name, data.last_name)
        );
      } catch {
        // Keep fallback profile values from local session data.
      }
    })();
  }, [defaultProfileName]);

  useEffect(() => {
    if (!profileEmail || profileEmail === "admin@vend88.app") {
      setProfileName(defaultProfileName);
    }
  }, [defaultProfileName, profileEmail]);

  const toggleBiometric = async (value: boolean) => {
    haptic.selection();
    const ok = value
      ? await enableLock(t("settings_enable_biometric"))
      : await disableLock(t("settings_disable_biometric"));
    if (!ok) {
      haptic.error();
      return;
    }
    haptic.success();
  };

  const selectGracePeriod = () => {
    haptic.selection();
    Alert.alert(
      t("settings_lock_grace"),
      t("settings_lock_grace_hint"),
      [
        ...LOCK_GRACE_OPTIONS.map((opt) => ({
          text:
            opt.value === graceMs
              ? `${t(opt.key as Parameters<typeof t>[0])} \u2713`
              : t(opt.key as Parameters<typeof t>[0]),
          onPress: () => {
            void setGraceMs(opt.value);
          },
        })),
        { text: t("common_cancel"), style: "cancel" as const },
      ]
    );
  };

  const handleLockNow = () => {
    if (!biometric || !biometricSupported) return;
    haptic.warning();
    lockNow();
  };

  const graceLabel = (() => {
    const match = LOCK_GRACE_OPTIONS.find((opt) => opt.value === graceMs);
    const fallback = LOCK_GRACE_OPTIONS.find(
      (opt) => opt.value === LOCK_GRACE_DEFAULT_MS
    );
    const key = (match ?? fallback ?? LOCK_GRACE_OPTIONS[0]).key as Parameters<typeof t>[0];
    return t(key);
  })();

  const toggleNotifications = async (value: boolean) => {
    haptic.selection();
    setNotifications(value);
    await SecureStore.setItemAsync(NOTIFY_KEY, value ? "1" : "0");
  };

  const confirmSignOut = () => {
    haptic.warning();
    Alert.alert(t("settings_sign_out_title"), t("settings_sign_out_confirm"), [
      { text: t("common_cancel"), style: "cancel" },
      {
        text: t("settings_sign_out"),
        style: "destructive",
        onPress: async () => {
          haptic.success();
          await signOut();
        },
      },
    ]);
  };

  const selectLanguage = () => {
    const options: { lang: Language; label: string }[] = [
      { lang: "en", label: languageLabel("en") },
      { lang: "zh", label: languageLabel("zh") },
      { lang: "id", label: languageLabel("id") },
    ];

    Alert.alert(
      t("settings_language"),
      t("settings_choose_language"),
      [
        ...options.map((option) => ({
          text: option.lang === language ? `${option.label} ✓` : option.label,
          onPress: () => {
            void setLanguage(option.lang);
          },
        })),
        { text: t("common_cancel"), style: "cancel" as const },
      ]
    );
  };

  const version =
    (Constants.expoConfig?.version as string | undefined) ??
    (Constants as any).manifest?.version ??
    "1.0.0";

  return (
    <SafeAreaView style={styles.safeContainer} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 132 + Math.max(insets.bottom, 12) },
        ]}
        scrollIndicatorInsets={{ bottom: 132 + Math.max(insets.bottom, 12) }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          eyebrow="ACCOUNT"
          title={t("settings_title")}
          subtitle={t("settings_subtitle")}
        />

        {/* Profile */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{toInitials(profileName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{profileName}</Text>
            <Text style={styles.profileEmail}>{profileEmail}</Text>
          </View>
        </View>

        {/* Security */}
        <Text style={styles.sectionLabel}>{t("settings_security")}</Text>
        <View style={styles.group}>
          <Row
            icon="finger-print-outline"
            label={t("settings_biometric_lock")}
            hint={
              biometricSupported
                ? t("settings_require_biometric")
                : t("settings_biometric_unavailable")
            }
            right={
              <Switch
                value={biometric}
                onValueChange={toggleBiometric}
                disabled={!biometricSupported}
                trackColor={{ false: "rgba(255,255,255,0.1)", true: "rgba(212,175,55,0.5)" }}
                thumbColor={biometric ? GOLD : "#f4f4f5"}
              />
            }
          />
          {biometric && biometricSupported ? (
            <>
              <View style={styles.divider} />
              <Row
                icon="time-outline"
                label={t("settings_lock_grace")}
                hint={graceLabel}
                onPress={selectGracePeriod}
              />
              <View style={styles.divider} />
              <Row
                icon="lock-closed-outline"
                label={t("settings_lock_now")}
                hint={t("settings_lock_now_hint")}
                onPress={handleLockNow}
              />
            </>
          ) : null}
          <View style={styles.divider} />
          <Row
            icon="key-outline"
            label={t("settings_change_password")}
            hint={t("settings_update_password")}
            onPress={() => Alert.alert(t("common_coming_soon"), t("settings_password_unavailable"))}
          />
        </View>

        {/* Preferences */}
        <Text style={styles.sectionLabel}>{t("settings_preferences")}</Text>
        <View style={styles.group}>
          <Row
            icon="notifications-outline"
            label={t("settings_notifications")}
            hint={t("settings_push_alerts")}
            right={
              <Switch
                value={notifications}
                onValueChange={toggleNotifications}
                trackColor={{ false: "rgba(255,255,255,0.1)", true: "rgba(212,175,55,0.5)" }}
                thumbColor={notifications ? GOLD : "#f4f4f5"}
              />
            }
          />
          <View style={styles.divider} />
          <Row
            icon="moon-outline"
            label={t("settings_appearance")}
            hint={t("settings_dark_default")}
            onPress={() => Alert.alert(t("settings_appearance"), t("settings_dark_only"))}
          />
          <View style={styles.divider} />
          <Row
            icon="language-outline"
            label={t("settings_language")}
            hint={languageLabel()}
            onPress={selectLanguage}
          />
        </View>

        {/* About */}
        <Text style={styles.sectionLabel}>{t("settings_about")}</Text>
        <View style={styles.group}>
          <Row icon="information-circle-outline" label={t("settings_app")} hint={t("settings_app_name")} />
          <View style={styles.divider} />
          <Row icon="git-branch-outline" label={t("settings_version")} hint={version} />
          <View style={styles.divider} />
          <Row
            icon="help-circle-outline"
            label={t("settings_help_support")}
            onPress={() => Linking.openURL("mailto:accounts@vend88.com").catch(() => {})}
          />
        </View>

        {/* Danger zone */}
        <View style={styles.group}>
          <Row
            icon="log-out-outline"
            label={t("settings_sign_out")}
            destructive
            onPress={confirmSignOut}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: BG },
  content: { padding: SCREEN_PADDING, paddingBottom: 120, gap: 12 },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    marginTop: 4,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(212,175,55,0.15)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: GOLD, fontWeight: "800", fontSize: 14 },
  profileName: { color: TEXT, fontWeight: "800", fontSize: 15 },
  profileEmail: { color: TEXT_DIM, fontSize: 12, marginTop: 2 },

  sectionLabel: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 2,
    marginLeft: 4,
  },

  group: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    overflow: "hidden",
  },
  rowWrap: { paddingHorizontal: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    minHeight: 54,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { color: TEXT, fontWeight: "700", fontSize: 14 },
  rowHint: { color: TEXT_DIM, fontSize: 11, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: CARD_BORDER, marginLeft: 58 },

  footer: {
    textAlign: "center",
    color: TEXT_DIM,
    fontSize: 11,
    marginTop: 12,
    fontWeight: "600",
  },
});
