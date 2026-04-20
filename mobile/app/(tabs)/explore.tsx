import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/src/services/api";
import { PulsingDot } from "@/src/components/PulsingDot";
import { Skeleton } from "@/src/components/Skeleton";
import { haptic } from "@/src/utils/haptics";
import {
  BG,
  CARD,
  CARD_BORDER,
  GOLD,
  SUCCESS,
  TEXT,
  TEXT_DIM,
} from "@/src/theme/tokens";

interface Module {
  id: string;
  name: string;
  status: "online" | "offline";
  today_txn: number;
  today_revenue: number;
}

const MODULE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  pos: "storefront-outline",
  kds: "restaurant-outline",
  vending: "cafe-outline",
  kiosk: "tablet-landscape-outline",
  loyalty: "heart-outline",
  reports: "bar-chart-outline",
};

const MODULE_COLORS: Record<string, string> = {
  pos: "#0f4cc9",
  kds: "#f59e0b",
  vending: "#10b981",
  kiosk: "#8b5cf6",
  loyalty: "#ef4444",
  reports: "#06b6d4",
};

const MODULE_DESC: Record<string, string> = {
  pos: "Point of Sale — walk-in sales & receipts",
  kds: "Kitchen Display — manage order flow",
  vending: "Vending Machine — unattended retail",
  kiosk: "Self-Service Kiosk — customer ordering",
  loyalty: "Loyalty Program — points & rewards",
  reports: "Reports & Analytics — trends & insights",
};

function ModuleCard({
  module,
  onToggle,
}: {
  module: Module;
  onToggle: (id: string, current: "online" | "offline") => void;
}) {
  const color = MODULE_COLORS[module.id] ?? "#6b7280";
  const icon = MODULE_ICONS[module.id] ?? "apps-outline";
  const isOnline = module.status === "online";

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${module.name}, ${module.status}, ${module.today_txn} transactions today`}
    >
      <View style={[styles.cardIcon, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={24} color={color} />
        <View style={styles.dotOverlay}>
          <PulsingDot color={isOnline ? SUCCESS : "#6b7280"} size={8} active={isOnline} />
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{module.name}</Text>
        <Text style={styles.cardDesc} numberOfLines={2}>
          {MODULE_DESC[module.id] ?? ""}
        </Text>
        <View style={styles.cardMeta}>
          <Text style={styles.metaText}>{module.today_txn} txns today</Text>
          <Text style={[styles.metaText, { marginLeft: 12 }]}>
            ${(module.today_revenue ?? 0).toLocaleString()}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        accessibilityLabel={`Toggle ${module.name} ${isOnline ? "offline" : "online"}`}
        style={[
          styles.toggleBtn,
          {
            backgroundColor: isOnline ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)",
            borderColor: isOnline ? "rgba(34,197,94,0.35)" : CARD_BORDER,
          },
        ]}
        onPress={() => {
          haptic.medium();
          onToggle(module.id, module.status);
        }}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.toggleText,
            { color: isOnline ? SUCCESS : "rgba(255,255,255,0.45)" },
          ]}
        >
          {isOnline ? "Online" : "Offline"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ModulesScreen() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchModules = useCallback(async () => {
    try {
      const res = await api.get("/dashboard/modules");
      setModules(res.data?.modules ?? res.data ?? []);
    } catch {
      // keep previous
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  const handleToggle = useCallback((id: string, current: "online" | "offline") => {
    const next: "online" | "offline" = current === "online" ? "offline" : "online";
    setModules((prev) => prev.map((m) => (m.id === id ? { ...m, status: next } : m)));
  }, []);

  const onRefresh = useCallback(() => {
    haptic.light();
    setRefreshing(true);
    fetchModules();
  }, [fetchModules]);

  const online = modules.filter((m) => m.status === "online");
  const offline = modules.filter((m) => m.status === "offline");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Modules</Text>
          <Text style={styles.headerSub}>
            {loading ? "Loading…" : `${online.length} active · ${offline.length} offline`}
          </Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{modules.length}</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={88} radius={16} />
          ))}
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />
          }
        >
          {online.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <PulsingDot color={SUCCESS} size={8} active />
                <Text style={styles.sectionTitle}>Active</Text>
              </View>
              {online.map((m) => (
                <ModuleCard key={m.id} module={m} onToggle={handleToggle} />
              ))}
            </>
          )}

          {offline.length > 0 && (
            <>
              <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                <View style={[styles.sectionDot, { backgroundColor: "#6b7280" }]} />
                <Text style={styles.sectionTitle}>Offline</Text>
              </View>
              {offline.map((m) => (
                <ModuleCard key={m.id} module={m} onToggle={handleToggle} />
              ))}
            </>
          )}

          {modules.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="apps-outline" size={48} color={TEXT_DIM} />
              <Text style={styles.emptyText}>No modules found</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: TEXT, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: TEXT_DIM, marginTop: 2 },
  headerBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBadgeText: { color: GOLD, fontWeight: "700", fontSize: 14 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    marginTop: 4,
    gap: 8,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 12, color: TEXT_DIM, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    marginBottom: 10,
    gap: 12,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dotOverlay: { position: "absolute", top: -2, right: -2 },
  cardBody: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: "800", color: TEXT },
  cardDesc: { fontSize: 11, color: TEXT_DIM, marginTop: 2, lineHeight: 15 },
  cardMeta: { flexDirection: "row", marginTop: 6 },
  metaText: { fontSize: 11, color: TEXT_DIM, fontWeight: "600" },

  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  toggleText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },

  empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyText: { color: TEXT_DIM, fontSize: 14, fontWeight: "600" },
});
