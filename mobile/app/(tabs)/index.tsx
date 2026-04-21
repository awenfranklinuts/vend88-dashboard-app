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
import { useI18n } from "@/src/context/I18nContext";
import { API_TARGET, api } from "@/src/services/api";
import {
  fetchOfficialMonthRevenueData,
  fetchOfficialRecentOrders,
  fetchOfficialWeeklyRevenueChart,
} from "@/src/services/officialDashboard";
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

function greeting(t: (key: any) => string): string {
  const h = new Date().getHours();
  if (h < 5) return t("dashboard_still_up");
  if (h < 12) return t("dashboard_good_morning");
  if (h < 17) return t("dashboard_good_afternoon");
  if (h < 21) return t("dashboard_good_evening");
  return t("dashboard_good_night");
}

function moduleDisplayName(id: string, fallback: string, t: (key: any) => string): string {
  const map: Record<string, string> = {
    reports: "tab_sales",
  };
  const key = map[id];
  return key ? t(key as any) : fallback;
}

function moduleStatusLabel(status: string, t: (key: any) => string): string {
  if (status === "online") return t("modules_online");
  if (status === "offline") return t("modules_offline_status");
  return status;
}

function parseMoney(v: string | number | undefined): number {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return Number(String(v).replace(/[^0-9.-]/g, "")) || 0;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = async () => {
    let hasOfficialSummary = false;
    let hasOfficialRecentOrders = false;
    let hasOfficialChart = false;

    if (API_TARGET === "official") {
      try {
        const official = await fetchOfficialMonthRevenueData();
        setSummary(official.summary);
        hasOfficialSummary = true;
      } catch {
        hasOfficialSummary = false;
      }

      try {
        const officialChart = await fetchOfficialWeeklyRevenueChart();
        setChart(officialChart);
        hasOfficialChart = true;
      } catch {
        hasOfficialChart = false;
      }

      try {
        const officialOrders = await fetchOfficialRecentOrders();
        setOrders(officialOrders);
        hasOfficialRecentOrders = true;
      } catch {
        hasOfficialRecentOrders = false;
      }
    }

    const [s, c, o, m] = await Promise.allSettled([
      api.get<Summary>("/dashboard/summary"),
      api.get<ChartPoint[]>("/dashboard/revenue-chart"),
      api.get<RecentOrder[]>("/dashboard/recent-orders"),
      api.get<Module[]>("/dashboard/modules"),
    ]);

    if (!hasOfficialSummary && s.status === "fulfilled") {
      setSummary(s.value.data);
    }
    if (!hasOfficialChart && c.status === "fulfilled") {
      setChart(c.value.data);
    }
    if (!hasOfficialRecentOrders && o.status === "fulfilled") {
      setOrders(o.value.data);
    }
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
      <View style={styles.glow} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting(t)}</Text>
            <View style={styles.brandRow}>
              <Text style={styles.brandVend}>VEND</Text>
              <Text style={styles.brand88}>88</Text>
            </View>
            <Text style={styles.subtitle}>{t("dashboard_subtitle")}</Text>
          </View>
          <Pressable
            accessibilityLabel={t("settings_notifications")}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            onPress={() => haptic.selection()}
          >
            <Ionicons name="notifications-outline" size={18} color={TEXT_DIM} />
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
              <View style={styles.heroHead}>
                <Text style={styles.heroLabel}>{t("dashboard_month_revenue")}</Text>
                <View style={styles.heroBadge}>
                  <Ionicons name="trending-up" size={11} color={SUCCESS} />
                  <Text style={styles.heroBadgeText}>+{summary?.revenue_change_pct ?? 0}%</Text>
                </View>
              </View>
              <AnimatedNumber
                value={parseMoney(summary?.total_revenue_month)}
                prefix="$"
                style={styles.heroValue}
              />
              <Text style={styles.heroHint}>{t("dashboard_vs_previous_month")}</Text>
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
                <Text style={styles.kpiLabel}>{t("dashboard_today_sales")}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Ionicons name="receipt-outline" size={18} color={WARNING} />
                <AnimatedNumber
                  value={summary?.total_orders ?? 0}
                  style={styles.kpiValue}
                />
                <Text style={styles.kpiLabel}>{t("dashboard_orders")}</Text>
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
                <Text style={styles.kpiLabel}>{t("dashboard_avg_order")}</Text>
              </View>
            </View>

            {/* Revenue Chart */}
            {chart.length > 0 && (
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <Text style={styles.sectionTitle}>{t("dashboard_revenue_this_week")}</Text>
                  <Pressable
                    accessibilityLabel={t("dashboard_view_report")}
                    onPress={() => {
                      haptic.selection();
                      router.push("/(tabs)/sales");
                    }}
                  >
                    <Text style={styles.seeAll}>{t("dashboard_view_report")}</Text>
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
            <Text style={styles.sectionTitle}>{t("dashboard_modules")}</Text>
            <View style={styles.moduleGrid}>
              {modules.map((mod) => {
                const isOnline = mod.status === "online";
                return (
                  <Pressable
                    key={mod.id}
                    accessibilityLabel={`${moduleDisplayName(mod.id, mod.name, t)}, ${mod.status}`}
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
                    <Text style={styles.moduleName}>{moduleDisplayName(mod.id, mod.name, t)}</Text>
                    <View style={styles.moduleFooter}>
                      <PulsingDot color={isOnline ? SUCCESS : "#6b7280"} size={6} active={isOnline} />
                      <Text style={styles.moduleTxn}>
                        {mod.today_txn > 0
                          ? `${mod.today_txn} ${t("dashboard_txn_suffix")}`
                          : moduleStatusLabel(mod.status, t)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Recent Orders */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t("dashboard_recent_orders")}</Text>
              <Pressable
                accessibilityLabel={t("dashboard_see_all")}
                onPress={() => {
                  haptic.selection();
                  router.push("/(tabs)/sales");
                }}
              >
                <Text style={styles.seeAll}>{t("dashboard_see_all")}</Text>
              </Pressable>
            </View>
            {orders.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="receipt-outline" size={28} color={TEXT_DIM} />
                <Text style={styles.emptyText}>{t("dashboard_no_recent_orders")}</Text>
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
                        {order.status === "completed"
                          ? t("dashboard_done")
                          : t("dashboard_in_progress")}
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
  content: { padding: 20, paddingTop: 8, paddingBottom: 40, gap: 20 },
  pressed: { opacity: 0.7 },

  glow: {
    position: "absolute",
    top: -160,
    right: -100,
    width: 340,
    height: 340,
    borderRadius: 200,
    backgroundColor: GOLD,
    opacity: 0.06,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  greeting: {
    color: TEXT_DIM,
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
    letterSpacing: 0.1,
  },
  brandRow: { flexDirection: "row", alignItems: "baseline" },
  brandVend: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 4,
    color: TEXT,
  },
  brand88: {
    fontSize: 26,
    fontWeight: "500",
    color: "#e53e3e",
    marginLeft: 3,
    letterSpacing: -0.5,
  },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  badgeText: { color: "transparent", fontSize: 0 },

  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: GOLD_DIM,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: GOLD, fontWeight: "700", fontSize: 12, letterSpacing: 0.3 },

  // Hero card — the one solid surface, quiet shadow
  heroCard: {
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    borderRadius: 20,
    padding: 20,
    gap: 6,
  },
  heroHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroLabel: {
    color: TEXT_DIM,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  heroValue: {
    color: TEXT,
    fontSize: 38,
    fontWeight: "700",
    marginTop: 6,
    letterSpacing: -1.2,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  heroBadgeText: { color: SUCCESS, fontSize: 12, fontWeight: "600" },
  heroHint: { color: TEXT_DIM, fontSize: 11, fontWeight: "500", marginTop: 2 },

  // KPI row — subtle cards, less heavy
  kpiRow: { flexDirection: "row", gap: 10 },
  kpiCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    gap: 6,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT,
    marginTop: 6,
    letterSpacing: -0.4,
  },
  kpiLabel: { fontSize: 11, color: TEXT_DIM, fontWeight: "500" },
  kpiBadge: {
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  kpiBadgeText: { fontSize: 10, color: SUCCESS, fontWeight: "600" },

  // Chart card
  chartCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  bars: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 110,
  },
  barCol: { flex: 1, alignItems: "center", gap: 6 },
  barValue: { fontSize: 9, color: TEXT_DIM, fontWeight: "500" },
  barTrack: {
    flex: 1,
    width: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 4,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    backgroundColor: GOLD,
    borderRadius: 4,
    opacity: 0.85,
  },
  barLabel: { fontSize: 10, color: TEXT_DIM, fontWeight: "500" },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.2,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  seeAll: { fontSize: 12, color: TEXT_DIM, fontWeight: "500" },

  // Modules grid
  moduleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moduleCard: {
    width: "48.5%",
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    gap: 10,
  },
  moduleCardPressed: { opacity: 0.7 },
  moduleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleName: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT,
    letterSpacing: -0.1,
  },
  moduleFooter: { flexDirection: "row", alignItems: "center", gap: 6 },
  moduleTxn: { fontSize: 11, color: TEXT_DIM, fontWeight: "500" },

  // Order list — flat rows inside a grouped card
  orderCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderLeft: { flex: 1, gap: 4 },
  orderId: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT,
    letterSpacing: -0.1,
  },
  orderItem: { fontSize: 12, color: TEXT_DIM, fontWeight: "500" },
  orderMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  moduleTag: {
    backgroundColor: "transparent",
    borderRadius: 4,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  moduleTagText: {
    fontSize: 10,
    color: ACCENT,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  orderTime: { fontSize: 11, color: TEXT_DIM, fontWeight: "500" },
  orderRight: { alignItems: "flex-end", gap: 6 },
  orderTotal: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.3,
  },
  statusBadge: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  statusDone: {},
  statusPending: {},
  statusText: { fontSize: 11, fontWeight: "500" },
  statusDoneText: { color: SUCCESS },
  statusPendingText: { color: WARNING },

  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    paddingVertical: 36,
    alignItems: "center",
    gap: 10,
  },
  emptyText: { color: TEXT_DIM, fontSize: 13, fontWeight: "500" },

  // Unused subtitle kept to avoid lint issues if referenced elsewhere
  subtitle: {
    marginTop: 6,
    fontSize: 10,
    letterSpacing: 3,
    color: TEXT_DIM,
    fontWeight: "500",
  },
});
