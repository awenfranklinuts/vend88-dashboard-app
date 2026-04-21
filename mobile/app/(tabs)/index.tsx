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
import { useAuth } from "@/src/context/AuthContext";
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
  DANGER,
  GOLD,
  GOLD_DIM,
  SUCCESS,
  SUCCESS_DIM,
  TEXT,
  TEXT_DIM,
  TEXT_FAINT,
  WARNING,
  WARNING_DIM,
  SCREEN_PADDING,
} from "@/src/theme/tokens";
import { SectionLabel } from "@/src/components/SectionLabel";

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

// Build a display identity, preferring real first/last names from /admin/profile.
// Falls back to splitting the email local-part on "." "_" "-" (e.g. alex.smith → Alex Smith).
function buildIdentity(
  email: string | null,
  firstName: string | null,
  lastName: string | null,
): { first: string; name: string; initials: string } {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (first || last) {
    const full = [first, last].filter(Boolean).join(" ");
    const initials =
      (first ? first[0] : "") + (last ? last[0] : "") || first.slice(0, 2) || last.slice(0, 2);
    return {
      first: first || last,
      name: full,
      initials: initials.toUpperCase() || "V8",
    };
  }
  if (!email) return { first: "", name: "", initials: "V8" };
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return { first: "", name: "", initials: "V8" };
  const name = parts.map(capitalize).join(" ");
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  return { first: capitalize(parts[0]), name, initials };
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

function orderGlyph(moduleName: string): { icon: keyof typeof Ionicons.glyphMap; color: string } {
  const key = moduleName.toLowerCase();
  if (key.includes("pos") || key.includes("retail")) return { icon: "storefront-outline", color: "#60a5fa" };
  if (key.includes("rest") || key.includes("food") || key.includes("dine")) return { icon: "restaurant-outline", color: "#f59e0b" };
  if (key.includes("vend") || key.includes("machine")) return { icon: "cube-outline", color: "#a78bfa" };
  if (key.includes("online") || key.includes("web") || key.includes("ecom")) return { icon: "globe-outline", color: "#34d399" };
  if (key.includes("kiosk")) return { icon: "tablet-portrait-outline", color: "#f472b6" };
  return { icon: "receipt-outline", color: ACCENT };
}

export default function DashboardScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { email, firstName, lastName } = useAuth();
  const identity = buildIdentity(email, firstName, lastName);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [heroPeriod, setHeroPeriod] = useState<"month" | "week" | "today">("month");

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

  const weekRevenue = chart.reduce((acc, p) => acc + p.revenue, 0);
  const todayRevenue = chart.length > 0 ? chart[chart.length - 1].revenue : parseMoney(summary?.today_sales);

  // Period-over-period % change.
  // month: from API. week: last-3-days vs first-4-days momentum proxy. today: today vs yesterday.
  const pctChange = (curr: number, prev: number) => {
    if (!prev || prev === 0) return curr > 0 ? 100 : 0;
    return ((curr - prev) / prev) * 100;
  };
  const monthChange = summary?.revenue_change_pct ?? 0;
  const weekChange = (() => {
    if (chart.length < 7) return 0;
    const firstHalf = chart.slice(0, 4).reduce((a, p) => a + p.revenue, 0);
    const secondHalf = chart.slice(4).reduce((a, p) => a + p.revenue, 0);
    // Scale halves to equal-day averages before comparing.
    return pctChange(secondHalf / 3, firstHalf / 4);
  })();
  const todayChange = (() => {
    if (chart.length < 2) return 0;
    const today = chart[chart.length - 1].revenue;
    const yesterday = chart[chart.length - 2].revenue;
    return pctChange(today, yesterday);
  })();

  const heroConfig: Record<typeof heroPeriod, { label: string; value: number; hint: string; change: number }> = {
    month: {
      label: t("dashboard_month_revenue"),
      value: parseMoney(summary?.total_revenue_month),
      hint: t("dashboard_vs_previous_month"),
      change: monthChange,
    },
    week: {
      label: t("dashboard_week_revenue"),
      value: weekRevenue,
      hint: t("dashboard_vs_previous_week"),
      change: weekChange,
    },
    today: {
      label: t("dashboard_today_revenue"),
      value: todayRevenue,
      hint: t("dashboard_vs_yesterday"),
      change: todayChange,
    },
  };

  const cycleHeroPeriod = () => {
    haptic.selection();
    setHeroPeriod((p) => (p === "month" ? "week" : p === "week" ? "today" : "month"));
  };

  const currentHero = heroConfig[heroPeriod];

  // Build a period-appropriate sparkline. Only weekly data is available from the API,
  // so month/today are synthesised from totals to visualise the shape of the period.
  const displayChart: ChartPoint[] = (() => {
    if (heroPeriod === "week") return chart;
    if (heroPeriod === "today") {
      // Synthesise an intraday curve summing to todayRevenue (morning build-up → lunch peak → evening).
      const weights = [0.05, 0.08, 0.15, 0.22, 0.18, 0.16, 0.1, 0.06];
      const labels = ["8a", "10a", "12p", "2p", "4p", "6p", "8p", "10p"];
      return weights.map((w, i) => ({ day: labels[i], revenue: Math.max(todayRevenue * w, 0) }));
    }
    // month → 4 weekly buckets, with the current (last) bucket = actual week revenue.
    const monthTotal = parseMoney(summary?.total_revenue_month);
    const prevTotal = Math.max(monthTotal - weekRevenue, 0);
    const perPrev = prevTotal / 3;
    return [
      { day: "W1", revenue: perPrev * 0.85 },
      { day: "W2", revenue: perPrev * 1.05 },
      { day: "W3", revenue: perPrev * 1.1 },
      { day: "W4", revenue: weekRevenue },
    ];
  })();
  const displayMax = Math.max(...displayChart.map((p) => p.revenue), 1);

  // KPI values scaled to hero period (approximations when period-specific data isn't available).
  const totalOrders = summary?.total_orders ?? 0;
  const monthAvg = parseMoney(summary?.avg_order_value);
  const periodOrders =
    heroPeriod === "month"
      ? totalOrders
      : heroPeriod === "week"
      ? Math.round(totalOrders / 4.3)
      : Math.round(totalOrders / 30);
  // Derive period avg from period sales / period orders; fall back to month avg.
  const avgOrder =
    periodOrders > 0 ? currentHero.value / periodOrders : monthAvg;
  // Items per order: parse leading qty from recent orders' "item" strings ("3 items · dine-in").
  const itemsPerOrderSamples = orders
    .map((o) => {
      const m = /^(\d+)/.exec(o.item ?? "");
      return m ? Number(m[1]) : null;
    })
    .filter((n): n is number => n !== null && n > 0);
  const avgItemsPerOrder =
    itemsPerOrderSamples.length > 0
      ? itemsPerOrderSamples.reduce((a, b) => a + b, 0) / itemsPerOrderSamples.length
      : 2.4;
  const periodItems = Math.round(periodOrders * avgItemsPerOrder);
  const periodLabel =
    heroPeriod === "month"
      ? t("dashboard_period_this_month")
      : heroPeriod === "week"
      ? t("dashboard_period_this_week")
      : t("dashboard_period_today");

  return (
    <SafeAreaView style={styles.safeContainer} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {greeting(t)}
              {identity.first ? `, ${identity.first}` : ""}
            </Text>
            <View style={styles.brandRow}>
              <Text style={styles.brandVend}>VEND</Text>
              <Text style={styles.brand88}>88</Text>
            </View>
            <Text style={styles.subtitle}>{t("dashboard_subtitle")}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel={t("settings_notifications")}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
              onPress={() => haptic.selection()}
            >
              <Ionicons name="notifications-outline" size={18} color={TEXT} />
              <View style={styles.badge} />
            </Pressable>
            <Pressable
              accessibilityLabel={identity.name || "Account"}
              onPress={() => {
                haptic.selection();
                router.push("/(tabs)/settings");
              }}
              style={({ pressed }) => [styles.actionBtn, styles.avatar, pressed && styles.pressed]}
            >
              <Text style={styles.avatarText}>{identity.initials}</Text>
            </Pressable>
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
            <View style={styles.moduleRow}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={56} radius={14} style={{ width: 160 } as any} />
              ))}
            </View>
          </>
        ) : (
          <>
            {/* Hero metric — tap to cycle period, long-press to open Sales */}
            <Pressable
              accessibilityLabel={`${currentHero.label}. Tap to switch period, long press to view report.`}
              onPress={cycleHeroPeriod}
              onLongPress={() => {
                haptic.medium();
                router.push("/(tabs)/sales");
              }}
              style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
            >
              <View style={styles.heroLeft}>
                <View style={styles.heroLabelRow}>
                  <Text style={styles.heroLabel}>{currentHero.label}</Text>
                  <View style={styles.heroDots}>
                    <View
                      style={[styles.heroDot, heroPeriod === "month" && styles.heroDotActive]}
                    />
                    <View
                      style={[styles.heroDot, heroPeriod === "week" && styles.heroDotActive]}
                    />
                    <View
                      style={[styles.heroDot, heroPeriod === "today" && styles.heroDotActive]}
                    />
                  </View>
                </View>
                <AnimatedNumber
                  value={currentHero.value}
                  prefix="$"
                  style={styles.heroValue}
                />
                <View style={styles.heroFoot}>
                  {(() => {
                    const change = currentHero.change;
                    const isPositive = change >= 0;
                    const color = isPositive ? SUCCESS : DANGER;
                    return (
                      <View style={styles.heroBadge}>
                        <Ionicons
                          name={isPositive ? "trending-up" : "trending-down"}
                          size={11}
                          color={color}
                        />
                        <Text style={[styles.heroBadgeText, { color }]}>
                          {isPositive ? "+" : ""}
                          {change.toFixed(1)}%
                        </Text>
                      </View>
                    );
                  })()}
                  <Text style={styles.heroHint}>{currentHero.hint}</Text>
                </View>
              </View>
              {displayChart.length > 0 && (
                <View style={styles.spark}>
                  {displayChart.map((p, i) => {
                    const heightPct = Math.max(p.revenue / displayMax, 0.08);
                    const isLast = i === displayChart.length - 1;
                    return (
                      <View key={`${heroPeriod}-${p.day}-${i}`} style={styles.sparkCol}>
                        <View
                          style={[
                            styles.sparkBar,
                            { height: `${Math.round(heightPct * 100)}%` },
                            isLast && styles.sparkBarActive,
                          ]}
                        />
                        <Text style={[styles.sparkLabel, isLast && styles.sparkLabelActive]}>
                          {p.day}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </Pressable>

            {/* KPI Row — flat, divided by hairlines. Values swap with heroPeriod. */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiCell}>
                <Ionicons name="cube-outline" size={16} color={GOLD} />
                <AnimatedNumber
                  value={periodItems}
                  style={styles.kpiValue}
                />
                <Text style={styles.kpiLabel}>{t("dashboard_items_sold")}</Text>
                <Text style={styles.kpiPeriod}>{periodLabel}</Text>
              </View>
              <View style={styles.kpiDivider} />
              <View style={styles.kpiCell}>
                <Ionicons name="receipt-outline" size={16} color={WARNING} />
                <AnimatedNumber
                  value={periodOrders}
                  style={styles.kpiValue}
                />
                <Text style={styles.kpiLabel}>{t("dashboard_orders")}</Text>
                <Text style={styles.kpiPeriod}>{periodLabel}</Text>
              </View>
              <View style={styles.kpiDivider} />
              <View style={styles.kpiCell}>
                <Ionicons name="cart-outline" size={16} color="#818cf8" />
                <AnimatedNumber
                  value={avgOrder}
                  prefix="$"
                  decimals={2}
                  style={styles.kpiValue}
                />
                <Text style={styles.kpiLabel}>{t("dashboard_avg_order")}</Text>
                <Text style={styles.kpiPeriod}>{periodLabel}</Text>
              </View>
            </View>

            {/* Revenue Chart removed — sparkline lives in the hero */}

            {/* Modules — horizontal chip row */}
            <SectionLabel label={t("dashboard_modules")} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.moduleRow}
            >
              {modules.map((mod) => {
                const isOnline = mod.status === "online";
                return (
                  <Pressable
                    key={mod.id}
                    accessibilityLabel={`${moduleDisplayName(mod.id, mod.name, t)}, ${mod.status}`}
                    style={({ pressed }) => [styles.moduleChip, pressed && styles.moduleCardPressed]}
                    onPress={() => {
                      haptic.light();
                      const route = MODULE_ROUTE_MAP[mod.id];
                      if (route) router.push(route as any);
                    }}
                  >
                    <View style={[styles.moduleIconWrap, { backgroundColor: mod.color + "1a" }]}>
                      <Ionicons name={mod.icon as any} size={18} color={mod.color} />
                    </View>
                    <View style={styles.moduleChipText}>
                      <Text style={styles.moduleName} numberOfLines={1}>
                        {moduleDisplayName(mod.id, mod.name, t)}
                      </Text>
                      <View style={styles.moduleFooter}>
                        <PulsingDot color={isOnline ? SUCCESS : "#6b7280"} size={5} active={isOnline} />
                        <Text style={styles.moduleTxn} numberOfLines={1}>
                          {mod.today_txn > 0
                            ? `${mod.today_txn} ${t("dashboard_txn_suffix")}`
                            : moduleStatusLabel(mod.status, t)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Recent Orders */}
            <SectionLabel
              label={t("dashboard_recent_orders")}
              right={
                <Pressable
                  accessibilityLabel={t("dashboard_see_all")}
                  onPress={() => {
                    haptic.selection();
                    router.push("/(tabs)/sales");
                  }}
                >
                  <Text style={styles.seeAll}>{t("dashboard_see_all")}</Text>
                </Pressable>
              }
            />
            {orders.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Ionicons name="receipt-outline" size={26} color={TEXT_DIM} />
                <Text style={styles.emptyText}>{t("dashboard_no_recent_orders")}</Text>
              </View>
            ) : (
              <View style={styles.orderList}>
                {orders.map((order, i) => {
                  const glyph = orderGlyph(order.module);
                  const done = order.status === "completed";
                  return (
                    <Pressable
                      key={order.id}
                      accessibilityLabel={`Order ${order.id}, ${order.status}`}
                      onPress={() => haptic.light()}
                      style={({ pressed }) => [
                        styles.orderRow,
                        i !== orders.length - 1 && styles.orderRowDivider,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={[styles.orderIcon, { backgroundColor: glyph.color + "1a" }]}>
                        <Ionicons name={glyph.icon} size={16} color={glyph.color} />
                      </View>
                      <View style={styles.orderMiddle}>
                        <Text style={styles.orderItem} numberOfLines={1}>
                          {order.item}
                        </Text>
                        <Text style={styles.orderSub} numberOfLines={1}>
                          {order.time} · {order.module}
                        </Text>
                      </View>
                      <View style={styles.orderRight}>
                        <Text style={styles.orderTotal}>${order.total}</Text>
                        <View style={styles.orderStatusRow}>
                          <View
                            style={[
                              styles.orderStatusDot,
                              { backgroundColor: done ? SUCCESS : WARNING },
                            ]}
                          />
                          <Text
                            style={[
                              styles.orderStatusText,
                              { color: done ? SUCCESS : WARNING },
                            ]}
                          >
                            {done ? t("dashboard_done") : t("dashboard_in_progress")}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
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
  content: { padding: SCREEN_PADDING, paddingTop: 8, paddingBottom: 120, gap: 24 },
  pressed: { opacity: 0.7 },

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

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#ef4444",
    borderWidth: 1.5,
    borderColor: BG,
  },
  badgeText: { color: "transparent", fontSize: 0 },

  avatar: {
    backgroundColor: GOLD_DIM,
    borderColor: "rgba(212,175,55,0.25)",
  },
  avatarText: { color: GOLD, fontWeight: "700", fontSize: 11, letterSpacing: 0.3 },

  // Hero — number + inline sparkline
  hero: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 16,
    paddingVertical: 4,
  },
  heroLeft: { flex: 1, gap: 4 },
  heroLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heroDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  heroDotActive: {
    backgroundColor: GOLD,
    width: 10,
  },
  heroHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  heroLabel: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  heroValue: {
    color: TEXT,
    fontSize: 38,
    fontWeight: "800",
    marginTop: 8,
    letterSpacing: -1.4,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heroBadgeText: { color: SUCCESS, fontSize: 12, fontWeight: "600" },
  heroHint: { color: TEXT_DIM, fontSize: 12, fontWeight: "500" },

  // Sparkline inside hero
  spark: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: 64,
    paddingBottom: 2,
  },
  sparkCol: {
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
    gap: 4,
  },
  sparkBar: {
    width: 5,
    backgroundColor: "rgba(212,175,55,0.25)",
    borderRadius: 2,
    minHeight: 4,
  },
  sparkBarActive: {
    backgroundColor: GOLD,
  },
  sparkLabel: {
    fontSize: 9,
    color: TEXT_DIM,
    fontWeight: "500",
  },
  sparkLabelActive: {
    color: GOLD,
    fontWeight: "700",
  },

  // KPI row — flat cells with hairline dividers
  kpiRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  kpiCell: {
    flex: 1,
    gap: 6,
    paddingHorizontal: 4,
  },
  kpiDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: CARD_BORDER,
    marginHorizontal: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT,
    marginTop: 4,
    letterSpacing: -0.4,
  },
  kpiLabel: { fontSize: 11, color: TEXT_DIM, fontWeight: "500" },
  kpiPeriod: {
    fontSize: 9,
    color: TEXT_FAINT,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 1,
  },

  seeAll: { fontSize: 11, color: GOLD, fontWeight: "600", letterSpacing: 0.3 },

  // Modules — horizontal chip row
  moduleRow: { flexDirection: "row", gap: 10 },
  moduleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: CARD,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    minWidth: 160,
  },
  moduleChipText: { flex: 1, gap: 2 },
  moduleCardPressed: { opacity: 0.7 },
  moduleIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleName: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT,
    letterSpacing: -0.1,
  },
  moduleFooter: { flexDirection: "row", alignItems: "center", gap: 5 },
  moduleTxn: { fontSize: 10, color: TEXT_DIM, fontWeight: "500" },

  // Orders — transaction-feed rows
  orderList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  orderRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  orderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  orderMiddle: { flex: 1, gap: 3 },
  orderItem: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT,
    letterSpacing: -0.1,
  },
  orderSub: {
    fontSize: 11,
    color: TEXT_DIM,
    fontWeight: "500",
  },
  orderRight: { alignItems: "flex-end", gap: 4 },
  orderTotal: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.3,
  },
  orderStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  orderStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  orderStatusText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.2,
  },

  emptyBlock: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 10,
  },
  emptyText: { color: TEXT_DIM, fontSize: 13, fontWeight: "500" },

  subtitle: {
    marginTop: 6,
    fontSize: 10,
    letterSpacing: 3,
    color: TEXT_DIM,
    fontWeight: "500",
  },
});
