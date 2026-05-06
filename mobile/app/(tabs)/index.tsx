import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useI18n } from "../../src/context/I18nContext";
import { useAuth } from "../../src/context/AuthContext";
import { API_TARGET, api } from "../../src/services/api";
import {
  fetchOfficialHeroRevenuePeriod,
  fetchOfficialMonthRevenueData,
  fetchOfficialRecentOrders,
  fetchOfficialTopSellingItems,
  fetchOfficialPosBreakdown,
  invalidateOfficialDashboardCaches,
} from "../../src/services/officialDashboard";
import { AnimatedNumber } from "../../src/components/AnimatedNumber";
import { PulsingDot } from "../../src/components/PulsingDot";
import { Skeleton } from "../../src/components/Skeleton";
import { haptic } from "../../src/utils/haptics";
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
} from "../../src/theme/tokens";
import { SectionLabel } from "../../src/components/SectionLabel";
import { TodayLineChart } from "../../src/components/TodayLineChart";
import { DonutChart } from "../../src/components/DonutChart";

type Summary = {
  today_sales: string;
  week_revenue?: string;
  today_orders?: number;
  week_orders?: number;
  total_orders: number;
  total_products: number;
  avg_order_value: string;
  total_revenue_month: string;
  today_items?: number;
  week_items?: number;
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

type DiningOption = {
  label: string;
  value: number;
  color: string;
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

function formatShortDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
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

// Pick a "nice" tick step so the Y-axis shows round numbers (1 / 2 / 2.5 / 5 × 10ⁿ).
function niceTickStep(rawMax: number): number {
  if (!isFinite(rawMax) || rawMax <= 0) return 1;
  const target = rawMax / 4;
  const exp = Math.floor(Math.log10(target));
  const pow = Math.pow(10, exp);
  const norm = target / pow;
  let nice: number;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 2.5) nice = 2.5;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * pow;
}

function shortMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Reliable dashed horizontal line for React Native.
 * `borderStyle: "dashed"` with `borderTopWidth` is unreliable across iOS/Android,
 * so we render explicit dash segments inside a flex row that fills its parent.
 */
function DashedLine({
  color,
  thickness = 1.5,
  dashWidth = 6,
  dashGap = 4,
}: {
  color: string;
  thickness?: number;
  dashWidth?: number;
  dashGap?: number;
}) {
  const [width, setWidth] = useState(0);
  const dashCount =
    width > 0 ? Math.max(1, Math.floor((width + dashGap) / (dashWidth + dashGap))) : 0;
  return (
    <View
      style={{
        flex: 1,
        height: thickness,
        flexDirection: "row",
        alignItems: "center",
        overflow: "hidden",
      }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {Array.from({ length: dashCount }).map((_, i) => (
        <View
          key={i}
          style={{
            width: dashWidth,
            height: thickness,
            backgroundColor: color,
            marginRight: i === dashCount - 1 ? 0 : dashGap,
          }}
        />
      ))}
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { email, token, firstName, lastName, loading: authLoading } = useAuth();
  const identity = buildIdentity(email, firstName, lastName);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [monthChart, setMonthChart] = useState<ChartPoint[]>([]);
  const [todayChart, setTodayChart] = useState<ChartPoint[]>([]);
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [heroPeriod, setHeroPeriod] = useState<"month" | "week" | "today">("month");
  const [chartOpen, setChartOpen] = useState(false);
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const [barTrackH, setBarTrackH] = useState(0);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  // Ticks every 60s while the detail modal is open. Drives the "current hour"
  // indicator and triggers a quiet refresh of today's hourly data.
  const [nowTick, setNowTick] = useState(0);
  // "See all top items" modal state.
  const [topAllOpen, setTopAllOpen] = useState(false);
  const [topAll, setTopAll] = useState<TopProduct[]>([]);
  const [topAllLoading, setTopAllLoading] = useState(false);
  const [topAllError, setTopAllError] = useState<string | null>(null);
  const [diningOptions, setDiningOptions] = useState<DiningOption[]>([]);
  // Once we've shown the dining card, keep it mounted so the period-switch
  // fade animation always plays even when a period returns empty data.
  const [diningEverHadData, setDiningEverHadData] = useState(false);
  const [salesMethods, setSalesMethods] = useState<DiningOption[]>([]);
  const [salesMethodEverHadData, setSalesMethodEverHadData] = useState(false);

  // Mapping of API dine option names to display labels and colors
  const dineOptionConfig: Record<string, { label: string; color: string }> = {
    DINEDIN: { label: "Dine-In", color: "#FF6B6B" },
    TAKEAWAY: { label: "Takeaway", color: "#4ECDC4" },
    UBEREATS: { label: "UberEats", color: "#45B7D1" },
    "IN_STORE": { label: "In-Store", color: "#FF6B6B" },
    "DELIVERY": { label: "Delivery", color: "#45B7D1" },
  };

  // Mapping of API payment method names to display labels and colors
  const salesMethodConfig: Record<string, { label: string; color: string }> = {
    CASH: { label: "Cash", color: "#22C55E" },
    ANZNFC: { label: "ANZ NFC", color: "#3B82F6" },
    CARD: { label: "Card", color: "#3B82F6" },
    EFTPOS: { label: "EFTPOS", color: "#8B5CF6" },
    APPLEPAY: { label: "Apple Pay", color: "#A1A1AA" },
    GOOGLEPAY: { label: "Google Pay", color: "#F59E0B" },
  };
  // Fallback color palette for unrecognised method keys.
  const salesMethodPalette = [
    "#22C55E",
    "#3B82F6",
    "#8B5CF6",
    "#F59E0B",
    "#EC4899",
    "#06B6D4",
  ];

  const fetchAll = async () => {
    const currentAuth = { email, token };

    if (API_TARGET === "official") {
      setSummary(null);
      setChart([]);
      setMonthChart([]);
      setTodayChart([]);
      setOrders([]);
      setSummaryError(null);
      setChartError(null);

      const [summaryResult, ordersResult] = await Promise.allSettled([
        fetchOfficialMonthRevenueData(currentAuth),
        fetchOfficialRecentOrders(currentAuth),
      ]);

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value.summary);
      } else {
        setSummaryError("Unable to load month revenue for this account.");
      }

      if (ordersResult.status === "fulfilled") {
        setOrders(ordersResult.value);
      }

      // These endpoints are not available in the current backend.
      setModules([]);
      setStores([]);
      return;
    }

    const [s, o] = await Promise.allSettled([
      api.get<Summary>("/dashboard/summary"),
      api.get<RecentOrder[]>("/dashboard/recent-orders"),
    ]);

    if (s.status === "fulfilled") {
      setSummary(s.value.data);
      setSummaryError(null);
    }
    setChart([]);
    setMonthChart([]);
    setTodayChart([]);
    setChartError("Revenue chart endpoint is not configured for this backend.");
    if (o.status === "fulfilled") {
      setOrders(o.value.data);
    }
    setModules([]);
    setStores([]);
  };

  // Load only the active hero period chart for official API.
  useEffect(() => {
    if (API_TARGET !== "official") return;
    if (authLoading) return;

    const hasDataForPeriod =
      heroPeriod === "week"
        ? chart.length > 0
        : heroPeriod === "month"
        ? monthChart.length > 0
        : todayChart.length > 0;
    if (hasDataForPeriod) return;

    let cancelled = false;
    const currentAuth = { email, token };
    setChartError(null);

    (async () => {
      try {
        const series = await fetchOfficialHeroRevenuePeriod(heroPeriod, currentAuth);
        if (cancelled) return;

        if (heroPeriod === "week") setChart(series);
        else if (heroPeriod === "month") setMonthChart(series);
        else setTodayChart(series);
      } catch {
        if (!cancelled) {
          setChartError("Unable to load revenue chart for this period.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    email,
    token,
    heroPeriod,
    chart.length,
    monthChart.length,
    todayChart.length,
  ]);

  // Sparkline fade-cross when heroPeriod changes (number of bars differs per period).
  const sparkAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    sparkAnim.setValue(0);
    Animated.timing(sparkAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [heroPeriod, sparkAnim]);

  // Detail-chart bar grow-in animation (replays on period change or modal open).
  const barAnim = useRef(new Animated.Value(0)).current;
  // Detail-chart page zoom/fade-in animation.
  const modalAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!chartOpen) return;
    setSelectedBar(null);
    barAnim.setValue(0);
    Animated.timing(barAnim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [chartOpen, heroPeriod, barAnim]);

  useEffect(() => {
    if (chartOpen) {
      modalAnim.setValue(0);
      Animated.timing(modalAnim, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [chartOpen, modalAnim]);

  // Cross-fade between datasets when the period changes inside the modal.
  // The chart container fades + slides from 0→12→full to make the swap feel
  // intentional rather than a hard cut.
  const chartFadeAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!chartOpen) return;
    chartFadeAnim.setValue(0);
    Animated.timing(chartFadeAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [heroPeriod, chartOpen, chartFadeAnim]);

  // While the modal is open, tick every 60s so the "current hour" indicator
  // stays accurate and today's hourly data is quietly refreshed in the
  // background. The 60s TTL on the order cache keeps this cheap.
  useEffect(() => {
    if (!chartOpen) return;
    let cancelled = false;

    const refreshTodayChart = async () => {
      if (API_TARGET !== "official") return;
      if (heroPeriod !== "today") return;
      if (authLoading || !email || !token) return;
      try {
        const series = await fetchOfficialHeroRevenuePeriod("today", {
          email,
          token,
        });
        if (!cancelled) {
          setTodayChart(series);
        }
      } catch {
        // Ignore transient background refresh failures.
      }
    };

    const id = setInterval(() => {
      setNowTick((t) => t + 1);
      void refreshTodayChart();
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [authLoading, chartOpen, email, heroPeriod, token]);

  const closeChartModal = () => {
    Animated.timing(modalAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setChartOpen(false);
    });
  };

  // Dining Options & Sales Methods — synced to heroPeriod (today/week/month).
  const diningAnim = useRef(new Animated.Value(1)).current;
  const salesMethodAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (API_TARGET === "official" && authLoading) {
      return;
    }
    let cancelled = false;
    const run = async () => {
      // Fade out both charts in parallel before swapping data.
      Animated.parallel([
        Animated.timing(diningAnim, {
          toValue: 0,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(salesMethodAnim, {
          toValue: 0,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();

      const applyDining = (next: DiningOption[]) => {
        if (cancelled) return;
        setDiningOptions(next);
        if (next.length > 0) setDiningEverHadData(true);
        requestAnimationFrame(() => {
          if (cancelled) return;
          Animated.timing(diningAnim, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        });
      };

      const applySalesMethods = (next: DiningOption[]) => {
        if (cancelled) return;
        setSalesMethods(next);
        if (next.length > 0) setSalesMethodEverHadData(true);
        requestAnimationFrame(() => {
          if (cancelled) return;
          Animated.timing(salesMethodAnim, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        });
      };

      const mapDiningEntries = (data: Record<string, number>): DiningOption[] =>
        Object.entries(data)
          .map(([key, value]) => {
            const config = dineOptionConfig[key.toUpperCase()];
            return {
              label: config?.label || key,
              value: value as number,
              color: config?.color || "#999",
            };
          })
          .filter((item) => item.value > 0)
          .sort((a, b) => b.value - a.value);

      const mapMethodEntries = (data: Record<string, number>): DiningOption[] =>
        Object.entries(data)
          .map(([key, value], idx) => {
            const config = salesMethodConfig[key.toUpperCase()];
            return {
              label: config?.label || key,
              value: value as number,
              color:
                config?.color ||
                salesMethodPalette[idx % salesMethodPalette.length],
            };
          })
          .filter((item) => item.value > 0)
          .sort((a, b) => b.value - a.value);

      if (API_TARGET === "official") {
        try {
          const breakdown = await fetchOfficialPosBreakdown(heroPeriod, {
            email,
            token,
          });
          applyDining(mapDiningEntries(breakdown.sales_by_dine_option));
          applySalesMethods(mapMethodEntries(breakdown.sales_by_method));
          return;
        } catch (err) {
          console.log("[pos-breakdown] fetch failed:", err);
          applyDining([]);
          applySalesMethods([]);
          return;
        }
      }

      // For non-official API
      try {
        const { data } = await api.get<Record<string, number>>(
          `/dashboard/dining-options?period=${heroPeriod}`
        );
        applyDining(mapDiningEntries(data));
      } catch {
        console.log("[dining-options] fetch failed");
        applyDining([]);
      }
      try {
        const { data } = await api.get<Record<string, number>>(
          `/dashboard/sales-methods?period=${heroPeriod}`
        );
        applySalesMethods(mapMethodEntries(data));
      } catch {
        console.log("[sales-methods] fetch failed");
        applySalesMethods([]);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [authLoading, email, heroPeriod, token, diningAnim, salesMethodAnim]);

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
    if (API_TARGET === "official") {
      invalidateOfficialDashboardCaches();
      // Clear in-component series so the period-loader re-fetches the
      // currently-active hero chart after caches are dropped.
      setChart([]);
      setMonthChart([]);
      setTodayChart([]);
    }
    await fetchAll();
    haptic.success();
    setRefreshing(false);
  };

  const maxRevenue = Math.max(...chart.map((p) => p.revenue), 1);

  const weekRevenue = chart.reduce((acc, p) => acc + p.revenue, 0);
  const todayRevenue =
    API_TARGET === "official"
      ? parseMoney(summary?.today_sales)
      : chart.length > 0
      ? chart[chart.length - 1].revenue
      : parseMoney(summary?.today_sales);

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
  const heroDateRange = (() => {
    const now = new Date();
    if (heroPeriod === "today") {
      return formatShortDate(now, locale);
    }
    if (heroPeriod === "week") {
      const start = new Date(now);
      const dow = start.getDay() || 7; // Mon=1 ... Sun=7
      start.setDate(start.getDate() - (dow - 1));
      return `${formatShortDate(start, locale)} - ${formatShortDate(now, locale)}`;
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return `${formatShortDate(start, locale)} - ${formatShortDate(now, locale)}`;
  })();

  // Build period sparkline.
  const displayChart: ChartPoint[] = (() => {
    if (API_TARGET === "official") {
      if (heroPeriod === "week") return chart;
      if (heroPeriod === "today") return todayChart;
      return monthChart;
    }
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
  const currentTodayBucketLabel = (() => {
    // Recompute when nowTick changes so the indicator follows the clock.
    void nowTick;
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:00`;
  })();

  // Hero sparkline: 3-hour buckets (8 bars) aggregated from the 24-point today series
  // for the small bar chart next to "Today revenue". Modal still uses the full 24-pt set.
  const heroChart: ChartPoint[] =
    heroPeriod === "today" && displayChart.length > 0
      ? (() => {
          const slotHours = [0, 3, 6, 9, 12, 15, 18, 21];
          const slotLabel = (h: number) => {
            const suffix = h >= 12 ? "p" : "a";
            const h12 = h % 12 === 0 ? 12 : h % 12;
            return `${h12}${suffix}`;
          };
          return slotHours.map((slotStart) => {
            let revenue = 0;
            for (let h = slotStart; h < slotStart + 3 && h < 24; h++) {
              const point = displayChart.find(
                (p) => p.day === `${String(h).padStart(2, "0")}:00`
              );
              if (point) revenue += point.revenue;
            }
            return { day: slotLabel(slotStart), revenue };
          });
        })()
      : displayChart;
  const heroChartMax = Math.max(...heroChart.map((p) => p.revenue), 1);
  const currentHeroBucketLabel = (() => {
    void nowTick;
    if (heroPeriod === "month") {
      const now = new Date();
      const day = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const bucket = Math.min(4, Math.floor(((day - 1) * 4) / daysInMonth) + 1);
      return `W${bucket}`;
    }
    if (heroPeriod === "week") {
      return new Date().toLocaleDateString(locale, { weekday: "short" });
    }
    if (heroPeriod !== "today") return currentTodayBucketLabel;
    const h = new Date().getHours();
    const slot = Math.floor(h / 3) * 3;
    const suffix = slot >= 12 ? "p" : "a";
    const h12 = slot % 12 === 0 ? 12 : slot % 12;
    return `${h12}${suffix}`;
  })();

  // KPI values scaled to hero period (approximations when period-specific data isn't available).
  const totalOrders = summary?.total_orders ?? 0;
  const monthAvg = parseMoney(summary?.avg_order_value);
  const todayDerivedOrders =
    monthAvg > 0 ? Math.max(0, Math.round(todayRevenue / monthAvg)) : 0;
  const periodOrders =
    API_TARGET === "official"
      ? heroPeriod === "month"
        ? totalOrders
        : heroPeriod === "week"
        ? summary?.week_orders ?? 0
        : summary?.today_orders ?? 0
      : heroPeriod === "month"
      ? totalOrders
      : heroPeriod === "week"
      ? Math.round(totalOrders / 4.3)
      : todayDerivedOrders;
  // Derive period avg from period sales / period orders.
  // If there are no orders in the selected period, avg order should be zero.
  const avgOrder =
    periodOrders > 0 ? currentHero.value / periodOrders : 0;
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
  const periodItems =
    API_TARGET === "official"
      ? heroPeriod === "month"
        ? summary?.total_products ?? 0
        : heroPeriod === "week"
        ? summary?.week_items ?? 0
        : summary?.today_items ?? 0
      : Math.round(periodOrders * avgItemsPerOrder);
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
                  <Text style={styles.heroRange}>{heroDateRange}</Text>
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
                    maxDecimals={2}
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
                <Pressable
                  accessibilityLabel={`Open detailed ${currentHero.label} chart`}
                  onPress={() => {
                    haptic.light();
                    setChartOpen(true);
                  }}
                  hitSlop={6}
                >
                  <Animated.View
                    style={[
                      styles.spark,
                      {
                        opacity: sparkAnim,
                        transform: [
                          {
                            translateY: sparkAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [4, 0],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    {heroChart.map((p, i) => {
                      const heightPct = Math.max(p.revenue / heroChartMax, 0.08);
                      const isLast = i === heroChart.length - 1;
                      const isActive =
                        heroPeriod === "today" || heroPeriod === "month"
                          ? p.day === currentHeroBucketLabel
                          : isLast;
                      return (
                        <View key={`${heroPeriod}-${p.day}-${i}`} style={styles.sparkCol}>
                          <View
                            style={[
                              styles.sparkBar,
                              { height: `${Math.round(heightPct * 100)}%` },
                              isActive && styles.sparkBarActive,
                            ]}
                          />
                          <Text style={[styles.sparkLabel, isActive && styles.sparkLabelActive]}>
                            {p.day}
                          </Text>
                        </View>
                      );
                    })}
                  </Animated.View>
                </Pressable>
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
                  right={
                    <Pressable
                      accessibilityLabel={`See all top items for ${periodLabel}`}
                      onPress={() => {
                        haptic.selection();
                        setTopAllOpen(true);
                        setTopAllError(null);
                        setTopAllLoading(true);
                        (async () => {
                          try {
                            if (API_TARGET === "official") {
                              const all = await fetchOfficialTopSellingItems(
                                50,
                                heroPeriod,
                                { email, token }
                              );
                              setTopAll(
                                all.map((it) => ({
                                  id: it.id,
                                  name: it.name,
                                  category: "",
                                  units: it.units,
                                  revenue: it.revenue,
                                  image: it.image,
                                }))
                              );
                            } else {
                              const { data } = await api.get<TopProduct[]>(
                                `/dashboard/top-products?period=${heroPeriod}&limit=50`
                              );
                              setTopAll(data);
                            }
                          } catch (err) {
                            console.log("[top-items-all] fetch failed:", err);
                            setTopAllError("Unable to load items.");
                            setTopAll([]);
                          } finally {
                            setTopAllLoading(false);
                          }
                        })();
                      }}
                      style={({ pressed }) => [
                        styles.seeAllChip,
                        pressed && styles.seeAllChipPressed,
                      ]}
                      hitSlop={6}
                    >
                      <Text style={styles.seeAll}>{t("dashboard_see_all")}</Text>
                      <Ionicons name="chevron-forward" size={13} color={TEXT_DIM} />
                    </Pressable>
                  }
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

            {/* Dining Options */}
            {(diningOptions.length > 0 || diningEverHadData) && (
              <>
                <SectionLabel
                  label={`${t("dashboard_dining_options")} · ${periodLabel}`}
                />
                <Animated.View
                  style={[
                    styles.diningCard,
                    {
                      opacity: diningAnim,
                      transform: [
                        {
                          scale: diningAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.96, 1],
                          }),
                        },
                        {
                          translateY: diningAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [8, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={styles.diningChartContainer}>
                    {diningOptions.length > 0 ? (
                      <DonutChart items={diningOptions} width={240} height={200} radius={50} strokeWidth={28} />
                    ) : (
                      <View style={styles.diningEmpty}>
                        <Text style={styles.diningEmptyText}>{t("dashboard_no_recent_orders")}</Text>
                      </View>
                    )}
                  </View>
                </Animated.View>
              </>
            )}

            {/* Sales Methods */}
            {(salesMethods.length > 0 || salesMethodEverHadData) && (
              <>
                <SectionLabel
                  label={`${t("dashboard_sales_methods")} · ${periodLabel}`}
                />
                <Animated.View
                  style={[
                    styles.diningCard,
                    {
                      opacity: salesMethodAnim,
                      transform: [
                        {
                          scale: salesMethodAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.96, 1],
                          }),
                        },
                        {
                          translateY: salesMethodAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [8, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={styles.diningChartContainer}>
                    {salesMethods.length > 0 ? (
                      <DonutChart items={salesMethods} width={240} height={200} radius={50} strokeWidth={28} />
                    ) : (
                      <View style={styles.diningEmpty}>
                        <Text style={styles.diningEmptyText}>{t("dashboard_no_recent_orders")}</Text>
                      </View>
                    )}
                  </View>
                </Animated.View>
              </>
            )}

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
                  style={({ pressed }) => [
                    styles.seeAllChip,
                    pressed && styles.seeAllChipPressed,
                  ]}
                  hitSlop={6}
                >
                  <Text style={styles.seeAll}>{t("dashboard_see_all")}</Text>
                  <Ionicons name="chevron-forward" size={13} color={TEXT_DIM} />
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

      {/* All top selling items — opens from the section "See all" link */}
      <Modal
        visible={topAllOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTopAllOpen(false)}
      >
        <SafeAreaView style={styles.modalPage} edges={["top", "bottom"]}>
          <View style={styles.modalStickyHead}>
            <View style={styles.modalHead}>
              <View style={styles.modalHeadTopRow}>
                <Text style={styles.modalEyebrow} numberOfLines={1}>
                  {t("dashboard_top_products")} · {periodLabel}
                </Text>
                <Pressable
                  accessibilityLabel="Close"
                  onPress={() => {
                    haptic.selection();
                    setTopAllOpen(false);
                  }}
                  style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color={TEXT} />
                </Pressable>
              </View>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {topAll.length > 0
                  ? `${topAll.length} ${topAll.length === 1 ? "item" : "items"}`
                  : topAllLoading
                    ? "Loading…"
                    : "No items"}
              </Text>
            </View>
          </View>

          {topAllLoading ? (
            <View style={{ padding: SCREEN_PADDING, gap: 10 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} height={60} radius={12} />
              ))}
            </View>
          ) : topAllError ? (
            <View style={styles.emptyBlock}>
              <Ionicons name="alert-circle-outline" size={26} color={DANGER} />
              <Text style={styles.emptyText}>{topAllError}</Text>
            </View>
          ) : topAll.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Ionicons name="cube-outline" size={26} color={TEXT_DIM} />
              <Text style={styles.emptyText}>No items sold for this period.</Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.topList}>
                {(() => {
                  const maxUnits = Math.max(...topAll.map((p) => p.units), 1);
                  return topAll.map((p, i) => {
                    const pct = Math.max(0.04, p.units / maxUnits);
                    const initial = (p.name?.trim()?.[0] ?? "?").toUpperCase();
                    return (
                      <Pressable
                        key={`${p.id}-${i}`}
                        accessibilityLabel={`${p.name}, ${p.units} sold`}
                        onPress={() => {
                          haptic.light();
                          setTopAllOpen(false);
                          router.push("/(tabs)/products");
                        }}
                        style={({ pressed }) => [
                          styles.topRow,
                          i !== topAll.length - 1 && styles.topRowDivider,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.topAllRank}>{i + 1}</Text>
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
                              style={[
                                styles.topBarFill,
                                { width: `${Math.round(pct * 100)}%` },
                              ]}
                            />
                          </View>
                        </View>
                      </Pressable>
                    );
                  });
                })()}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Detailed chart modal — opens from the hero sparkline */}
      <Modal
        visible={chartOpen}
        animationType="none"
        transparent
        onRequestClose={closeChartModal}
        statusBarTranslucent
        hardwareAccelerated
      >
        <SafeAreaProvider>
        <Animated.View
          style={[
            styles.modalPage,
            {
              opacity: modalAnim,
              transform: [
                {
                  scale: modalAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.995, 1],
                  }),
                },
              ],
            },
          ]}
        >
        <SafeAreaView style={styles.modalPage} edges={["top", "bottom"]}>
          <StatusBar barStyle="light-content" />
          {/* Sticky header (title + period tabs) — slides up first */}
          <Animated.View
            style={{
              opacity: modalAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0.6, 1],
              }),
              transform: [
                {
                  translateY: modalAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [28, 0],
                  }),
                },
              ],
            }}
          >
          <View style={styles.modalStickyHead}>
            {/* Modal header */}
            <View style={styles.modalHead}>
              <View style={styles.modalHeadTopRow}>
                <Text style={styles.modalEyebrow} numberOfLines={1}>
                  {currentHero.label}
                </Text>
                <Pressable
                  accessibilityLabel="Close"
                  onPress={() => {
                    haptic.selection();
                    closeChartModal();
                  }}
                  style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color={TEXT} />
                </Pressable>
              </View>
              <Text style={styles.modalTitle} numberOfLines={1}>
                ${currentHero.value.toLocaleString(locale, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
              <View style={styles.modalSubRow}>
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
                <Text style={styles.modalSub}>{heroDateRange}</Text>
              </View>
            </View>

            {/* Period segmented tabs */}
            <View style={styles.modalTabs}>
              {(["today", "week", "month"] as const).map((p) => {
                const active = heroPeriod === p;
                return (
                  <Pressable
                    key={p}
                    accessibilityLabel={`Show ${p} chart`}
                    onPress={() => {
                      haptic.selection();
                      setHeroPeriod(p);
                    }}
                    style={[styles.modalTab, active && styles.modalTabActive]}
                  >
                    <Text
                      style={[
                        styles.modalTabText,
                        active && styles.modalTabTextActive,
                      ]}
                    >
                      {p === "today" ? t("dashboard_period_today") : p === "week" ? t("dashboard_period_this_week") : t("dashboard_period_this_month")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          </Animated.View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={{
                gap: 18,
                opacity: modalAnim.interpolate({
                  inputRange: [0, 0.4, 1],
                  outputRange: [0, 0, 1],
                }),
                transform: [
                  {
                    translateY: modalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [40, 0],
                    }),
                  },
                ],
              }}
            >

            {/* Detailed bar chart */}
            {(() => {
              const peakIdx = displayChart.reduce(
                (best, p, i) => (p.revenue > displayChart[best].revenue ? i : best),
                0
              );
              // Slowest = lowest non-zero bucket (zero-revenue hours are usually
              // "shop closed" rather than meaningful slow periods). Falls back to
              // the absolute min if every bucket is zero.
              const nonZeroIdxs = displayChart
                .map((p, i) => (p.revenue > 0 ? i : -1))
                .filter((i) => i >= 0);
              const worstIdx =
                nonZeroIdxs.length > 0
                  ? nonZeroIdxs.reduce(
                      (worst, i) =>
                        displayChart[i].revenue < displayChart[worst].revenue ? i : worst,
                      nonZeroIdxs[0]
                    )
                  : displayChart.reduce(
                      (worst, p, i) => (p.revenue < displayChart[worst].revenue ? i : worst),
                      0
                    );
              const peak = displayChart[peakIdx]?.revenue ?? 0;
              const chartSum = displayChart.reduce((a, p) => a + p.revenue, 0);
              // Use the authoritative hero value as the period total — the chart is a
              // visual breakdown that may not perfectly sum to it (e.g. partial today data).
              const total =
                currentHero.value > 0 ? currentHero.value : chartSum;
              // Average reference line should reflect what the chart actually shows so
              // the dashed line never floats above the tallest bar. We average across
              // active (non-zero) buckets — meaningful for sparse intraday data.
              const activeBuckets = displayChart.filter((p) => p.revenue > 0).length;
              const avg =
                activeBuckets > 0
                  ? chartSum / activeBuckets
                  : displayChart.length > 0
                    ? chartSum / displayChart.length
                    : 0;

              // Nice Y-axis ticks: pick a round step so labels read $0/$1.5k/$3k/...
              const tickStep = niceTickStep(displayMax);
              const niceMax = Math.max(tickStep * 4, displayMax);
              const ticks = [4, 3, 2, 1, 0].map((m) => tickStep * m);

              const inspected = selectedBar !== null ? displayChart[selectedBar] : null;
              const inspectedShare =
                inspected && total > 0 ? (inspected.revenue / total) * 100 : 0;

              return (
                <>
                  {/* Inspector strip — updates when a bar is tapped */}
                  <View style={styles.inspector}>
                    {inspected ? (
                      <>
                        <View style={styles.inspectorDot} />
                        <Text style={styles.inspectorLabel}>{inspected.day}</Text>
                        <Text style={styles.inspectorValue}>
                          ${inspected.revenue.toLocaleString(locale, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </Text>
                        <Text style={styles.inspectorMeta}>
                          {inspectedShare.toFixed(1)}% of total
                        </Text>
                        <Pressable
                          accessibilityLabel="Clear selection"
                          hitSlop={8}
                          onPress={() => setSelectedBar(null)}
                          style={styles.inspectorClear}
                        >
                          <Ionicons name="close" size={12} color={TEXT_DIM} />
                        </Pressable>
                      </>
                    ) : (
                      <Text style={styles.inspectorHint}>
                        Tap a point to inspect
                      </Text>
                    )}
                  </View>

                  <Animated.View
                    style={{
                      opacity: chartFadeAnim,
                      transform: [
                        {
                          translateY: chartFadeAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [12, 0],
                          }),
                        },
                      ],
                    }}
                  >
                    <View style={styles.todayChartWrap}>
                      <TodayLineChart
                        data={displayChart}
                        niceMax={niceMax}
                        ticks={ticks}
                        avg={avg}
                        formatMoney={shortMoney}
                        currentLabel={
                          heroPeriod === "today"
                            ? currentTodayBucketLabel
                            : currentHeroBucketLabel
                        }
                        selectedIndex={selectedBar}
                        onSelectIndex={setSelectedBar}
                        height={302}
                        xLabelEvery={heroPeriod === "today" ? 3 : 1}
                      />
                    </View>
                  </Animated.View>

                  {/* Chart legend */}
                  <View style={styles.chartLegendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendSwatch, { backgroundColor: GOLD }]} />
                      <Text style={styles.legendText}>Revenue</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={styles.legendDashWrap}>
                        <DashedLine color={SUCCESS} dashWidth={4} dashGap={3} thickness={1.5} />
                      </View>
                      <Text style={styles.legendText}>Average per period</Text>
                    </View>
                  </View>

                  {/* Footer KPIs */}
                  <View style={styles.modalKpiRow}>
                    <View style={styles.modalKpi}>
                      <Text style={styles.modalKpiLabel}>Total</Text>
                      <Text style={styles.modalKpiValue}>
                        ${total.toLocaleString(locale, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                    </View>
                    <View style={styles.modalKpiDivider} />
                    <View style={styles.modalKpi}>
                      <Text style={styles.modalKpiLabel}>Avg / active</Text>
                      <Text style={styles.modalKpiValue}>
                        ${avg.toLocaleString(locale, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                    </View>
                    <View style={styles.modalKpiDivider} />
                    <Pressable
                      style={styles.modalKpi}
                      onPress={() => {
                        haptic.selection();
                        setSelectedBar(peakIdx);
                      }}
                      accessibilityLabel="Highlight peak bucket"
                    >
                      <Text style={styles.modalKpiLabel}>Peak</Text>
                      <Text style={[styles.modalKpiValue, { color: GOLD }]}>
                        ${peak.toLocaleString(locale, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Best / slowest callouts */}
                  {displayChart.length > 1 && (
                    <View style={styles.calloutRow}>
                      <Pressable
                        style={[styles.callout, styles.calloutBest]}
                        onPress={() => {
                          haptic.selection();
                          setSelectedBar(peakIdx);
                        }}
                        accessibilityLabel="Highlight best bucket"
                      >
                        <Ionicons name="trending-up" size={12} color={SUCCESS} />
                        <Text style={styles.calloutLabel}>Best</Text>
                        <Text style={styles.calloutValue}>
                          {displayChart[peakIdx]?.day} · {shortMoney(peak)}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.callout, styles.calloutWorst]}
                        onPress={() => {
                          haptic.selection();
                          setSelectedBar(worstIdx);
                        }}
                        accessibilityLabel="Highlight slowest bucket"
                      >
                        <Ionicons name="trending-down" size={12} color={DANGER} />
                        <Text style={styles.calloutLabel}>Slowest</Text>
                        <Text style={styles.calloutValue}>
                          {displayChart[worstIdx]?.day} ·{" "}
                          {shortMoney(displayChart[worstIdx]?.revenue ?? 0)}
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  <Pressable
                    accessibilityLabel="View full sales report"
                    onPress={() => {
                      haptic.medium();
                      closeChartModal();
                      router.push("/(tabs)/sales");
                    }}
                    style={({ pressed }) => [
                      styles.modalCta,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.modalCtaText}>View full report</Text>
                    <Ionicons name="arrow-forward" size={14} color="#181e38" />
                  </Pressable>
                </>
              );
            })()}
            </Animated.View>
          </ScrollView>
        </SafeAreaView>
        </Animated.View>
        </SafeAreaProvider>
      </Modal>
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
  heroRange: {
    color: TEXT_FAINT,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.2,
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

  // Sparkline inside hero — fixed footprint so heroLeft doesn't shift between periods (4/7/8 bars)
  spark: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    gap: 4,
    height: 64,
    width: 80,
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

  // ─── Detailed chart full-page ─────────────────────────────────────────
  modalPage: {
    flex: 1,
    backgroundColor: BG,
  },
  modalStickyHead: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: BG,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CARD_BORDER,
  },
  modalContent: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 20,
  },
  modalScrollContent: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 18,
  },
  modalHead: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  modalHeadTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modalEyebrow: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    flex: 1,
  },
  modalTitle: {
    color: TEXT,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -1.2,
    marginTop: 6,
  },
  modalSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  modalSub: {
    color: TEXT_DIM,
    fontSize: 12,
    fontWeight: "500",
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },

  // Period underline tabs
  modalTabs: {
    flexDirection: "row",
    gap: 8,
  },
  modalTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  modalTabActive: {
    borderBottomColor: GOLD,
  },
  modalTabText: {
    color: TEXT_DIM,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  modalTabTextActive: {
    color: GOLD,
    fontWeight: "700",
  },

  // Detailed chart
  detailChartWrap: {
    height: 320,
    paddingTop: 18,
    paddingLeft: 44,
    paddingRight: 4,
  },
  todayChartWrap: {
    height: 302,
    paddingTop: 0,
    paddingLeft: 0,
    paddingRight: 0,
  },
  gridlines: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 18,
    paddingBottom: 36,
    justifyContent: "space-between",
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  gridLabel: {
    width: 38,
    textAlign: "right",
    color: TEXT_FAINT,
    fontSize: 9,
    fontWeight: "600",
  },
  gridLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: CARD_BORDER,
  },
  detailBars: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
  },
  detailCol: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    height: "100%",
  },
  detailValue: {
    fontSize: 9,
    color: TEXT_DIM,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  detailValuePeak: {
    color: GOLD,
  },
  detailBarTrack: {
    flex: 1,
    width: "100%",
    flexDirection: "column-reverse",
    borderRadius: 6,
    overflow: "hidden",
  },
  detailBarFill: {
    width: "100%",
    backgroundColor: "rgba(212,175,55,0.22)",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    minHeight: 3,
  },
  detailBarFillActive: {
    backgroundColor: "rgba(212,175,55,0.55)",
  },
  detailBarFillPeak: {
    backgroundColor: GOLD,
  },
  detailLabel: {
    fontSize: 10,
    color: TEXT_DIM,
    fontWeight: "600",
  },
  detailLabelActive: {
    color: TEXT,
    fontWeight: "700",
  },
  detailLabelSelected: {
    color: GOLD,
    fontWeight: "700",
  },
  detailValueSelected: {
    color: GOLD,
    fontSize: 11,
  },
  detailColWeekend: {
    backgroundColor: "rgba(255,255,255,0.025)",
    borderRadius: 6,
  },
  detailBarFillSelected: {
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  detailBarPrev: {
    position: "absolute",
    left: "20%",
    right: "20%",
    bottom: 0,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 4,
  },

  // Inspector strip
  inspector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    minHeight: 36,
  },
  inspectorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD,
  },
  inspectorLabel: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "700",
  },
  inspectorValue: {
    color: GOLD,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  inspectorMeta: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "600",
    marginLeft: "auto",
  },
  inspectorClear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  inspectorHint: {
    color: TEXT_FAINT,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
  },

  // Average reference line
  avgLineWrap: {
    position: "absolute",
    left: 44,
    right: 4,
    height: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: -9,
    zIndex: 10,
    elevation: 10,
  },
  avgLine: {
    flex: 1,
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: "dashed",
    borderColor: SUCCESS,
  },
  avgLineLabel: {
    color: "#0b1220",
    backgroundColor: SUCCESS,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },

  // Legend
  chartLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 4,
  },
  legendDash: {
    width: 18,
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: "dashed",
    borderColor: SUCCESS,
  },
  legendDashWrap: {
    width: 18,
    height: 1.5,
    flexDirection: "row",
    alignItems: "center",
  },
  chartLegend: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendSwatchDash: {
    width: 14,
    height: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: SUCCESS_DIM,
  },
  legendText: {
    color: TEXT_DIM,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
  },

  // Best / slowest callouts
  calloutRow: {
    flexDirection: "row",
    gap: 10,
  },
  callout: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  calloutBest: {
    borderColor: SUCCESS_DIM,
  },
  calloutWorst: {
    borderColor: "rgba(239,68,68,0.25)",
  },
  calloutLabel: {
    color: TEXT_DIM,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  calloutValue: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },

  // Modal KPI row
  modalKpiRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  modalKpi: {
    flex: 1,
    gap: 4,
    paddingHorizontal: 4,
  },
  modalKpiDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: CARD_BORDER,
    marginHorizontal: 4,
  },
  modalKpiLabel: {
    fontSize: 10,
    color: TEXT_DIM,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  modalKpiValue: {
    fontSize: 16,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -0.3,
  },

  // Modal CTA
  modalCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 14,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  modalCtaText: {
    color: "#181e38",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
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

  seeAll: {
    fontSize: 12,
    color: TEXT,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  seeAllChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  seeAllChipPressed: {
    opacity: 0.5,
  },

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
  topAllRank: {
    width: 22,
    textAlign: "center",
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.4,
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
  diningCard: {
    backgroundColor: CARD,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  diningChartContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  diningEmpty: {
    height: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  diningEmptyText: {
    color: TEXT_DIM,
    fontSize: 13,
    fontWeight: "600",
  },
});
