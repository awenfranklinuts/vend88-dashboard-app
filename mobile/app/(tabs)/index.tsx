import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/services/api";

type Summary = {
  today_sales: string;
  total_orders: number;
  total_products: number;
  avg_order_value: string;
  total_revenue_month: string;
  revenue_change_pct: number;
  orders_change_pct: number;
};

type ChartPoint = { day: string; revenue: number };

type RecentOrder = {
  id: string;
  item: string;
  module: string;
  total: string;
  status: string;
  time: string;
};

type Module = {
  id: string;
  name: string;
  icon: string;
  color: string;
  status: string;
  today_txn: number;
};

const MODULE_ROUTE_MAP: Record<string, string> = {
  reports: "/(tabs)/sales",
};

export default function DashboardScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = async () => {
    const [s, c, o, m] = await Promise.allSettled([
      api.get<Summary>("/dashboard/summary"),
      api.get<ChartPoint[]>("/dashboard/revenue-chart"),
      api.get<RecentOrder[]>("/dashboard/recent-orders"),
      api.get<Module[]>("/dashboard/modules"),
    ]);
    if (s.status === "fulfilled") setSummary(s.value.data);
    if (c.status === "fulfilled") setChart(c.value.data);
    if (o.status === "fulfilled") setOrders(o.value.data);
    if (m.status === "fulfilled") setModules(m.value.data);
  };

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const maxRevenue = Math.max(...chart.map((p) => p.revenue), 1);

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#0f4cc9" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0f4cc9" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>Store performance at a glance</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>V8</Text>
        </View>
      </View>

      {/* Hero metric */}
      <View style={styles.heroCard}>
        <View>
          <Text style={styles.heroLabel}>Month Revenue</Text>
          <Text style={styles.heroValue}>${summary?.total_revenue_month ?? "--"}</Text>
        </View>
        <View style={styles.heroBadge}>
          <Ionicons name="trending-up" size={12} color="#059669" />
          <Text style={styles.heroBadgeText}>+{summary?.revenue_change_pct ?? 0}%</Text>
        </View>
      </View>

      {/* KPI Row */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Ionicons name="cash-outline" size={18} color="#0f4cc9" />
          <Text style={styles.kpiValue}>${summary?.today_sales ?? "--"}</Text>
          <Text style={styles.kpiLabel}>Today Sales</Text>
        </View>
        <View style={styles.kpiCard}>
          <Ionicons name="receipt-outline" size={18} color="#d97706" />
          <Text style={styles.kpiValue}>{summary?.total_orders ?? "--"}</Text>
          <Text style={styles.kpiLabel}>Orders</Text>
          <View style={styles.kpiBadge}>
            <Text style={styles.kpiBadgeText}>+{summary?.orders_change_pct ?? 0}%</Text>
          </View>
        </View>
        <View style={styles.kpiCard}>
          <Ionicons name="cart-outline" size={18} color="#7c3aed" />
          <Text style={styles.kpiValue}>${summary?.avg_order_value ?? "--"}</Text>
          <Text style={styles.kpiLabel}>Avg Order</Text>
        </View>
      </View>

      {/* Revenue Chart */}
      {chart.length > 0 && (
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.sectionTitle}>Revenue — This Week</Text>
            <Pressable onPress={() => router.push("/(tabs)/sales")}>
              <Text style={styles.seeAll}>View Full Report →</Text>
            </Pressable>
          </View>
          <View style={styles.bars}>
            {chart.map((p) => {
              const heightPct = p.revenue / maxRevenue;
              return (
                <View key={p.day} style={styles.barCol}>
                  <Text style={styles.barValue}>${(p.revenue / 1000).toFixed(1)}k</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${Math.round(heightPct * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{p.day}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Modules */}
      <Text style={styles.sectionTitle}>Modules</Text>
      <View style={styles.moduleGrid}>
        {modules.map((mod) => (
          <Pressable
            key={mod.id}
            style={({ pressed }) => [styles.moduleCard, pressed && styles.moduleCardPressed]}
            onPress={() => {
              const route = MODULE_ROUTE_MAP[mod.id];
              if (route) router.push(route as any);
            }}
          >
            <View style={[styles.moduleIconWrap, { backgroundColor: mod.color + "18" }]}>
              <Ionicons name={mod.icon as any} size={22} color={mod.color} />
            </View>
            <Text style={styles.moduleName}>{mod.name}</Text>
            <View style={styles.moduleFooter}>
              <View style={[styles.moduleDot, { backgroundColor: mod.status === "online" ? "#059669" : "#9ca3af" }]} />
              <Text style={styles.moduleTxn}>{mod.today_txn > 0 ? `${mod.today_txn} txn` : mod.status}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* Recent Orders */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Orders</Text>
        <Pressable onPress={() => router.push("/(tabs)/sales")}>
          <Text style={styles.seeAll}>See all →</Text>
        </Pressable>
      </View>
      {orders.map((order) => (
        <View key={order.id} style={styles.orderCard}>
          <View style={styles.orderLeft}>
            <Text style={styles.orderId}>{order.id}</Text>
            <Text style={styles.orderItem} numberOfLines={1}>{order.item}</Text>
            <View style={styles.orderMeta}>
              <View style={styles.moduleTag}>
                <Text style={styles.moduleTagText}>{order.module}</Text>
              </View>
              <Text style={styles.orderTime}>{order.time}</Text>
            </View>
          </View>
          <View style={styles.orderRight}>
            <Text style={styles.orderTotal}>${order.total}</Text>
            <View style={[
              styles.statusBadge,
              order.status === "completed" ? styles.statusDone : styles.statusPending,
            ]}>
              <Text style={[
                styles.statusText,
                order.status === "completed" ? styles.statusDoneText : styles.statusPendingText,
              ]}>
                {order.status === "completed" ? "Done" : "In Progress"}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f6fb" },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  loaderWrap: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f6fb" },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  title: { fontSize: 26, fontWeight: "800", color: "#0a1628" },
  subtitle: { color: "#64748b", fontSize: 13, marginTop: 2 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#0f4cc9", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  heroCard: {
    backgroundColor: "#0f4cc9",
    borderRadius: 18,
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  heroLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 },
  heroValue: { color: "#fff", fontSize: 32, fontWeight: "800", marginTop: 4 },
  heroBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#d1fae5", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, gap: 3 },
  heroBadgeText: { color: "#059669", fontSize: 12, fontWeight: "700" },

  kpiRow: { flexDirection: "row", gap: 10 },
  kpiCard: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#e5e7eb", gap: 3 },
  kpiValue: { fontSize: 18, fontWeight: "800", color: "#0a1628", marginTop: 4 },
  kpiLabel: { fontSize: 11, color: "#64748b", fontWeight: "600" },
  kpiBadge: { backgroundColor: "#eff6ff", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start", marginTop: 2 },
  kpiBadgeText: { fontSize: 10, color: "#0f4cc9", fontWeight: "700" },

  chartCard: { backgroundColor: "#fff", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#e5e7eb" },
  chartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  bars: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 100 },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  barValue: { fontSize: 9, color: "#94a3b8", fontWeight: "600" },
  barTrack: { flex: 1, width: 20, backgroundColor: "#f1f5f9", borderRadius: 6, justifyContent: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", backgroundColor: "#0f4cc9", borderRadius: 6 },
  barLabel: { fontSize: 10, color: "#64748b", fontWeight: "600" },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#0a1628" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  seeAll: { fontSize: 12, color: "#0f4cc9", fontWeight: "600" },

  moduleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moduleCard: { width: "48%", backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#e5e7eb", gap: 8 },
  moduleCardPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  moduleIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  moduleName: { fontSize: 13, fontWeight: "700", color: "#0a1628" },
  moduleFooter: { flexDirection: "row", alignItems: "center", gap: 5 },
  moduleDot: { width: 6, height: 6, borderRadius: 3 },
  moduleTxn: { fontSize: 11, color: "#64748b", fontWeight: "600" },

  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderLeft: { flex: 1, gap: 3 },
  orderId: { fontSize: 13, fontWeight: "800", color: "#0a1628" },
  orderItem: { fontSize: 12, color: "#64748b" },
  orderMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  moduleTag: { backgroundColor: "#eff6ff", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  moduleTagText: { fontSize: 10, color: "#0f4cc9", fontWeight: "700" },
  orderTime: { fontSize: 11, color: "#94a3b8" },
  orderRight: { alignItems: "flex-end", gap: 6 },
  orderTotal: { fontSize: 15, fontWeight: "800", color: "#0a1628" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusDone: { backgroundColor: "#d1fae5" },
  statusPending: { backgroundColor: "#fef3c7" },
  statusText: { fontSize: 10, fontWeight: "700" },
  statusDoneText: { color: "#059669" },
  statusPendingText: { color: "#d97706" },

  // legacy — kept for card
  card: {
    width: "48%",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardLabel: {
    color: "#6b7280",
    fontWeight: "600",
    marginBottom: 6,
  },
  cardValue: {
    color: "#0f172a",
    fontWeight: "800",
    fontSize: 20,
  },
  warning: {
    marginTop: 6,
    color: "#b45309",
    fontWeight: "600",
  },
});
