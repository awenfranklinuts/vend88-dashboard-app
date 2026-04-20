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
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";

// expo-local-authentication is a native module. It requires a dev-client rebuild
// to be linked. Load it dynamically so the JS bundle still evaluates if it
// isn't yet available in the current native shell.
type LocalAuthModule = typeof import("expo-local-authentication");
let LocalAuth: LocalAuthModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LocalAuth = require("expo-local-authentication");
} catch {
  LocalAuth = null;
}
import Constants from "expo-constants";
import { useAuth } from "@/src/context/AuthContext";
import { API_BASE_URL } from "@/src/services/api";
import { haptic } from "@/src/utils/haptics";
import {
  BG,
  CARD,
  CARD_BORDER,
  DANGER,
  DANGER_DIM,
  GOLD,
  TEXT,
  TEXT_DIM,
} from "@/src/theme/tokens";

const BIOMETRIC_KEY = "vend88-biometric-enabled";
const NOTIFY_KEY = "vend88-notifications-enabled";

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
  const { signOut } = useAuth();
  const [biometric, setBiometric] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [biometricSupported, setBiometricSupported] = useState(false);

  useEffect(() => {
    (async () => {
      const [compat, enrolled, bio, notif] = await Promise.all([
        LocalAuth ? LocalAuth.hasHardwareAsync() : Promise.resolve(false),
        LocalAuth ? LocalAuth.isEnrolledAsync() : Promise.resolve(false),
        SecureStore.getItemAsync(BIOMETRIC_KEY),
        SecureStore.getItemAsync(NOTIFY_KEY),
      ]);
      setBiometricSupported(Boolean(compat && enrolled));
      setBiometric(bio === "1");
      if (notif !== null) setNotifications(notif === "1");
    })();
  }, []);

  const toggleBiometric = async (value: boolean) => {
    haptic.selection();
    if (value && LocalAuth) {
      const result = await LocalAuth.authenticateAsync({
        promptMessage: "Enable biometric lock",
        disableDeviceFallback: false,
      });
      if (!result.success) {
        haptic.error();
        return;
      }
    }
    setBiometric(value);
    await SecureStore.setItemAsync(BIOMETRIC_KEY, value ? "1" : "0");
    haptic.success();
  };

  const toggleNotifications = async (value: boolean) => {
    haptic.selection();
    setNotifications(value);
    await SecureStore.setItemAsync(NOTIFY_KEY, value ? "1" : "0");
  };

  const confirmSignOut = () => {
    haptic.warning();
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          haptic.success();
          await signOut();
        },
      },
    ]);
  };

  const version =
    (Constants.expoConfig?.version as string | undefined) ??
    (Constants as any).manifest?.version ??
    "1.0.0";

  return (
    <SafeAreaView style={styles.safeContainer} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Preferences & account</Text>

        {/* Profile */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>V8</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>VEND 88 Operator</Text>
            <Text style={styles.profileEmail}>admin@vend88.app</Text>
          </View>
          <Pressable
            accessibilityLabel="Edit profile"
            onPress={() => haptic.selection()}
            style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="create-outline" size={14} color={GOLD} />
          </Pressable>
        </View>

        {/* Security */}
        <Text style={styles.sectionLabel}>Security</Text>
        <View style={styles.group}>
          <Row
            icon="finger-print-outline"
            label="Biometric lock"
            hint={
              biometricSupported
                ? "Require Face ID / fingerprint"
                : "Not available on this device"
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
          <View style={styles.divider} />
          <Row
            icon="key-outline"
            label="Change password"
            hint="Update your account password"
            onPress={() => Alert.alert("Coming soon", "Password management is not available yet.")}
          />
        </View>

        {/* Preferences */}
        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={styles.group}>
          <Row
            icon="notifications-outline"
            label="Notifications"
            hint="Push alerts for orders & system events"
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
            label="Appearance"
            hint="Dark (default)"
            onPress={() => Alert.alert("Appearance", "Only dark mode is available right now.")}
          />
          <View style={styles.divider} />
          <Row
            icon="language-outline"
            label="Language"
            hint="English"
            onPress={() => Alert.alert("Language", "Additional languages coming soon.")}
          />
        </View>

        {/* About */}
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.group}>
          <Row icon="information-circle-outline" label="App" hint="VEND88 Dashboard Mobile" />
          <View style={styles.divider} />
          <Row icon="git-branch-outline" label="Version" hint={version} />
          <View style={styles.divider} />
          <Row
            icon="link-outline"
            label="API endpoint"
            hint={API_BASE_URL}
          />
          <View style={styles.divider} />
          <Row
            icon="help-circle-outline"
            label="Help & support"
            onPress={() => Linking.openURL("mailto:support@vend88.app").catch(() => {})}
          />
        </View>

        {/* Danger zone */}
        <View style={styles.group}>
          <Row
            icon="log-out-outline"
            label="Sign out"
            destructive
            onPress={confirmSignOut}
          />
        </View>

        <Text style={styles.footer}>VEND 88 · Made with ♥</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  title: { fontSize: 26, fontWeight: "800", color: TEXT },
  subtitle: { color: TEXT_DIM, fontSize: 13, marginTop: 2, marginBottom: 4 },

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
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(212,175,55,0.1)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },

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
