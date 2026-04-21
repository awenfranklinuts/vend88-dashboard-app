import { useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/src/context/I18nContext";
import { API_TARGET, api } from "@/src/services/api";
import { fetchOfficialSalesHistory } from "@/src/services/officialDashboard";
import { AnimatedNumber } from "@/src/components/AnimatedNumber";
import { Skeleton } from "@/src/components/Skeleton";
import { haptic } from "@/src/utils/haptics";
import {
  ACCENT,
  ACCENT_DIM,
  BG,
  CARD,
  CARD_BORDER,
  GOLD,
  SUCCESS,
  SUCCESS_DIM,
  TEXT,
  TEXT_DIM,
  TEXT_FAINT,
  WARNING,
  WARNING_DIM,
  SCREEN_PADDING,
} from "@/src/theme/tokens";
import { ScreenHeader } from "@/src/components/ScreenHeader";

// ─── Types ───────────────────────────────────────────────────────────────────

type Sale = {
  id: string | number;
  date: string; // ISO or "YYYY-MM-DD HH:mm"
  order_id: string;
  items: number;
  module: string;
  payment: string;
  total: string;
  status: string;
};

type PeriodSummary = { revenue: string; orders: number; avg: string };
type SalesSummary = {
  today: PeriodSummary;
  this_week: PeriodSummary;
  this_month: PeriodSummary;
};
type ModuleStat = { module: string; revenue: number; orders: number; pct: number };

// ─── Constants ───────────────────────────────────────────────────────────────

const MODULE_COLORS: Record<string, string> = {
  POS: "#4064dc",
  KDS: "#f59e0b",
  Vending: "#10b981",
  Kiosk: "#8b5cf6",
  Loyalty: "#ec4899",
};

const PAYMENT_ICONS: Record<string, keyof typeof import("@expo/vector-icons").Ionicons.glyphMap> = {
  Cash: "cash-outline",
  Card: "card-outline",
  QR: "qr-code-outline",
  Wallet: "wallet-outline",
  Mobile: "phone-portrait-outline",
};

const PAYMENT_COLORS: Record<string, string> = {
  Cash: "#10b981",
  Card: "#4064dc",
  QR: "#8b5cf6",
  Wallet: "#f59e0b",
  Mobile: "#06b6d4",
};

const PERIODS = ["today", "this_week", "this_month"] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  this_week: "Week",
  this_month: "Month",
};

const STATUS_FILTERS = ["all", "completed", "pending"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All",
  completed: "Completed",
  pending: "Active",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseMoney(v: string | number | undefined): number {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return Number(String(v).replace(/[^0-9.-]/g, "")) || 0;
}

function parseDate(s: string): Date {
  // Accept ISO or "YYYY-MM-DD HH:mm"
  const normalized = s.includes("T")
    ? s.replace(" +", "+")
    : s.replace(" +", "+").replace(" ", "T");
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? new Date() : d;
}

function dayKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function relativeDayLabel(
  d: Date,
  locale: string,
  t: (key: any, params?: Record<string, string | number>) => string
): string {
  const now = new Date();
  const today = dayKey(now);
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const yesterdayKey = dayKey(yest);
  const k = dayKey(d);
  if (k === today) return t("sales_today");
  if (k === yesterdayKey) return t("sales_yesterday");
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff < 7) return d.toLocaleDateString(locale, { weekday: "long" });
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function formatTime(d: Date, locale: string): string {
  return d.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatFullDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatWeekRange(now: Date): string {
  const dow = now.getDay() || 7;
  const start = addDays(now, -(dow - 1));
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const s = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const e = end.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
  });
  return `${s} – ${e}`;
}

function weekStart(d: Date): Date {
  const dow = d.getDay() || 7; // Mon=1 … Sun=7
  const s = addDays(d, -(dow - 1));
  s.setHours(0, 0, 0, 0);
  return s;
}

function weekEnd(d: Date): Date {
  return addDays(weekStart(d), 6);
}

function formatWeekPill(start: Date, locale: string): string {
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const s = start.toLocaleDateString(locale, { month: "short", day: "numeric" });
  const e = end.toLocaleDateString(locale, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
  });
  return `${s} – ${e}`;
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthEndExclusive(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

function formatMonthPill(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { month: "short", year: "numeric" });
}

function formatMonth(now: Date, locale: string): string {
  return now.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

function isInPeriod(
  d: Date,
  period: Period,
  selectedDate: Date,
  selWeekStart: Date,
  selMonthStart: Date
): boolean {
  if (period === "today") return dayKey(d) === dayKey(selectedDate);
  if (period === "this_week") {
    const end = addDays(selWeekStart, 7); // exclusive
    return d >= selWeekStart && d < end;
  }
  // this_month
  return (
    d.getFullYear() === selMonthStart.getFullYear() &&
    d.getMonth() === selMonthStart.getMonth()
  );
}

function computePeriodSummary(items: Sale[]): PeriodSummary {
  const revenue = items.reduce((sum, item) => sum + parseMoney(item.total), 0);
  const orders = items.length;
  const avg = orders > 0 ? revenue / orders : 0;

  return {
    revenue: revenue.toFixed(2),
    orders,
    avg: avg.toFixed(2),
  };
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SalesScreen() {
  const { t, locale } = useI18n();
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [byModule, setByModule] = useState<ModuleStat[]>([]);
  const [chart, setChart] = useState<{ day: string; revenue: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("this_week");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date>(() => weekStart(new Date()));
  const [selectedMonthStart, setSelectedMonthStart] = useState<Date>(() => monthStart(new Date()));

  const today = useMemo(() => startOfDay(new Date()), []);
  const isSelectedToday = dayKey(selectedDate) === dayKey(today);
  const canGoNext = selectedDate < today;

  // 14-day strip ending today
  const DAY_STRIP_COUNT = 14;
  const dayStripDates = useMemo(
    () =>
      Array.from({ length: DAY_STRIP_COUNT }, (_, i) =>
        addDays(today, -(DAY_STRIP_COUNT - 1 - i))
      ),
    [today]
  );
  const dayStripRef = useRef<ScrollView>(null);
  const dayStripInited = useRef(false);

  // 8-week strip ending at current week
  const WEEK_STRIP_COUNT = 8;
  const thisWeekStart = useMemo(() => weekStart(today), [today]);
  const weekStripDates = useMemo(
    () =>
      Array.from({ length: WEEK_STRIP_COUNT }, (_, i) =>
        addDays(thisWeekStart, -(WEEK_STRIP_COUNT - 1 - i) * 7)
      ),
    [thisWeekStart]
  );
  const weekStripRef = useRef<ScrollView>(null);
  const weekStripInited = useRef(false);

  // 6-month strip ending at current month
  const MONTH_STRIP_COUNT = 6;
  const thisMonthStart = useMemo(() => monthStart(today), [today]);
  const monthStripDates = useMemo(
    () =>
      Array.from({ length: MONTH_STRIP_COUNT }, (_, i) => {
        const d = new Date(thisMonthStart);
        d.setMonth(d.getMonth() - (MONTH_STRIP_COUNT - 1 - i));
        return d;
      }),
    [thisMonthStart]
  );
  const monthStripRef = useRef<ScrollView>(null);
  const monthStripInited = useRef(false);

  // Keep refs in sync so PanResponder (created once) reads fresh values
  const periodRef = useRef(period);
  const todayRef = useRef(today);
  useEffect(() => {
    periodRef.current = period;
  }, [period]);
  useEffect(() => {
    todayRef.current = today;
  }, [today]);

  const goPrevDay = () => {
    haptic.selection();
    setSelectedDate((d) => addDays(d, -1));
  };
  const goNextDay = () => {
    setSelectedDate((d) => {
      if (d >= todayRef.current) {
        haptic.warning();
        return d;
      }
      haptic.selection();
      const next = addDays(d, 1);
      return next > todayRef.current ? todayRef.current : next;
    });
  };
  const goToday = () => {
    haptic.light();
    setSelectedDate(todayRef.current);
  };

  // Horizontal swipe to navigate days when on Today view
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => {
        if (periodRef.current !== "today") return false;
        return Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8;
      },
      onPanResponderRelease: (_e, g) => {
        if (periodRef.current !== "today") return;
        if (Math.abs(g.dx) < 40) return;
        if (g.dx > 0) {
          haptic.selection();
          setSelectedDate((d) => addDays(d, -1));
        } else {
          setSelectedDate((d) => {
            if (d >= todayRef.current) {
              haptic.warning();
              return d;
            }
            haptic.selection();
            const next = addDays(d, 1);
            return next > todayRef.current ? todayRef.current : next;
          });
        }
      },
    })
  ).current;

  const fetchAll = async () => {
    if (API_TARGET === "official") {
      const start = new Date(thisMonthStart);
      start.setMonth(start.getMonth() - (MONTH_STRIP_COUNT - 1));
      const officialSales = await fetchOfficialSalesHistory(start, new Date());
      setSales(officialSales);
      return;
    }

    const [s, sm, bm, ch] = await Promise.allSettled([
      api.get<Sale[]>("/sales"),
      api.get<SalesSummary>("/sales/summary"),
      api.get<ModuleStat[]>("/sales/by-module"),
      api.get<{ day: string; revenue: number }[]>("/dashboard/revenue-chart"),
    ]);
    if (s.status === "fulfilled") setSales(s.value.data);
    if (sm.status === "fulfilled") setSummary(sm.value.data);
    if (bm.status === "fulfilled") setByModule(bm.value.data);
    if (ch.status === "fulfilled") setChart(ch.value.data);
  };

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, []);

  const periodLabels: Record<Period, string> = {
    today: t("sales_today"),
    this_week: t("sales_week"),
    this_month: t("sales_month"),
  };

  const statusLabels: Record<StatusFilter, string> = {
    all: t("sales_all"),
    completed: t("sales_completed"),
    pending: t("sales_active"),
  };

  const onRefresh = async () => {
    haptic.light();
    setRefreshing(true);
    await fetchAll();
    haptic.success();
    setRefreshing(false);
  };

  const derivedOfficialChart = useMemo(() => {
    if (API_TARGET !== "official") {
      return chart;
    }

    return Array.from({ length: 7 }, (_, index) => {
      const d = addDays(today, -(6 - index));
      const key = dayKey(d);
      const revenue = sales
        .filter((sale) => dayKey(parseDate(sale.date)) === key)
        .reduce((sum, sale) => sum + parseMoney(sale.total), 0);

      return {
        day: d.toLocaleDateString(undefined, { weekday: "short" }),
        revenue,
      };
    });
  }, [sales, today, chart]);

  // Filter + group transactions
  const {
    sections,
    totalFiltered,
    paymentBreakdown,
    moduleBreakdown,
    periodSummary,
    revenueComparison,
  } = useMemo(() => {
    let currentStart: Date;
    let currentEnd: Date;
    let previousStart: Date;
    let previousEnd: Date;

    if (period === "today") {
      currentStart = startOfDay(selectedDate);
      currentEnd = addDays(currentStart, 1);
      previousStart = addDays(currentStart, -1);
      previousEnd = currentStart;
    } else if (period === "this_week") {
      currentStart = selectedWeekStart;
      currentEnd = addDays(selectedWeekStart, 7);
      previousStart = addDays(selectedWeekStart, -7);
      previousEnd = selectedWeekStart;
    } else {
      currentStart = selectedMonthStart;
      currentEnd = monthEndExclusive(selectedMonthStart);
      previousStart = new Date(
        selectedMonthStart.getFullYear(),
        selectedMonthStart.getMonth() - 1,
        1
      );
      previousEnd = selectedMonthStart;
    }

    const periodSales = sales.filter((s) => {
      const d = parseDate(s.date);
      return d >= currentStart && d < currentEnd;
    });
    const previousPeriodSales = sales.filter((s) => {
      const d = parseDate(s.date);
      return d >= previousStart && d < previousEnd;
    });

    const q = search.trim().toLowerCase();
    const filtered = periodSales.filter((s) => {
      const d = parseDate(s.date);
      if (statusFilter !== "all") {
        const wantCompleted = statusFilter === "completed";
        const isCompleted = s.status === "completed";
        if (wantCompleted !== isCompleted) return false;
      }
      if (q) {
        const hay =
          `${s.order_id} ${s.module} ${s.payment}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Group by day
    const groups = new Map<string, { title: string; date: Date; items: Sale[] }>();
    for (const s of filtered) {
      const d = parseDate(s.date);
      const key = dayKey(d);
      const g = groups.get(key) ?? { title: relativeDayLabel(d, locale, t), date: d, items: [] };
      g.items.push(s);
      groups.set(key, g);
    }
    const sectionsArr = Array.from(groups.values())
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((g) => ({
        title: g.title,
        total: g.items.reduce((sum, s) => sum + parseMoney(s.total), 0),
        data: g.items.sort(
          (a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime()
        ),
      }));

    // Payment breakdown from filtered
    const payMap = new Map<string, number>();
    for (const s of filtered) {
      payMap.set(s.payment, (payMap.get(s.payment) ?? 0) + parseMoney(s.total));
    }
    const payTotal = Array.from(payMap.values()).reduce((a, b) => a + b, 0) || 1;
    const payArr = Array.from(payMap.entries())
      .map(([name, value]) => ({
        name,
        value,
        pct: (value / payTotal) * 100,
      }))
      .sort((a, b) => b.value - a.value);

    const moduleMap = new Map<string, { revenue: number; orders: number }>();
    for (const s of filtered) {
      const current = moduleMap.get(s.module) ?? { revenue: 0, orders: 0 };
      current.revenue += parseMoney(s.total);
      current.orders += 1;
      moduleMap.set(s.module, current);
    }
    const moduleTotal =
      Array.from(moduleMap.values()).reduce((sum, item) => sum + item.revenue, 0) || 1;
    const moduleArr = Array.from(moduleMap.entries())
      .map(([module, value]) => ({
        module,
        revenue: value.revenue,
        orders: value.orders,
        pct: Math.round((value.revenue / moduleTotal) * 100),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      sections: sectionsArr,
      totalFiltered: filtered.length,
      paymentBreakdown: payArr,
      moduleBreakdown: moduleArr,
      periodSummary: computePeriodSummary(periodSales),
      revenueComparison: (() => {
        const currentRevenue = periodSales.reduce((sum, sale) => sum + parseMoney(sale.total), 0);
        const previousRevenue = previousPeriodSales.reduce(
          (sum, sale) => sum + parseMoney(sale.total),
          0
        );
        const pct =
          previousRevenue === 0
            ? currentRevenue === 0
              ? 0
              : 100
            : ((currentRevenue - previousRevenue) / previousRevenue) * 100;

        return {
          pct,
          isPositive: pct >= 0,
        };
      })(),
    };
  }, [sales, period, statusFilter, search, selectedDate, selectedWeekStart, selectedMonthStart, locale, t]);

  const effectiveChart = API_TARGET === "official" ? derivedOfficialChart : chart;
  const effectiveByModule = moduleBreakdown;

  const stat = periodSummary;

  const maxChart = Math.max(...effectiveChart.map((p) => p.revenue), 1);

  return (
    <SafeAreaView style={styles.safeContainer} edges={["top"]}>
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <SectionList
        sections={loading ? [] : sections}
        keyExtractor={(item) => String(item.id)}
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />
        }
        ListHeaderComponent={
          <>
            {/* Top bar */}
            <ScreenHeader
              eyebrow="REVENUE"
              title={t("tab_sales") || "Sales"}
              subtitle={
                period === "today"
                  ? formatFullDate(selectedDate, locale)
                  : period === "this_week"
                  ? formatWeekPill(selectedWeekStart, locale)
                  : formatMonth(selectedMonthStart, locale)
              }
              right={
                <>
                  <Pressable
                    accessibilityLabel={t("sales_export_report")}
                    onPress={() => haptic.selection()}
                    style={({ pressed }) => [
                      styles.iconBtn,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <Ionicons
                      name="arrow-down-outline"
                      size={18}
                      color={TEXT_DIM}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={t("sales_filters")}
                    onPress={() => haptic.selection()}
                    style={({ pressed }) => [
                      styles.iconBtn,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <Ionicons name="options-outline" size={18} color={TEXT_DIM} />
                  </Pressable>
                </>
              }
            />

            {/* Period segmented */}
            <View style={styles.periodRow}>
              {PERIODS.map((p) => (
                <Pressable
                  key={p}
                  accessibilityLabel={`Show ${PERIOD_LABELS[p]} data`}
                  style={[styles.periodBtn, period === p && styles.periodBtnActive]}
                  onPress={() => {
                    haptic.selection();
                    setPeriod(p);
                  }}
                >
                  <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                    {periodLabels[p]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Day strip — only in Today mode */}
            {period === "today" && (
              <View style={styles.dayStripWrap}>
                <ScrollView
                  ref={dayStripRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayStrip}
                  onContentSizeChange={(w) => {
                    // Keep today pill in view on mount
                    if (!dayStripInited.current) {
                      dayStripRef.current?.scrollToEnd({ animated: false });
                      dayStripInited.current = true;
                    }
                  }}
                >
                  {dayStripDates.map((d) => {
                    const active = dayKey(d) === dayKey(selectedDate);
                    const isToday = dayKey(d) === dayKey(today);
                    const weekday = d.toLocaleDateString(locale, { weekday: "short" });
                    return (
                      <Pressable
                        key={dayKey(d)}
                        accessibilityLabel={`View ${d.toDateString()}`}
                        onPress={() => {
                          haptic.selection();
                          setSelectedDate(startOfDay(d));
                        }}
                        style={[
                          styles.dayPill,
                          active && styles.dayPillActive,
                          isToday && !active && styles.dayPillToday,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayPillWeekday,
                            active && styles.dayPillWeekdayActive,
                          ]}
                        >
                          {isToday ? t("sales_today") : weekday.toUpperCase()}
                        </Text>
                        <Text
                          style={[
                            styles.dayPillNum,
                            active && styles.dayPillNumActive,
                          ]}
                        >
                          {d.getDate()}
                        </Text>
                        {active && <View style={styles.dayPillMarker} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Week strip — only in Week mode */}
            {period === "this_week" && (
              <View style={styles.dayStripWrap}>
                <ScrollView
                  ref={weekStripRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayStrip}
                  onContentSizeChange={() => {
                    if (!weekStripInited.current) {
                      weekStripRef.current?.scrollToEnd({ animated: false });
                      weekStripInited.current = true;
                    }
                  }}
                >
                  {weekStripDates.map((ws, idx) => {
                    const active = dayKey(ws) === dayKey(selectedWeekStart);
                    const isThisWeek = dayKey(ws) === dayKey(thisWeekStart);
                    const we = addDays(ws, 6);
                    const startDay = ws.getDate();
                    const endDay = we.getDate();
                    const mo = ws.toLocaleDateString(locale, { month: "short" }).toUpperCase();
                    const crossMonth = ws.getMonth() !== we.getMonth();
                    const endMo = we.toLocaleDateString(locale, { month: "short" }).toUpperCase();
                    return (
                      <Pressable
                        key={dayKey(ws)}
                        accessibilityLabel={`View week of ${ws.toDateString()}`}
                        onPress={() => {
                          haptic.selection();
                          setSelectedWeekStart(ws);
                        }}
                        style={[
                          styles.weekPill,
                          active && styles.dayPillActive,
                          isThisWeek && !active && styles.dayPillToday,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayPillWeekday,
                            active && styles.dayPillWeekdayActive,
                          ]}
                        >
                          {isThisWeek ? t("sales_week") : mo}
                        </Text>
                        <Text
                          style={[
                            styles.weekPillRange,
                            active && styles.dayPillNumActive,
                          ]}
                        >
                          {crossMonth
                            ? `${startDay}–${endDay}`
                            : `${startDay} – ${endDay}`}
                        </Text>
                        {active && <View style={styles.dayPillMarker} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Month strip — only in Month mode */}
            {period === "this_month" && (
              <View style={styles.dayStripWrap}>
                <ScrollView
                  ref={monthStripRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayStrip}
                  onContentSizeChange={() => {
                    if (!monthStripInited.current) {
                      monthStripRef.current?.scrollToEnd({ animated: false });
                      monthStripInited.current = true;
                    }
                  }}
                >
                  {monthStripDates.map((ms) => {
                    const active =
                      ms.getFullYear() === selectedMonthStart.getFullYear() &&
                      ms.getMonth() === selectedMonthStart.getMonth();
                    const isThisMonth =
                      ms.getFullYear() === thisMonthStart.getFullYear() &&
                      ms.getMonth() === thisMonthStart.getMonth();
                    const mo = ms.toLocaleDateString(locale, { month: "short" });
                    return (
                      <Pressable
                        key={`${ms.getFullYear()}-${ms.getMonth()}`}
                        accessibilityLabel={`View ${mo} ${ms.getFullYear()}`}
                        onPress={() => {
                          haptic.selection();
                          setSelectedMonthStart(monthStart(ms));
                        }}
                        style={[
                          styles.monthPill,
                          active && styles.dayPillActive,
                          isThisMonth && !active && styles.dayPillToday,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayPillWeekday,
                            active && styles.dayPillWeekdayActive,
                          ]}
                        >
                          {isThisMonth ? t("sales_month") : ms.getFullYear().toString()}
                        </Text>
                        <Text
                          style={[
                            styles.dayPillNum,
                            active && styles.dayPillNumActive,
                          ]}
                        >
                          {mo.toUpperCase()}
                        </Text>
                        {active && <View style={styles.dayPillMarker} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Hero revenue */}
            {loading ? (
              <Skeleton height={148} radius={22} />
            ) : (
              <View style={styles.heroCard}>
                <View style={styles.heroRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroLabel}>
                      {period === "today" && !isSelectedToday
                        ? `${formatShortDate(selectedDate, locale).toUpperCase()} · ${t("sales_revenue").toUpperCase()}`
                        : period === "this_week" &&
                          dayKey(selectedWeekStart) !== dayKey(thisWeekStart)
                        ? `${formatWeekPill(selectedWeekStart, locale).toUpperCase()} · ${t("sales_revenue").toUpperCase()}`
                        : period === "this_month" &&
                          (selectedMonthStart.getFullYear() !== thisMonthStart.getFullYear() ||
                            selectedMonthStart.getMonth() !== thisMonthStart.getMonth())
                        ? `${formatMonthPill(selectedMonthStart, locale).toUpperCase()} · ${t("sales_revenue").toUpperCase()}`
                        : `${periodLabels[period].toUpperCase()} ${t("sales_revenue").toUpperCase()}`}
                    </Text>
                    <AnimatedNumber
                      value={parseMoney(stat?.revenue)}
                      prefix="$"
                      style={styles.heroValue}
                    />
                    <View style={styles.heroBadgeRow}>
                      <View style={styles.heroBadge}>
                        <Ionicons
                          name={revenueComparison.isPositive ? "trending-up" : "trending-down"}
                          size={11}
                          color={revenueComparison.isPositive ? SUCCESS : WARNING}
                        />
                        <Text
                          style={[
                            styles.heroBadgeText,
                            !revenueComparison.isPositive && styles.heroBadgeTextNegative,
                          ]}
                        >
                          {revenueComparison.pct > 0 ? "+" : ""}
                          {revenueComparison.pct.toFixed(1)}%
                        </Text>
                      </View>
                      <Text style={styles.heroHint}>
                        {t("sales_vs_previous_period", { period: periodLabels[period].toLowerCase() })}
                      </Text>
                    </View>
                  </View>

                  {/* Mini spark bars */}
                  {effectiveChart.length > 0 && (
                    <View style={styles.spark}>
                      {effectiveChart.slice(-7).map((p, i) => {
                        const h = Math.max(6, (p.revenue / maxChart) * 46);
                        return (
                          <View
                            key={`${p.day}-${i}`}
                            style={[
                              styles.sparkBar,
                              {
                                height: h,
                                backgroundColor:
                                  i === effectiveChart.slice(-7).length - 1 ? GOLD : ACCENT,
                                opacity:
                                  i === effectiveChart.slice(-7).length - 1 ? 1 : 0.7,
                              },
                            ]}
                          />
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Mini stats row inside hero */}
                <View style={styles.heroStatsRow}>
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatLabel}>Orders</Text>
                    <Text style={styles.heroStatLabel}>{t("sales_orders")}</Text>
                    <AnimatedNumber value={stat?.orders ?? 0} style={styles.heroStatValue} />
                  </View>
                  <View style={styles.heroDivider} />
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatLabel}>{t("sales_avg_order")}</Text>
                    <AnimatedNumber
                      value={parseMoney(stat?.avg)}
                      prefix="$"
                      decimals={2}
                      style={styles.heroStatValue}
                    />
                  </View>
                  <View style={styles.heroDivider} />
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatLabel}>{t("sales_txns")}</Text>
                    <AnimatedNumber value={totalFiltered} style={styles.heroStatValue} />
                  </View>
                </View>
              </View>
            )}

            {/* Payment breakdown */}
            {!loading && paymentBreakdown.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.sectionTitle}>{t("sales_payment_mix")}</Text>
                  <Text style={styles.sectionHint}>
                    {paymentBreakdown.length} {paymentBreakdown.length === 1 ? t("sales_method_one") : t("sales_method_other")}
                  </Text>
                </View>

                {/* Stacked bar */}
                <View style={styles.stackedBar}>
                  {paymentBreakdown.map((p) => (
                    <View
                      key={p.name}
                      style={{
                        width: `${p.pct}%`,
                        backgroundColor: PAYMENT_COLORS[p.name] ?? "#64748b",
                      }}
                    />
                  ))}
                </View>

                {/* Legend */}
                <View style={styles.legend}>
                  {paymentBreakdown.map((p) => (
                    <View key={p.name} style={styles.legendItem}>
                      <View
                        style={[
                          styles.legendDot,
                          { backgroundColor: PAYMENT_COLORS[p.name] ?? "#64748b" },
                        ]}
                      />
                      <Text style={styles.legendName}>{p.name}</Text>
                      <Text style={styles.legendPct}>{p.pct.toFixed(0)}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Module breakdown */}
            {loading ? (
              <Skeleton height={160} radius={16} />
            ) : (
              effectiveByModule.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.sectionTitle}>{t("sales_revenue_by_module")}</Text>
                    <Ionicons name="chevron-forward" size={14} color={TEXT_DIM} />
                  </View>
                  {effectiveByModule.map((m) => (
                    <View key={m.module} style={styles.moduleRow}>
                      <View style={styles.moduleLeft}>
                        <View
                          style={[
                            styles.moduleDot,
                            { backgroundColor: MODULE_COLORS[m.module] ?? "#64748b" },
                          ]}
                        />
                        <Text style={styles.moduleName}>{m.module}</Text>
                      </View>
                      <View style={styles.barWrap}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              width: `${m.pct}%`,
                              backgroundColor: MODULE_COLORS[m.module] ?? "#64748b",
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.moduleRevenue}>${m.revenue.toFixed(0)}</Text>
                    </View>
                  ))}
                </View>
              )
            )}

            {/* Search */}
            <View style={styles.searchRow}>
              <Ionicons name="search" size={14} color={TEXT_DIM} />
              <TextInput
                accessibilityLabel={t("sales_search_transactions")}
                placeholder={t("sales_search_placeholder")}
                placeholderTextColor={TEXT_DIM}
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
                returnKeyType="search"
              />
              {search ? (
                <Pressable
                  accessibilityLabel={t("sales_clear_search")}
                  onPress={() => {
                    haptic.selection();
                    setSearch("");
                  }}
                >
                  <Ionicons name="close-circle" size={16} color={TEXT_DIM} />
                </Pressable>
              ) : null}
            </View>

            {/* Status filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {STATUS_FILTERS.map((f) => {
                const active = statusFilter === f;
                return (
                  <Pressable
                    key={f}
                    accessibilityLabel={`Filter: ${STATUS_LABELS[f]}`}
                    onPress={() => {
                      haptic.selection();
                      setStatusFilter(f);
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {statusLabels[f]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Txn header */}
            <View style={styles.cardHeader}>
              <Text style={styles.sectionTitle}>{t("sales_transactions")}</Text>
              <Text style={styles.sectionHint}>{t("sales_records", { count: totalFiltered })}</Text>
            </View>
          </>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{section.title}</Text>
            <Text style={styles.sectionHeaderTotal}>
              ${(section as any).total.toFixed(2)}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const d = parseDate(item.date);
          const payIcon = PAYMENT_ICONS[item.payment] ?? "card-outline";
          const payColor = PAYMENT_COLORS[item.payment] ?? "#64748b";
          return (
            <Pressable
              accessibilityLabel={`Order ${item.order_id}, ${item.status}, ${item.total} dollars`}
              onPress={() => haptic.light()}
              style={({ pressed }) => [styles.txnCard, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.txnIcon, { backgroundColor: payColor + "1f" }]}>
                <Ionicons name={payIcon} size={18} color={payColor} />
              </View>

              <View style={styles.txnMid}>
                <View style={styles.txnTopRow}>
                  <Text style={styles.txnId} numberOfLines={1}>
                    {item.order_id}
                  </Text>
                  <View
                    style={[
                      styles.modTag,
                      { backgroundColor: (MODULE_COLORS[item.module] ?? "#64748b") + "22" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modTagText,
                        { color: MODULE_COLORS[item.module] ?? "#64748b" },
                      ]}
                    >
                      {item.module}
                    </Text>
                  </View>
                </View>
                <View style={styles.txnBottomRow}>
                  <Text style={styles.txnMeta}>{formatTime(d, locale)}</Text>
                  <View style={styles.metaDot} />
                  <Text style={styles.txnMeta}>{item.items} items</Text>
                  <View style={styles.metaDot} />
                  <Text style={styles.txnMeta}>{item.payment}</Text>
                </View>
              </View>

              <View style={styles.txnRight}>
                <Text style={styles.txnTotal}>${item.total}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    item.status === "completed" ? styles.statusDone : styles.statusPending,
                  ]}
                >
                  <View
                    style={[
                      styles.statusDotSmall,
                      {
                        backgroundColor: item.status === "completed" ? SUCCESS : WARNING,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      item.status === "completed" ? styles.statusDoneText : styles.statusPendingText,
                    ]}
                  >
                    {item.status === "completed" ? t("sales_done") : t("sales_active_status")}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: 10, paddingTop: 4 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={72} radius={14} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={32} color={TEXT_DIM} />
              <Text style={styles.emptyTitle}>{t("sales_no_transactions")}</Text>
              <Text style={styles.emptyBody}>
                {search
                  ? t("sales_no_search_results")
                  : statusFilter !== "all"
                  ? t("sales_no_filtered_orders", { status: statusLabels[statusFilter].toLowerCase() })
                  : t("sales_try_different_time_range")}
              </Text>
              {(search || statusFilter !== "all") && (
                <Pressable
                  onPress={() => {
                    haptic.selection();
                    setSearch("");
                    setStatusFilter("all");
                  }}
                  style={styles.emptyBtn}
                >
                  <Text style={styles.emptyBtnText}>{t("common_clear_filters")}</Text>
                </Pressable>
              )}
            </View>
          )
        }
      />
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: BG },
  container: { flex: 1, backgroundColor: "transparent" },
  content: { padding: SCREEN_PADDING, paddingBottom: 128, gap: 20 },

  // Top bar — clean, no eyebrow, subtle icons
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.8,
  },
  dateSubtitle: {
    color: TEXT_DIM,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 4,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  // Period — underline tabs, minimal
  periodRow: {
    flexDirection: "row",
    gap: 28,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CARD_BORDER,
    marginTop: 4,
  },
  periodBtn: {
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -StyleSheet.hairlineWidth,
  },
  periodBtnActive: {
    borderBottomColor: GOLD,
  },
  periodText: { fontSize: 13, fontWeight: "600", color: TEXT_DIM, letterSpacing: 0.2 },
  periodTextActive: { color: TEXT },

  // Date strips — smaller, subtler
  dayStripWrap: {
    marginTop: 4,
    marginHorizontal: -20,
  },
  dayStrip: {
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  dayPill: {
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "transparent",
    alignItems: "center",
    gap: 3,
  },
  dayPillActive: {
    backgroundColor: TEXT,
  },
  dayPillToday: {
    backgroundColor: "rgba(212,175,55,0.08)",
  },
  dayPillWeekday: {
    fontSize: 10,
    fontWeight: "600",
    color: TEXT_DIM,
    letterSpacing: 0.5,
  },
  dayPillWeekdayActive: { color: BG },
  dayPillNum: { fontSize: 15, fontWeight: "700", color: TEXT, letterSpacing: -0.2 },
  dayPillNumActive: { color: BG },
  dayPillMarker: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "transparent",
  },

  weekPill: {
    minWidth: 60,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "transparent",
    alignItems: "center",
    gap: 3,
  },
  weekPillRange: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.2,
  },

  monthPill: {
    minWidth: 58,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "transparent",
    alignItems: "center",
    gap: 3,
  },

  // Hero — flat, no shadow, airy
  heroCard: {
    paddingVertical: 8,
    paddingHorizontal: 2,
    gap: 20,
    marginTop: 8,
  },
  heroRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  heroLabel: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  heroValue: {
    color: TEXT,
    fontSize: 42,
    fontWeight: "700",
    marginTop: 8,
    letterSpacing: -1.5,
  },
  heroBadgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  heroBadgeText: { color: SUCCESS, fontSize: 12, fontWeight: "600" },
  heroBadgeTextNegative: { color: WARNING },
  heroHint: { color: TEXT_FAINT, fontSize: 11, fontWeight: "500" },

  spark: { flexDirection: "row", gap: 4, alignItems: "flex-end", height: 44 },
  sparkBar: { width: 5, borderRadius: 2 },

  heroStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CARD_BORDER,
  },
  heroStat: { flex: 1, alignItems: "flex-start", gap: 4 },
  heroStatLabel: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  heroStatValue: { color: TEXT, fontSize: 18, fontWeight: "700", letterSpacing: -0.3 },
  heroDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: CARD_BORDER,
    marginHorizontal: 4,
  },

  // Cards — flat, hairline border, more padding
  card: {
    backgroundColor: "transparent",
    borderRadius: 0,
    paddingVertical: 20,
    paddingHorizontal: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CARD_BORDER,
    gap: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: TEXT, letterSpacing: -0.2 },
  sectionHint: { fontSize: 12, color: TEXT_DIM, fontWeight: "500" },

  stackedBar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendName: { fontSize: 12, color: TEXT, fontWeight: "500" },
  legendPct: { fontSize: 12, color: TEXT_DIM, fontWeight: "500" },

  moduleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2 },
  moduleLeft: { flexDirection: "row", alignItems: "center", gap: 8, width: 88 },
  moduleDot: { width: 6, height: 6, borderRadius: 3 },
  moduleName: { fontSize: 13, color: TEXT, fontWeight: "500" },
  barWrap: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 2 },
  moduleRevenue: {
    width: 60,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "600",
    color: TEXT,
    letterSpacing: -0.2,
  },

  // Search — flat, no border
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  searchInput: { flex: 1, color: TEXT, fontSize: 14, padding: 0 },

  // Chips — minimal
  chipsRow: { gap: 8, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  chipActive: {
    backgroundColor: TEXT,
    borderColor: TEXT,
  },
  chipText: { color: TEXT_DIM, fontSize: 12, fontWeight: "500" },
  chipTextActive: { color: BG, fontWeight: "600" },

  // Section headers for txn groups
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 10,
    paddingHorizontal: 2,
    backgroundColor: BG,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT_DIM,
    letterSpacing: 0.3,
  },
  sectionHeaderTotal: { fontSize: 13, fontWeight: "600", color: TEXT, letterSpacing: -0.2 },

  // Transaction rows — flat, list-style
  txnCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "transparent",
    borderRadius: 0,
    paddingVertical: 14,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CARD_BORDER,
  },
  txnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  txnMid: { flex: 1, gap: 3 },
  txnTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  txnId: { fontSize: 14, fontWeight: "600", color: TEXT, flexShrink: 1, letterSpacing: -0.2 },
  modTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  modTagText: { fontSize: 10, fontWeight: "600", letterSpacing: 0.2 },
  txnBottomRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  txnMeta: { fontSize: 12, color: TEXT_DIM, fontWeight: "500" },
  metaDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: TEXT_FAINT },

  txnRight: { alignItems: "flex-end", gap: 4 },
  txnTotal: { fontSize: 15, fontWeight: "700", color: TEXT, letterSpacing: -0.3 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  statusDotSmall: { width: 6, height: 6, borderRadius: 3 },
  statusDone: {},
  statusPending: {},
  statusText: { fontSize: 11, fontWeight: "500" },
  statusDoneText: { color: SUCCESS },
  statusPendingText: { color: WARNING },

  emptyCard: {
    backgroundColor: "transparent",
    paddingVertical: 48,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  emptyTitle: { color: TEXT, fontSize: 15, fontWeight: "600", marginTop: 8 },
  emptyBody: { color: TEXT_DIM, fontSize: 13, fontWeight: "500", textAlign: "center" },
  emptyBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  emptyBtnText: { color: TEXT, fontWeight: "600", fontSize: 13 },
});
