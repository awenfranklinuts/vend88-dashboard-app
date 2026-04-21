import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isAxiosError } from "axios";
import { api } from "../services/api";
import { useI18n } from "../context/I18nContext";
import { DANGER, DANGER_DIM } from "../theme/tokens";

// Lightweight health ping — surfaces a banner when the API is unreachable.
// We intentionally avoid NetInfo to keep dependencies minimal.
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    let consecutiveFailures = 0;

    const check = async () => {
      try {
        await api.get("/dashboard/summary", { timeout: 4000 });
        if (cancelled) return;
        consecutiveFailures = 0;
        setOffline(false);
      } catch (error) {
        if (cancelled) return;

        // If we got an HTTP response, the server is reachable.
        if (isAxiosError(error) && error.response) {
          consecutiveFailures = 0;
          setOffline(false);
          return;
        }

        consecutiveFailures += 1;
        // Only flip to offline after two failures to avoid flicker on slow nets.
        if (consecutiveFailures >= 2) setOffline(true);
      }
    };

    check();
    const id = setInterval(check, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!offline) return null;

  return (
    <View style={styles.banner} pointerEvents="none" accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={14} color={DANGER} />
      <Text style={styles.text}>{t("common_offline_cached")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: DANGER_DIM,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(239,68,68,0.3)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 48,
    paddingBottom: 6,
  },
  text: { color: DANGER, fontSize: 12, fontWeight: "700" },
});
