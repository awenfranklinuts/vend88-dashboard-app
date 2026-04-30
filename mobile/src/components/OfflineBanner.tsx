import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "../context/I18nContext";
import { DANGER, DANGER_DIM } from "../theme/tokens";

// Health ping disabled — the previous endpoint (/dashboard/summary) does not exist on
// the official Vend88 API and was generating noisy 404s every 15 s. The banner now
// stays hidden; reintroduce a real reachability check here if/when needed.
export function OfflineBanner() {
  const { t } = useI18n();
  const offline = false;

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
