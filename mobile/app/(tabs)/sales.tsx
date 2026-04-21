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
import { api } from "@/src/services/api";
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
} from "@/src/theme/tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

type Sale = {
  id: number;
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
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? new Date() : d;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function relativeDayLabel(d: Date): string {
  const now = new Date();
  const today = dayKey(now);
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const yesterdayKey = dayKey(yest);
  const k = dayKey(d);
  if (k === today) return "Today";
  if (k === yesterdayKey) return "Yesterday";
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
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

function formatFullDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
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

function formatWeekPill(start: Date): string {
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const s = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const e = end.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
  });
  return `${s} – ${e}`;
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function formatMonthPill(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function formatMonth(now: Date): string {
  return now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
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

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SalesScreen() {
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

  const onRefresh = async () => {
    haptic.light();
    setRefreshing(true);
    await fetchAll();
    haptic.success();
    setRefreshing(false);
  };

  const stat = summary ? summary[period] : null;
  const revenueChange = 12.4; // Optional — surface from API if available

  // Filter + group transactions
  const { sections, totalFiltered, paymentBreakdown } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = sales.filter((s) => {
      const d = parseDate(s.date);
      if (!isInPeriod(d, period, selectedDate, selectedWeekStart, selectedMonthStart)) return false;
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
      const g = groups.get(key) ?? { title: relativeDayLabel(d), date: d, items: [] };
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

    return {
      sections: sectionsArr,
      totalFiltered: filtered.length,
      paymentBreakdown: payArr,
    };
  }, [sales, period, statusFilter, search, selectedDate, selectedWeekStart, selectedMonthStart]);

  const maxChart = Math.max(...chart.map((p) => p.revenue), 1);

  return (
    <SafeAreaView style={styles.safeContainer} edges={["top"]}>
      <View style={styles.glow} />

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
            <View style={styles.topBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>REPORTS</Text>
                <Text style={styles.title}>Sales</Text>
                <Text style={styles.dateSubtitle}>
                  {period === "today"
                    ? formatFullDate(selectedDate)
                    : period === "this_week"
                    ? formatWeekPill(selectedWeekStart)
                    : formatMonth(selectedMonthStart)}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Export report"
                onPress={() => haptic.selection()}
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="download-outline" size={16} color={TEXT} />
              </Pressable>
              <Pressable
                accessibilityLabel="Filters"
                onPress={() => haptic.selection()}
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="options-outline" size={16} color={TEXT} />
              </Pressable>
            </View>

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
                    {PERIOD_LABELS[p]}
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
                    const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
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
                          {isToday ? "TODAY" : weekday.toUpperCase()}
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
                    const mo = ws.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
                    const crossMonth = ws.getMonth() !== we.getMonth();
                    const endMo = we.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
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
                          {isThisWeek ? "THIS WEEK" : mo}
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
                    const mo = ms.toLocaleDateString(undefined, { month: "short" });
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
                          {isThisMonth ? "NOW" : ms.getFullYear().toString()}
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
                        ? `${formatShortDate(selectedDate).toUpperCase()} · REVENUE`
                        : period === "this_week" &&
                          dayKey(selectedWeekStart) !== dayKey(thisWeekStart)
                        ? `${formatWeekPill(selectedWeekStart).toUpperCase()} · REVENUE`
                        : period === "this_month" &&
                          (selectedMonthStart.getFullYear() !== thisMonthStart.getFullYear() ||
                            selectedMonthStart.getMonth() !== thisMonthStart.getMonth())
                        ? `${formatMonthPill(selectedMonthStart).toUpperCase()} · REVENUE`
                        : `${PERIOD_LABELS[period].toUpperCase()} REVENUE`}
                    </Text>
                    <AnimatedNumber
                      value={parseMoney(stat?.revenue)}
                      prefix="$"
                      style={styles.heroValue}
                    />
                    <View style={styles.heroBadgeRow}>
                      <View style={styles.heroBadge}>
                        <Ionicons name="trending-up" size={11} color={SUCCESS} />
                        <Text style={styles.heroBadgeText}>+{revenueChange}%</Text>
                      </View>
                      <Text style={styles.heroHint}>vs previous {PERIOD_LABELS[period].toLowerCase()}</Text>
                    </View>
                  </View>

                  {/* Mini spark bars */}
                  {chart.length > 0 && (
                    <View style={styles.spark}>
                      {chart.slice(-7).map((p, i) => {
                        const h = Math.max(6, (p.revenue / maxChart) * 46);
                        return (
                          <View
                            key={`${p.day}-${i}`}
                            style={[
                              styles.sparkBar,
                              {
                                height: h,
                                backgroundColor: i === chart.slice(-7).length - 1 ? GOLD : ACCENT,
                                opacity: i === chart.slice(-7).length - 1 ? 1 : 0.7,
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
                    <AnimatedNumber value={stat?.orders ?? 0} style={styles.heroStatValue} />
                  </View>
                  <View style={styles.heroDivider} />
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatLabel}>Avg order</Text>
                    <AnimatedNumber
                      value={parseMoney(stat?.avg)}
                      prefix="$"
                      decimals={2}
                      style={styles.heroStatValue}
                    />
                  </View>
                  <View style={styles.heroDivider} />
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatLabel}>Txns</Text>
                    <AnimatedNumber value={totalFiltered} style={styles.heroStatValue} />
                  </View>
                </View>
              </View>
            )}

            {/* Payment breakdown */}
            {!loading && paymentBreakdown.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.sectionTitle}>Payment Mix</Text>
                  <Text style={styles.sectionHint}>
                    {paymentBreakdown.length} {paymentBreakdown.length === 1 ? "method" : "methods"}
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
              byModule.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.sectionTitle}>Revenue by Module</Text>
                    <Ionicons name="chevron-forward" size={14} color={TEXT_DIM} />
                  </View>
                  {byModule.map((m) => (
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
                accessibilityLabel="Search transactions"
                placeholder="Search order ID, module, payment…"
                placeholderTextColor={TEXT_DIM}
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
                returnKeyType="search"
              />
              {search ? (
                <Pressable
                  accessibilityLabel="Clear search"
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
                      {STATUS_LABELS[f]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Txn header */}
            <View style={styles.cardHeader}>
              <Text style={styles.sectionTitle}>Transactions</Text>
              <Text style={styles.sectionHint}>{totalFiltered} records</Text>
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
                  <Text style={styles.txnMeta}>{formatTime(d)}</Text>
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
                    {item.status === "completed" ? "Done" : "Active"}
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
              <Text style={styles.emptyTitle}>No transactions</Text>
              <Text style={styles.emptyBody}>
                {search
                  ? "No results match your search."
                  : statusFilter !== "all"
                  ? `No ${STATUS_LABELS[statusFilter].toLowerCase()} orders in this period.`
                  : "Try a different time range."}
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
                  <Text style={styles.emptyBtnText}>Clear filters</Text>
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
  content: { padding: 16, paddingBottom: 40, gap: 24 },

  glow: {
    position: "absolute",
    top: -140,
    right: -120,
    width: 340,
    height: 340,
    borderRadius: 200,
    backgroundColor: GOLD,
    opacity: 0.08,
  },

  topBar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  eyebrow: {
    color: TEXT_DIM,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "800",
    marginBottom: 2,
  },
  title: { fontSize: 28, fontWeight: "800", color: TEXT, letterSpacing: -0.5 },
  dateSubtitle: {
    color: TEXT_DIM,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },

  periodRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  periodBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 10 },
  periodBtnActive: {
    backgroundColor: "rgba(212,175,55,0.18)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.35)",
  },
  periodText: { fontSize: 12, fontWeight: "700", color: TEXT_DIM },
  periodTextActive: { color: GOLD },

  dayStripWrap: {
    marginTop: 2,
    marginHorizontal: -16, // edge-to-edge scroll within padded content
  },
  dayStrip: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  dayPill: {
    minWidth: 56,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: "center",
    gap: 2,
  },
  dayPillActive: {
    backgroundColor: GOLD,
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  dayPillToday: {
    borderColor: "rgba(212,175,55,0.5)",
  },
  dayPillWeekday: {
    fontSize: 9,
    fontWeight: "800",
    color: TEXT_DIM,
    letterSpacing: 1,
  },
  dayPillWeekdayActive: { color: "#181e38" },
  dayPillNum: { fontSize: 17, fontWeight: "800", color: TEXT, letterSpacing: -0.3 },
  dayPillNumActive: { color: "#181e38" },
  dayPillMarker: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#181e38",
    marginTop: 1,
  },

  weekPill: {
    minWidth: 64,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: "center",
    gap: 2,
  },
  weekPillRange: {
    fontSize: 14,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -0.3,
  },

  monthPill: {
    minWidth: 62,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: "center",
    gap: 2,
  },

  heroCard: {
    backgroundColor: CARD,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    gap: 14,
    marginTop: 4,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  heroRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  heroLabel: {
    color: TEXT_DIM,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },
  heroValue: { color: TEXT, fontSize: 34, fontWeight: "800", marginTop: 6, letterSpacing: -1 },
  heroBadgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: SUCCESS_DIM,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  heroBadgeText: { color: SUCCESS, fontSize: 11, fontWeight: "800" },
  heroHint: { color: TEXT_FAINT, fontSize: 10, fontWeight: "600" },

  spark: { flexDirection: "row", gap: 3, alignItems: "flex-end", height: 50 },
  sparkBar: { width: 6, borderRadius: 3 },

  heroStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  heroStat: { flex: 1, alignItems: "center", gap: 2 },
  heroStatLabel: {
    color: TEXT_DIM,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heroStatValue: { color: TEXT, fontSize: 15, fontWeight: "800" },
  heroDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: CARD_BORDER,
  },

  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    gap: 10,
    marginTop: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: TEXT },
  sectionHint: { fontSize: 11, color: TEXT_DIM, fontWeight: "600" },

  stackedBar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 2 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendName: { fontSize: 11, color: TEXT, fontWeight: "700" },
  legendPct: { fontSize: 11, color: TEXT_DIM, fontWeight: "600" },

  moduleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  moduleLeft: { flexDirection: "row", alignItems: "center", gap: 6, width: 78 },
  moduleDot: { width: 8, height: 8, borderRadius: 4 },
  moduleName: { fontSize: 12, color: TEXT, fontWeight: "700" },
  barWrap: {
    flex: 1,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 4 },
  moduleRevenue: { width: 54, textAlign: "right", fontSize: 12, fontWeight: "800", color: TEXT },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  searchInput: { flex: 1, color: TEXT, fontSize: 13, padding: 0 },

  chipsRow: { gap: 8, paddingVertical: 2, marginTop: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  chipActive: { backgroundColor: ACCENT_DIM, borderColor: ACCENT },
  chipText: { color: TEXT_DIM, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: ACCENT },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: BG,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: "800",
    color: TEXT_DIM,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  sectionHeaderTotal: { fontSize: 12, fontWeight: "800", color: GOLD },

  txnCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  txnIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  txnMid: { flex: 1, gap: 4 },
  txnTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  txnId: { fontSize: 13, fontWeight: "800", color: TEXT, flexShrink: 1 },
  modTag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  modTagText: { fontSize: 10, fontWeight: "800" },
  txnBottomRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  txnMeta: { fontSize: 11, color: TEXT_DIM, fontWeight: "600" },
  metaDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: TEXT_FAINT },

  txnRight: { alignItems: "flex-end", gap: 4 },
  txnTotal: { fontSize: 15, fontWeight: "800", color: TEXT },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusDotSmall: { width: 5, height: 5, borderRadius: 3 },
  statusDone: { backgroundColor: SUCCESS_DIM },
  statusPending: { backgroundColor: WARNING_DIM },
  statusText: { fontSize: 10, fontWeight: "800" },
  statusDoneText: { color: SUCCESS },
  statusPendingText: { color: WARNING },

  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderStyle: "dashed",
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  emptyTitle: { color: TEXT, fontSize: 14, fontWeight: "800", marginTop: 4 },
  emptyBody: { color: TEXT_DIM, fontSize: 12, fontWeight: "600", textAlign: "center" },
  emptyBtn: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: GOLD,
  },
  emptyBtnText: { color: "#181e38", fontWeight: "800", fontSize: 12 },
});
