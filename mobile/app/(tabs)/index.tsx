import { useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/services/api";
import { AnimatedNumber } from "@/src/components/AnimatedNumber";
import { PulsingDot } from "@/src/components/PulsingDot";
import { Skeleton } from "@/src/components/Skeleton";
import { haptic } from "@/src/utils/haptics";
import {
  ACCENT,
  ACCENT_DIM,
  BG,
  CARD,
  CARD_BORDER,
  GOLD,
  GOLD_DIM,
  SUCCESS,
  SUCCESS_DIM,
  TEXT,
  TEXT_DIM,
  WARNING,
  WARNING_DIM,
} from "@/src/theme/tokens";

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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

function parseMoney(v: string | number | undefined): number {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return Number(String(v).replace(/[^0-9.-]/g, "")) || 0;
}

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
    haptic.light();
    setRefreshing(true);
    await fetchAll();
    haptic.success();
    setRefreshing(false);
  };

  const maxRevenue = Math.max(...chart.map((p) => p.revenue), 1);

  return (
    <SafeAreaView style={styles.safeContainer} edges={["top"]}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting()}</Text>
            <View style={styles.brandRow}>
              <Text style={styles.brandVend}>VEND</Text>
              <Text style={styles.brand88}>88</Text>
            </View>
            <Text style={styles.subtitle}>DASHBOARD</Text>
          </View>
          <Pressable
            accessibilityLabel="Notifications"
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            onPress={() => haptic.selection()}
          >
            <Ionicons name="notifications-outline" size={18} color={TEXT} />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>3</Text>
            </View>
          </Pressable>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>V8</Text>
          </View>
        </View>

        {loading ? (
          <>
            <Skeleton height={110} radius={22} />
            <View style={styles.kpiRow}>
              <Skeleton height={86} radius={16} style={{ flex: 1 } as any} />
              <Skeleton height={86} radius={16} style={{ flex: 1 } as any} />
              <Skeleton height={86} radius={16} style={{ flex: 1 } as any} />
            </View>
            <Skeleton height={170} radius={22} />
            <Skeleton height={24} width="30%" />
            <View style={styles.moduleGrid}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={96} radius={18} style={{ width: "48%" } as any} />
              ))}
            </View>
          </>
        ) : (
          <>
            {/* Hero metric */}
            <View style={styles.heroCard}>
              <View>
                <Text style={styles.heroLabel}>MONTH REVENUE</Text>
                <AnimatedNumber
                  value={parseMoney(summary?.total_revenue_month)}
                  prefix="$"
                  style={styles.heroValue}
                />
              </View>
              <View style={styles.heroBadge}>
                <Ionicons name="trending-up" size={12} color={SUCCESS} />
                <Text style={styles.heroBadgeText}>+{summary?.revenue_change_pct ?? 0}%</Text>
              </View>
            </View>

            {/* KPI Row */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Ionicons name="cash-outline" size={18} color={GOLD} />
                <AnimatedNumber
                  value={parseMoney(summary?.today_sales)}
                  prefix="$"
                  style={styles.kpiValue}
                />
                <Text style={styles.kpiLabel}>Today Sales</Text>
              </View>
              <View style={styles.kpiCard}>
                <Ionicons name="receipt-outline" size={18} color={WARNING} />
                <AnimatedNumber
                  value={summary?.total_orders ?? 0}
                  style={styles.kpiValue}
                />
                <Text style={styles.kpiLabel}>Orders</Text>
                <View style={styles.kpiBadge}>
                  <Text style={styles.kpiBadgeText}>+{summary?.orders_change_pct ?? 0}%</Text>
                </View>
              </View>
              <View style={styles.kpiCard}>
                <Ionicons name="cart-outline" size={18} color="#818cf8" />
                <AnimatedNumber
                  value={parseMoney(summary?.avg_order_value)}
                  prefix="$"
                  decimals={2}
                  style={styles.kpiValue}
                />
                <Text style={styles.kpiLabel}>Avg Order</Text>
              </View>
            </View>

            {/* Revenue Chart */}
            {chart.length > 0 && (
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <Text style={styles.sectionTitle}>Revenue — This Week</Text>
                  <Pressable
                    accessibilityLabel="View full report"
                    onPress={() => {
                      haptic.selection();
                      router.push("/(tabs)/sales");
                    }}
                  >
                    <Text style={styles.seeAll}>View Report →</Text>
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
              {modules.map((mod) => {
                const isOnline = mod.status === "online";
                return (
                  <Pressable
                    key={mod.id}
                    accessibilityLabel={`${mod.name} module, ${mod.status}`}
                    style={({ pressed }) => [styles.moduleCard, pressed && styles.moduleCardPressed]}
                    onPress={() => {
                      haptic.light();
                      const route = MODULE_ROUTE_MAP[mod.id];
                      if (route) router.push(route as any);
                    }}
                  >
                    <View style={[styles.moduleIconWrap, { backgroundColor: mod.color + "20" }]}>
                      <Ionicons name={mod.icon as any} size={22} color={mod.color} />
                    </View>
                    <Text style={styles.moduleName}>{mod.name}</Text>
                    <View style={styles.moduleFooter}>
                      <PulsingDot color={isOnline ? SUCCESS : "#6b7280"} size={6} active={isOnline} />
                      <Text style={styles.moduleTxn}>
                        {mod.today_txn > 0 ? `${mod.today_txn} txn` : mod.status}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Recent Orders */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Orders</Text>
              <Pressable
                accessibilityLabel="See all orders"
                onPress={() => {
                  haptic.selection();
                  router.push("/(tabs)/sales");
                }}
              >
                <Text style={styles.seeAll}>See all →</Text>
              </Pressable>
            </View>
            {orders.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="receipt-outline" size={28} color={TEXT_DIM} />
                <Text style={styles.emptyText}>No recent orders yet</Text>
              </View>
            ) : (
              orders.map((order) => (
                <Pressable
                  key={order.id}
                  accessibilityLabel={`Order ${order.id}, ${order.status}`}
                  onPress={() => haptic.light()}
                  style={({ pressed }) => [styles.orderCard, pressed && styles.pressed]}
                >
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
                    <View
                      style={[
                        styles.statusBadge,
                        order.status === "completed" ? styles.statusDone : styles.statusPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          order.status === "completed" ? styles.statusDoneText : styles.statusPendingText,
                        ]}
                      >
                        {order.status === "completed" ? "Done" : "In Progress"}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: BG },
  container: { flex: 1, backgroundColor: "transparent" },
  content: { padding: 16, paddingTop: 8, paddingBottom: 32, gap: 14 },
  pressed: { opacity: 0.85 },

  glowTop: {
    position: "absolute",
    top: -140,
    left: -120,
    width: 360,
    height: 360,
    borderRadius: 200,
    backgroundColor: GOLD,
    opacity: 0.1,
  },
  glowBottom: {
    position: "absolute",
    bottom: -170,
    right: -120,
    width: 390,
    height: 390,
    borderRadius: 220,
    backgroundColor: ACCENT,
    opacity: 0.12,
  },

  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  greeting: { color: TEXT_DIM, fontSize: 12, fontWeight: "600", marginBottom: 4, letterSpacing: 0.5 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brandVend: { fontSize: 24, fontWeight: "700", letterSpacing: 6, color: TEXT },
  brand88: { fontSize: 24, fontWeight: "500", color: "#e53e3e", marginLeft: 2 },
  subtitle: { marginTop: 4, fontSize: 9, letterSpacing: 4, color: TEXT_DIM },

  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: BG,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: GOLD, fontWeight: "800", fontSize: 12 },

  heroCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 22,
    padding: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  heroLabel: {
    color: TEXT_DIM,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  heroValue: { color: TEXT, fontSize: 34, fontWeight: "800", marginTop: 6 },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SUCCESS_DIM,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 3,
  },
  heroBadgeText: { color: SUCCESS, fontSize: 12, fontWeight: "700" },

  kpiRow: { flexDirection: "row", gap: 10 },
  kpiCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    gap: 3,
  },
  kpiValue: { fontSize: 18, fontWeight: "800", color: TEXT, marginTop: 4 },
  kpiLabel: { fontSize: 11, color: TEXT_DIM, fontWeight: "600" },
  kpiBadge: {
    backgroundColor: GOLD_DIM,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  kpiBadgeText: { fontSize: 10, color: GOLD, fontWeight: "700" },

  chartCard: {
    backgroundColor: CARD,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  bars: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 100,
  },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  barValue: { fontSize: 9, color: TEXT_DIM, fontWeight: "600" },
  barTrack: {
    flex: 1,
    width: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 6,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: { width: "100%", backgroundColor: ACCENT, borderRadius: 6 },
  barLabel: { fontSize: 10, color: TEXT_DIM, fontWeight: "600" },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: TEXT },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  seeAll: { fontSize: 12, color: GOLD, fontWeight: "600" },

  moduleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moduleCard: {
    width: "48%",
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    gap: 8,
  },
  moduleCardPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  moduleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleName: { fontSize: 13, fontWeight: "700", color: TEXT },
  moduleFooter: { flexDirection: "row", alignItems: "center", gap: 6 },
  moduleTxn: { fontSize: 11, color: TEXT_DIM, fontWeight: "600" },

  orderCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderLeft: { flex: 1, gap: 3 },
  orderId: { fontSize: 13, fontWeight: "800", color: TEXT },
  orderItem: { fontSize: 12, color: TEXT_DIM },
  orderMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  moduleTag: {
    backgroundColor: ACCENT_DIM,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  moduleTagText: { fontSize: 10, color: ACCENT, fontWeight: "700" },
  orderTime: { fontSize: 11, color: TEXT_DIM },
  orderRight: { alignItems: "flex-end", gap: 6 },
  orderTotal: { fontSize: 15, fontWeight: "800", color: TEXT },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusDone: { backgroundColor: SUCCESS_DIM },
  statusPending: { backgroundColor: WARNING_DIM },
  statusText: { fontSize: 10, fontWeight: "700" },
  statusDoneText: { color: SUCCESS },
  statusPendingText: { color: WARNING },

  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderStyle: "dashed",
    paddingVertical: 28,
    alignItems: "center",
    gap: 8,
  },
  emptyText: { color: TEXT_DIM, fontSize: 13, fontWeight: "600" },
});
