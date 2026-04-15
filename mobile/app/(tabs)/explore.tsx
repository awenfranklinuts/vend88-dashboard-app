import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import api from "@/src/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Module {
  id: string;
  name: string;
  status: "online" | "offline";
  today_txn: number;
  today_revenue: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

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
  pos: "Point of Sale terminal — handle walk-in sales & receipts",
  kds: "Kitchen Display System — manage order flow in the kitchen",
  vending: "Vending Machine — automate unattended retail dispensing",
  kiosk: "Self-Service Kiosk — customer-facing ordering screen",
  loyalty: "Loyalty Program — points, rewards & redemptions",
  reports: "Reports & Analytics — sales, trends & insights",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

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
    <View style={styles.card}>
      {/* icon + badge */}
      <View style={[styles.cardIcon, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={26} color={color} />
        <View
          style={[
            styles.statusDot,
            { backgroundColor: isOnline ? "#22c55e" : "#9ca3af" },
          ]}
        />
      </View>

      {/* text block */}
      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{module.name}</Text>
        <Text style={styles.cardDesc} numberOfLines={2}>
          {MODULE_DESC[module.id] ?? ""}
        </Text>
        <View style={styles.cardMeta}>
          <Text style={styles.metaText}>
            {module.today_txn} txns today
          </Text>
          <Text style={[styles.metaText, { marginLeft: 12 }]}>
            ${module.today_revenue.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* toggle */}
      <TouchableOpacity
        style={[
          styles.toggleBtn,
          { backgroundColor: isOnline ? "#dcfce7" : "#f3f4f6" },
        ]}
        onPress={() => onToggle(module.id, module.status)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.toggleText,
            { color: isOnline ? "#16a34a" : "#6b7280" },
          ]}
        >
          {isOnline ? "Online" : "Offline"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ModulesScreen() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchModules = useCallback(async () => {
    try {
      const res = await api.get("/dashboard/modules");
      setModules(res.data?.modules ?? res.data ?? []);
    } catch {
      // keep previous data on error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  const handleToggle = useCallback(
    (id: string, current: "online" | "offline") => {
      const next: "online" | "offline" =
        current === "online" ? "offline" : "online";
      setModules((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: next } : m))
      );
      // In production: api.patch(`/modules/${id}`, { status: next })
    },
    []
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchModules();
  }, [fetchModules]);

  const online = modules.filter((m) => m.status === "online");
  const offline = modules.filter((m) => m.status === "offline");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f6fb" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Modules</Text>
          <Text style={styles.headerSub}>
            {online.length} active · {offline.length} offline
          </Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{modules.length}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0f4cc9" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0f4cc9" />
          }
        >
          {/* Active modules */}
          {online.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: "#22c55e" }]} />
                <Text style={styles.sectionTitle}>Active</Text>
              </View>
              {online.map((m) => (
                <ModuleCard key={m.id} module={m} onToggle={handleToggle} />
              ))}
            </>
          )}

          {/* Offline modules */}
          {offline.length > 0 && (
            <>
              <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                <View style={[styles.sectionDot, { backgroundColor: "#9ca3af" }]} />
                <Text style={styles.sectionTitle}>Offline</Text>
              </View>
              {offline.map((m) => (
                <ModuleCard key={m.id} module={m} onToggle={handleToggle} />
              ))}
            </>
          )}

          {modules.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="apps-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>No modules found</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f4f6fb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: "#f4f6fb",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  headerBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0f4cc9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerBadgeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    marginTop: 4,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    position: "relative",
  },
  statusDot: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  cardBody: {
    flex: 1,
    marginRight: 8,
  },
  cardName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 16,
    marginBottom: 6,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleText: {
    fontSize: 12,
    fontWeight: "700",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#9ca3af",
  },
});
