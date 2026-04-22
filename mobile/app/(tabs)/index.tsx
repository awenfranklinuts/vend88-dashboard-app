import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
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
  fetchOfficialTopSellingItems,
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

type TopProduct = {
  id: number | string;
  name: string;
  category: string;
  units: number;
  revenue: string;
  change_pct?: number;
  image?: string;
};

type Store = {
  id: string;
  name: string;
  today_revenue: string;
  orders: number;
  status: string;
  is_aggregate?: boolean;
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
  const { t, locale } = useI18n();
  const { email, token, firstName, lastName, loading: authLoading } = useAuth();
  const identity = buildIdentity(email, firstName, lastName);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [heroPeriod, setHeroPeriod] = useState<"month" | "week" | "today">("month");
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);

  const fetchAll = async () => {
    let hasOfficialSummary = false;
    let hasOfficialRecentOrders = false;
    let hasOfficialChart = false;
    const currentAuth = { email, token };

    if (API_TARGET === "official") {
      setSummary(null);
      setChart([]);
      setOrders([]);
      setSummaryError(null);
      setChartError(null);

      try {
        const official = await fetchOfficialMonthRevenueData(currentAuth);
        setSummary(official.summary);
        hasOfficialSummary = true;
      } catch {
        hasOfficialSummary = false;
        setSummaryError("Unable to load month revenue for this account.");
      }

      try {
        const officialChart = await fetchOfficialWeeklyRevenueChart(currentAuth);
        if (officialChart.length > 0) {
          setChart(officialChart);
          hasOfficialChart = true;
        } else {
          hasOfficialChart = false;
          setChartError("No week or day revenue found for this account.");
        }
      } catch {
        hasOfficialChart = false;
        setChartError("Unable to load week or day revenue for this account.");
      }

      try {
        const officialOrders = await fetchOfficialRecentOrders(currentAuth);
        setOrders(officialOrders);
        hasOfficialRecentOrders = true;
      } catch {
        hasOfficialRecentOrders = false;
      }

      const [m, st] = await Promise.allSettled([
        api.get<Module[]>("/dashboard/modules"),
        api.get<Store[]>("/dashboard/stores"),
      ]);

      if (m.status === "fulfilled") setModules(m.value.data);
      if (st.status === "fulfilled") setStores(st.value.data);
      return;
    }

    const [s, c, o, m, p, st] = await Promise.allSettled([
      api.get<Summary>("/dashboard/summary"),
      api.get<ChartPoint[]>("/dashboard/revenue-chart"),
      api.get<RecentOrder[]>("/dashboard/recent-orders"),
      api.get<Module[]>("/dashboard/modules"),
      api.get<TopProduct[]>("/dashboard/top-products"),
      api.get<Store[]>("/dashboard/stores"),
    ]);

    if (s.status === "fulfilled") {
      setSummary(s.value.data);
      setSummaryError(null);
    }
    if (c.status === "fulfilled") {
      setChart(c.value.data);
      setChartError(null);
    }
    if (o.status === "fulfilled") {
      setOrders(o.value.data);
    }
    if (m.status === "fulfilled") setModules(m.value.data);
    if (p.status === "fulfilled") setTopProducts(p.value.data);
    if (st.status === "fulfilled") setStores(st.value.data);
  };

  // Top Selling Items — synced to heroPeriod (today/week/month).
  const topListAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (API_TARGET === "official" && authLoading) {
      return;
    }
    let cancelled = false;
    const run = async () => {
      // Fade out current list before swapping data.
      Animated.timing(topListAnim, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();

      const applyAndFadeIn = (next: TopProduct[]) => {
        if (cancelled) return;
        setTopProducts(next);
        Animated.timing(topListAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      };

      if (API_TARGET === "official") {
        try {
          const officialTop = await fetchOfficialTopSellingItems(3, heroPeriod, {
            email,
            token,
          });
          if (cancelled) return;
          applyAndFadeIn(
            officialTop.map((item) => ({
              id: item.id,
              name: item.name,
              category: "",
              units: item.units,
              revenue: item.revenue,
              image: item.image,
            }))
          );
          return;
        } catch (err) {
          console.log("[top-items] fetch failed:", err);
          if (!cancelled) {
            setTopProducts([]);
            Animated.timing(topListAnim, {
              toValue: 1,
              duration: 160,
              useNativeDriver: true,
            }).start();
          }
          return;
        }
      }
      try {
        const { data } = await api.get<TopProduct[]>(
          `/dashboard/top-products?period=${heroPeriod}`
        );
        applyAndFadeIn(data.slice(0, 3));
      } catch {
        // Restore visibility if fetch failed so the stale list remains readable.
        if (!cancelled) {
          Animated.timing(topListAnim, {
            toValue: 1,
            duration: 160,
            useNativeDriver: true,
          }).start();
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [authLoading, email, heroPeriod, token, topListAnim]);

  useEffect(() => {
    if (API_TARGET === "official" && authLoading) {
      return;
    }

    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [authLoading, email, token]);

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
  const heroError = heroPeriod === "month" ? summaryError : chartError;

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
  const todayDerivedOrders =
    monthAvg > 0 ? Math.max(0, Math.round(todayRevenue / monthAvg)) : 0;
  const periodOrders =
    heroPeriod === "month"
      ? totalOrders
      : heroPeriod === "week"
      ? Math.round(totalOrders / 4.3)
      : todayDerivedOrders;
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
          <View style={styles.headerText}>
            <View style={styles.headerTopRow}>
              <Text style={styles.eyebrow}>
                {new Date()
                  .toLocaleDateString(locale, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })
                  .toUpperCase()}
              </Text>
            </View>
            <Text style={styles.greetingLine} numberOfLines={1}>
              <Text style={styles.greetingDim}>
                {greeting(t)}
                {identity.first ? ", " : ""}
              </Text>
              {identity.first ? (
                <Text style={styles.greetingName}>{identity.first}</Text>
              ) : null}
            </Text>
            {(() => {
              const online = modules.filter((m) => m.status === "online").length;
              const offline = modules.length - online;
              if (modules.length === 0) return null;
              return (
                <View style={styles.metaRow}>
                  <PulsingDot
                    color={offline === 0 ? SUCCESS : WARNING}
                    size={6}
                    active
                  />
                  <Text style={styles.metaText}>
                    {online} {t("modules_online")}
                    {offline > 0 ? ` · ${offline} ${t("modules_offline_status")}` : ""}
                  </Text>
                </View>
              );
            })()}
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
            {/* Store strip — tap to filter (visual compare for now) */}
            {stores.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.storeRow}
              >
                {stores.map((store) => {
                  const selected = store.id === selectedStoreId;
                  const online = store.status === "online";
                  return (
                    <Pressable
                      key={store.id}
                      accessibilityLabel={`${store.name}, $${store.today_revenue}`}
                      onPress={() => {
                        haptic.selection();
                        setSelectedStoreId(store.id);
                      }}
                      style={({ pressed }) => [
                        styles.storeChip,
                        selected && styles.storeChipActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.storeChipHeader}>
                        {store.is_aggregate ? (
                          <Ionicons name="albums-outline" size={12} color={selected ? GOLD : TEXT_DIM} />
                        ) : (
                          <PulsingDot
                            color={online ? SUCCESS : "#6b7280"}
                            size={6}
                            active={online}
                          />
                        )}
                        <Text
                          style={[styles.storeName, selected && styles.storeNameActive]}
                          numberOfLines={1}
                        >
                          {store.is_aggregate ? t("dashboard_all_stores") : store.name}
                        </Text>
                      </View>
                      <Text style={[styles.storeRevenue, selected && styles.storeRevenueActive]}>
                        ${store.today_revenue}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

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
                {heroError ? (
                  <Text style={styles.heroError}>Error</Text>
                ) : (
                  <AnimatedNumber
                    value={currentHero.value}
                    prefix="$"
                    decimals={2}
                    style={styles.heroValue}
                  />
                )}
                <View style={styles.heroFoot}>
                  {heroError ? (
                    <Text style={styles.heroHintError}>{heroError}</Text>
                  ) : (
                    <>
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
                            <Text style={[styles.heroBadgeText, { color }] }>
                              {isPositive ? "+" : ""}
                              {change.toFixed(1)}%
                            </Text>
                          </View>
                        );
                      })()}
                      <Text style={styles.heroHint}>{currentHero.hint}</Text>
                    </>
                  )}
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

            {/* Top Selling Items — vertical list with progress bars */}
            {topProducts.length > 0 && (
              <>
                <SectionLabel
                  label={`${t("dashboard_top_products")} · ${periodLabel}`}
                />
                <Animated.View
                  style={[
                    styles.topList,
                    {
                      opacity: topListAnim,
                      transform: [
                        {
                          translateY: topListAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [8, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  {(() => {
                    const maxUnits = Math.max(...topProducts.map((p) => p.units), 1);
                    return topProducts.map((p, i) => {
                      const pct = Math.max(0.04, p.units / maxUnits);
                      const initial = (p.name?.trim()?.[0] ?? "?").toUpperCase();
                      return (
                        <Pressable
                          key={p.id}
                          accessibilityLabel={`${p.name}, ${p.units} sold`}
                          onPress={() => {
                            haptic.light();
                            router.push("/(tabs)/products");
                          }}
                          style={({ pressed }) => [
                            styles.topRow,
                            i !== topProducts.length - 1 && styles.topRowDivider,
                            pressed && styles.pressed,
                          ]}
                        >
                          <View style={styles.topThumb}>
                            {p.image ? (
                              <Image
                                source={{ uri: p.image }}
                                style={styles.topThumbImage}
                                resizeMode="cover"
                              />
                            ) : (
                              <Text style={styles.topThumbText}>{initial}</Text>
                            )}
                          </View>
                          <View style={styles.topBody}>
                            <View style={styles.topBodyRow}>
                              <Text style={styles.topName} numberOfLines={1}>
                                {p.name}
                              </Text>
                              <Text style={styles.topUnits}>{p.units}</Text>
                            </View>
                            <View style={styles.topBarTrack}>
                              <View
                                style={[styles.topBarFill, { width: `${Math.round(pct * 100)}%` }]}
                              />
                            </View>
                          </View>
                        </Pressable>
                      );
                    });
                  })()}
                </Animated.View>
              </>
            )}

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
  headerText: { flex: 1, gap: 6 },
  headerTopRow: { flexDirection: "row", alignItems: "center" },
  eyebrow: {
    color: TEXT_FAINT,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 2,
  },
  greetingLine: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.2,
  },
  greetingDim: {
    color: TEXT_DIM,
    fontWeight: "500",
  },
  greetingName: {
    color: TEXT,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    color: TEXT_DIM,
    fontSize: 12,
    fontWeight: "500",
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
  heroError: {
    color: DANGER,
    fontSize: 36,
    fontWeight: "800",
    marginTop: 8,
    letterSpacing: -1.1,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heroBadgeText: { color: SUCCESS, fontSize: 12, fontWeight: "600" },
  heroHint: { color: TEXT_DIM, fontSize: 12, fontWeight: "500" },
  heroHintError: { color: DANGER, fontSize: 12, fontWeight: "600", flexShrink: 1 },

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

  // Store strip
  storeRow: { flexDirection: "row", gap: 8, paddingRight: SCREEN_PADDING },
  storeChip: {
    minWidth: 120,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    gap: 6,
  },
  storeChipActive: {
    borderColor: GOLD,
    backgroundColor: GOLD_DIM,
  },
  storeChipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  storeName: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  storeNameActive: { color: GOLD },
  storeRevenue: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "700",
  },
  storeRevenueActive: { color: TEXT },

  // Top Products
  // Top Selling Items
  topList: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    paddingHorizontal: 14,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  topRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CARD_BORDER,
  },
  topThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: GOLD_DIM,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  topThumbImage: {
    width: "100%",
    height: "100%",
  },
  topThumbText: {
    color: GOLD,
    fontSize: 15,
    fontWeight: "700",
  },
  topBody: { flex: 1, gap: 6 },
  topBodyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  topName: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  topUnits: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  topBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  topBarFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: GOLD,
  },
});
