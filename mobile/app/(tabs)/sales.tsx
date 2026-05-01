import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
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
import { useAuth } from "../../src/context/AuthContext";
import { API_TARGET } from "../../src/services/api";
import {
  fetchOfficialSalesHistory,
  fetchOfficialStoreStatisticsRange,
  type OfficialStoreStatisticsRange,
} from "../../src/services/officialDashboard";
import { AnimatedNumber } from "../../src/components/AnimatedNumber";
import { Skeleton } from "../../src/components/Skeleton";
import { SectionLabel } from "../../src/components/SectionLabel";
import { haptic } from "../../src/utils/haptics";
import {
  ACCENT,
  ACCENT_DIM,
  BG,
  CARD,  CARD_BORDER,
  DANGER,
  GOLD,
  GOLD_DIM,
  SCREEN_PADDING,
  SUCCESS,
  TEXT,
  TEXT_DIM,
  TEXT_FAINT,
  WARNING,
} from "../../src/theme/tokens";

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

function buildPeriodSummary(sales: Sale[], start: Date, endExclusive: Date): PeriodSummary {
  const scoped = sales.filter((sale) => {
    const d = parseDate(sale.date);
    return d >= start && d < endExclusive;
  });
  const revenue = scoped.reduce((sum, sale) => sum + parseMoney(sale.total), 0);
  const orders = scoped.length;
  const avg = orders > 0 ? revenue / orders : 0;
  return {
    revenue: revenue.toFixed(2),
    orders,
    avg: avg.toFixed(2),
  };
}

function buildSalesSummary(sales: Sale[], now = new Date()): SalesSummary {
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const thisWeekStart = weekStart(now);
  const nextWeekStart = addDays(thisWeekStart, 7);
  const thisMonthStart = monthStart(now);
  const nextMonthStart = new Date(thisMonthStart.getFullYear(), thisMonthStart.getMonth() + 1, 1);

  return {
    today: buildPeriodSummary(sales, todayStart, tomorrowStart),
    this_week: buildPeriodSummary(sales, thisWeekStart, nextWeekStart),
    this_month: buildPeriodSummary(sales, thisMonthStart, nextMonthStart),
  };
}

function getSelectedPeriodBounds(
  period: Period,
  selectedDate: Date,
  selectedWeekStart: Date,
  selectedMonthStart: Date,
  now = new Date()
): { start: Date; endInclusive: Date; endExclusive: Date } {
  if (period === "today") {
    const start = startOfDay(selectedDate);
    const isCurrent = dayKey(start) === dayKey(startOfDay(now));
    const endInclusive = isCurrent ? new Date(now) : new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 0);
    return {
      start,
      endInclusive,
      endExclusive: addDays(start, 1),
    };
  }

  if (period === "this_week") {
    const start = weekStart(selectedWeekStart);
    const currentWeekStart = weekStart(now);
    const isCurrent = dayKey(start) === dayKey(currentWeekStart);
    const weekEndDate = addDays(start, 6);
    const endInclusive = isCurrent
      ? new Date(now)
      : new Date(weekEndDate.getFullYear(), weekEndDate.getMonth(), weekEndDate.getDate(), 23, 59, 59, 0);
    return {
      start,
      endInclusive,
      endExclusive: addDays(start, 7),
    };
  }

  const start = monthStart(selectedMonthStart);
  const currentMonth = monthStart(now);
  const isCurrent =
    start.getFullYear() === currentMonth.getFullYear() &&
    start.getMonth() === currentMonth.getMonth();
  const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  const endInclusive = isCurrent
    ? new Date(now)
    : new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate(), 23, 59, 59, 0);
  return {
    start,
    endInclusive,
    endExclusive: new Date(start.getFullYear(), start.getMonth() + 1, 1),
  };
}

function getPreviousComparisonBounds(bounds: {
  start: Date;
  endInclusive: Date;
  endExclusive: Date;
}): { start: Date; endInclusive: Date; endExclusive: Date } {
  const durationMs = Math.max(0, bounds.endInclusive.getTime() - bounds.start.getTime());
  const endInclusive = new Date(bounds.start.getTime() - 1);
  const start = new Date(endInclusive.getTime() - durationMs);
  return {
    start,
    endInclusive,
    endExclusive: new Date(endInclusive.getTime() + 1),
  };
}

function calcRevenueChangePct(currentRevenue: number, previousRevenue: number): number {
  if (previousRevenue <= 0) {
    return currentRevenue <= 0 ? 0 : 100;
  }
  return ((currentRevenue - previousRevenue) / previousRevenue) * 100;
}

// ─── Statement subcomponents ─────────────────────────────────────────────────

function StatementRow({
  label,
  value,
  emphasis,
  total,
  negative,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  total?: boolean;
  negative?: boolean;
}) {
  return (
    <View style={styles.statementRow}>
      <Text
        style={[
          styles.statementLabel,
          emphasis && styles.statementLabelEmphasis,
          total && styles.statementLabelTotal,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.statementValue,
          emphasis && styles.statementValueEmphasis,
          total && styles.statementValueTotal,
          negative && styles.statementValueNegative,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function StatementSubRow({
  label,
  value,
  negative,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <View style={[styles.statementRow, styles.statementSubRow]}>
      <View style={styles.statementSubLabelWrap}>
        <Text style={styles.statementSubGlyph}>└</Text>
        <Text style={styles.statementSubLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text
        style={[
          styles.statementSubValue,
          negative && styles.statementValueNegative,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function StatementDivider() {
  return <View style={styles.statementDivider} />;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SalesScreen() {
  const { email, token, loading: authLoading } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [chart, setChart] = useState<{ day: string; revenue: number }[]>([]);
  const [officialPeriodStat, setOfficialPeriodStat] = useState<PeriodSummary | null>(null);
  const [officialStats, setOfficialStats] = useState<OfficialStoreStatisticsRange | null>(null);
  const [revenueChangePct, setRevenueChangePct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("this_week");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
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

  // Horizontal swipe to navigate the active period (day / week / month)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => {
        return Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8;
      },
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < 40) return;
        const direction = g.dx > 0 ? -1 : 1; // swipe right → previous, swipe left → next
        const p = periodRef.current;
        const today = todayRef.current;

        if (p === "today") {
          if (direction === -1) {
            haptic.selection();
            setSelectedDate((d) => addDays(d, -1));
          } else {
            setSelectedDate((d) => {
              if (d >= today) {
                haptic.warning();
                return d;
              }
              haptic.selection();
              const next = addDays(d, 1);
              return next > today ? today : next;
            });
          }
        } else if (p === "this_week") {
          const tws = weekStart(today);
          if (direction === -1) {
            haptic.selection();
            setSelectedWeekStart((d) => addDays(d, -7));
          } else {
            setSelectedWeekStart((d) => {
              if (d >= tws) {
                haptic.warning();
                return d;
              }
              haptic.selection();
              const next = addDays(d, 7);
              return next > tws ? tws : next;
            });
          }
        } else {
          const tms = monthStart(today);
          if (direction === -1) {
            haptic.selection();
            setSelectedMonthStart((d) => {
              const x = new Date(d);
              x.setMonth(x.getMonth() - 1);
              return x;
            });
          } else {
            setSelectedMonthStart((d) => {
              if (
                d.getFullYear() === tms.getFullYear() &&
                d.getMonth() === tms.getMonth()
              ) {
                haptic.warning();
                return d;
              }
              haptic.selection();
              const x = new Date(d);
              x.setMonth(x.getMonth() + 1);
              return x > tms ? tms : x;
            });
          }
        }
      },
    })
  ).current;

  const selectedBounds = useMemo(
    () =>
      getSelectedPeriodBounds(
        period,
        selectedDate,
        selectedWeekStart,
        selectedMonthStart
      ),
    [period, selectedDate, selectedWeekStart, selectedMonthStart]
  );

  const fetchAll = useCallback(async () => {
    const historyResult = await Promise.allSettled([
      fetchOfficialSalesHistory(
        selectedBounds.start,
        selectedBounds.endInclusive,
        { email, token }
      ),
    ]);

    const firstResult = historyResult[0];
    if (firstResult.status === "fulfilled") {
      const mappedSales: Sale[] = firstResult.value.map((sale) => ({
        id: sale.id,
        date: sale.date,
        order_id: sale.order_id,
        items: sale.items,
        module: sale.module,
        payment: sale.payment,
        total: sale.total,
        status: sale.status,
      }));
      setSales(mappedSales);
      setSummary(buildSalesSummary(mappedSales));

      const endAnchor = startOfDay(selectedBounds.endInclusive);
      const dayKeys = Array.from({ length: 7 }, (_, i) =>
        dayKey(addDays(endAnchor, -(6 - i)))
      );
      const byDay = new Map<string, number>();
      for (const row of mappedSales) {
        const d = parseDate(row.date);
        const key = dayKey(startOfDay(d));
        byDay.set(key, (byDay.get(key) ?? 0) + parseMoney(row.total));
      }
      setChart(
        dayKeys.map((key) => ({
          day: new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
            weekday: "short",
          }),
          revenue: byDay.get(key) ?? 0,
        }))
      );
    } else {
      setSales([]);
      setSummary(buildSalesSummary([]));
      setChart([]);
    }
  }, [email, token, selectedBounds]);

  useEffect(() => {
    if (API_TARGET === "official" && authLoading) {
      return;
    }
    fetchAll().finally(() => setLoading(false));
  }, [authLoading, fetchAll]);

  const onRefresh = async () => {
    haptic.light();
    setRefreshing(true);
    await fetchAll();
    haptic.success();
    setRefreshing(false);
  };

  useEffect(() => {
    if (API_TARGET !== "official") {
      setOfficialPeriodStat(null);
      setOfficialStats(null);
      setRevenueChangePct(null);
      return;
    }
    if (authLoading) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const previousBounds = getPreviousComparisonBounds(selectedBounds);
        const [stats, previousStats] = await Promise.all([
          fetchOfficialStoreStatisticsRange(
            selectedBounds.start,
            selectedBounds.endInclusive,
            { email, token }
          ),
          fetchOfficialStoreStatisticsRange(
            previousBounds.start,
            previousBounds.endInclusive,
            { email, token }
          ),
        ]);
        if (cancelled) return;
        const avg =
          stats.financial.averageOrderValue > 0
            ? stats.financial.averageOrderValue
            : stats.orders > 0
            ? stats.revenue / stats.orders
            : 0;
        setOfficialPeriodStat({
          revenue: stats.revenue.toFixed(2),
          orders: stats.orders,
          avg: avg.toFixed(2),
        });
        setOfficialStats(stats);
        setRevenueChangePct(
          calcRevenueChangePct(stats.revenue, previousStats.revenue)
        );
      } catch (err) {
        console.log("[sales-period] storeStatistics fetch failed:", err);
        if (!cancelled) {
          setOfficialPeriodStat(null);
          setOfficialStats(null);
          setRevenueChangePct(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, email, token, selectedBounds]);

  // Fade + slide the Statement card whenever fresh stats arrive for a new period.
  const statementAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!officialStats) return;
    statementAnim.setValue(0);
    const id = requestAnimationFrame(() => {
      Animated.timing(statementAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => cancelAnimationFrame(id);
  }, [officialStats, statementAnim]);

  const fallbackStat = useMemo(
    () => buildPeriodSummary(sales, selectedBounds.start, selectedBounds.endExclusive),
    [sales, selectedBounds]
  );
  const previousBounds = useMemo(
    () => getPreviousComparisonBounds(selectedBounds),
    [selectedBounds]
  );
  const fallbackPreviousStat = useMemo(
    () => buildPeriodSummary(sales, previousBounds.start, previousBounds.endExclusive),
    [sales, previousBounds]
  );
  const fallbackRevenueChange = useMemo(
    () =>
      calcRevenueChangePct(
        parseMoney(fallbackStat.revenue),
        parseMoney(fallbackPreviousStat.revenue)
      ),
    [fallbackStat.revenue, fallbackPreviousStat.revenue]
  );

  const stat =
    API_TARGET === "official"
      ? officialPeriodStat ?? fallbackStat
      : summary
      ? summary[period]
      : fallbackStat;
  const revenueChange =
    API_TARGET === "official"
      ? revenueChangePct ?? fallbackRevenueChange
      : fallbackRevenueChange;
  const revenueChangeUp = revenueChange >= 0;
  const revenueChangeTone = revenueChange > 0 ? SUCCESS : revenueChange < 0 ? DANGER : TEXT_DIM;

  // Filter + group transactions
  const { sections, totalFiltered, paymentBreakdown, statusCounts, moduleBreakdown, periodItemsSold } = useMemo(() => {
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

    // Full period set for KPI totals (matches dashboard behavior, independent of local filters)
    const periodOnly = sales.filter((s) => {
      const d = parseDate(s.date);
      return isInPeriod(d, period, selectedDate, selectedWeekStart, selectedMonthStart);
    });

    // Status counts (within current period + search, before status filter)
    const periodMatched = sales.filter((s) => {
      const d = parseDate(s.date);
      if (!isInPeriod(d, period, selectedDate, selectedWeekStart, selectedMonthStart)) return false;
      if (q) {
        const hay = `${s.order_id} ${s.module} ${s.payment}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const counts: Record<StatusFilter, number> = {
      all: periodMatched.length,
      completed: periodMatched.filter((s) => s.status === "completed").length,
      pending: periodMatched.filter((s) => s.status !== "completed").length,
    };
    const itemsSold = periodOnly.reduce(
      (sum, s) => sum + (Number.isFinite(s.items) ? s.items : 0),
      0
    );

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

    const moduleMap = new Map<string, { revenue: number; orders: number }>();
    for (const s of periodMatched) {
      const current = moduleMap.get(s.module) ?? { revenue: 0, orders: 0 };
      current.revenue += parseMoney(s.total);
      current.orders += 1;
      moduleMap.set(s.module, current);
    }
    const moduleTotalRevenue = Array.from(moduleMap.values()).reduce(
      (sum, row) => sum + row.revenue,
      0
    );
    const moduleArr: ModuleStat[] = Array.from(moduleMap.entries())
      .map(([module, values]) => ({
        module,
        revenue: values.revenue,
        orders: values.orders,
        pct: moduleTotalRevenue > 0 ? (values.revenue / moduleTotalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      sections: sectionsArr,
      totalFiltered: filtered.length,
      paymentBreakdown: payArr,
      statusCounts: counts,
      moduleBreakdown: moduleArr,
      periodItemsSold: itemsSold,
    };
  }, [sales, period, statusFilter, search, selectedDate, selectedWeekStart, selectedMonthStart]);

  const itemsSoldKpi = periodItemsSold;

  const maxChart = Math.max(...chart.map((p) => p.revenue), 1);

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
            <View style={styles.topBar}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.eyebrow}>REPORTS</Text>
                <Text style={styles.title}>Sales</Text>
              </View>
              <Pressable
                accessibilityLabel="Export report"
                onPress={() => haptic.selection()}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              >
                <Ionicons name="download-outline" size={18} color={TEXT} />
              </Pressable>
              <Pressable
                accessibilityLabel="Filters"
                onPress={() => haptic.selection()}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              >
                <Ionicons name="options-outline" size={18} color={TEXT} />
              </Pressable>
            </View>

            {/* Period — underline text tabs */}
            <View style={styles.periodTabs}>
              {PERIODS.map((p) => {
                const active = period === p;
                return (
                  <Pressable
                    key={p}
                    accessibilityLabel={`Show ${PERIOD_LABELS[p]} data`}
                    onPress={() => {
                      haptic.selection();
                      setPeriod(p);
                    }}
                    style={styles.periodTab}
                  >
                    <Text style={[styles.periodTabText, active && styles.periodTabTextActive]}>
                      {PERIOD_LABELS[p]}
                    </Text>
                    <View
                      style={[
                        styles.periodTabUnderline,
                        active && styles.periodTabUnderlineActive,
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>

            {/* Date pager — [<] label [>]  +  Today reset */}
            {(() => {
              const isCurrent =
                period === "today"
                  ? isSelectedToday
                  : period === "this_week"
                  ? dayKey(selectedWeekStart) === dayKey(thisWeekStart)
                  : selectedMonthStart.getFullYear() === thisMonthStart.getFullYear() &&
                    selectedMonthStart.getMonth() === thisMonthStart.getMonth();

              const canGoNext =
                period === "today"
                  ? selectedDate < today
                  : period === "this_week"
                  ? selectedWeekStart < thisWeekStart
                  : selectedMonthStart < thisMonthStart;

              const label =
                period === "today"
                  ? formatFullDate(selectedDate)
                  : period === "this_week"
                  ? formatWeekPill(selectedWeekStart)
                  : formatMonthPill(selectedMonthStart);

              const goPrev = () => {
                haptic.selection();
                if (period === "today") {
                  setSelectedDate((d) => addDays(d, -1));
                } else if (period === "this_week") {
                  setSelectedWeekStart((d) => addDays(d, -7));
                } else {
                  setSelectedMonthStart((d) => {
                    const x = new Date(d);
                    x.setMonth(x.getMonth() - 1);
                    return x;
                  });
                }
              };
              const goNext = () => {
                if (!canGoNext) {
                  haptic.warning();
                  return;
                }
                haptic.selection();
                if (period === "today") {
                  setSelectedDate((d) => {
                    const next = addDays(d, 1);
                    return next > today ? today : next;
                  });
                } else if (period === "this_week") {
                  setSelectedWeekStart((d) => {
                    const next = addDays(d, 7);
                    return next > thisWeekStart ? thisWeekStart : next;
                  });
                } else {
                  setSelectedMonthStart((d) => {
                    const x = new Date(d);
                    x.setMonth(x.getMonth() + 1);
                    return x > thisMonthStart ? thisMonthStart : x;
                  });
                }
              };
              const goCurrent = () => {
                haptic.light();
                if (period === "today") setSelectedDate(today);
                else if (period === "this_week") setSelectedWeekStart(thisWeekStart);
                else setSelectedMonthStart(thisMonthStart);
              };

              return (
                <View style={styles.datePager}>
                  <Pressable
                    accessibilityLabel="Previous"
                    onPress={goPrev}
                    style={({ pressed }) => [styles.pagerArrow, pressed && styles.pressed]}
                    hitSlop={8}
                  >
                    <Ionicons name="chevron-back" size={18} color={TEXT} />
                  </Pressable>

                  <View style={styles.pagerCenter}>
                    <Text style={styles.pagerLabel} numberOfLines={1}>
                      {label}
                    </Text>
                    {isCurrent ? (
                      <Text style={styles.pagerCurrentTag}>
                        {period === "today"
                          ? "TODAY"
                          : period === "this_week"
                          ? "THIS WEEK"
                          : "THIS MONTH"}
                      </Text>
                    ) : (
                      <Pressable
                        accessibilityLabel="Jump to current"
                        onPress={goCurrent}
                        hitSlop={6}
                      >
                        <Text style={styles.pagerJump}>
                          Jump to{" "}
                          {period === "today"
                            ? "today"
                            : period === "this_week"
                            ? "this week"
                            : "this month"}
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  <Pressable
                    accessibilityLabel="Next"
                    onPress={goNext}
                    disabled={!canGoNext}
                    style={({ pressed }) => [
                      styles.pagerArrow,
                      !canGoNext && styles.pagerArrowDisabled,
                      pressed && canGoNext && styles.pressed,
                    ]}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={canGoNext ? TEXT : TEXT_FAINT}
                    />
                  </Pressable>
                </View>
              );
            })()}

            {/* Hero revenue — flat, dashboard-style */}
            {loading ? (
              <Skeleton height={110} radius={22} />
            ) : (
              <>
                <View style={styles.hero}>
                  <View style={styles.heroLeft}>
                    <View style={styles.heroLabelRow}>
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
                      <View style={styles.heroDots}>
                        <View
                          style={[styles.heroDot, period === "today" && styles.heroDotActive]}
                        />
                        <View
                          style={[styles.heroDot, period === "this_week" && styles.heroDotActive]}
                        />
                        <View
                          style={[styles.heroDot, period === "this_month" && styles.heroDotActive]}
                        />
                      </View>
                    </View>
                    <AnimatedNumber
                      value={parseMoney(stat?.revenue)}
                      prefix="$"
                      maxDecimals={2}
                      style={styles.heroValue}
                    />
                    <View style={styles.heroFoot}>
                      <View style={styles.heroBadge}>
                        <Ionicons
                          name={
                            revenueChange > 0
                              ? "trending-up"
                              : revenueChange < 0
                              ? "trending-down"
                              : "remove"
                          }
                          size={11}
                          color={revenueChangeTone}
                        />
                        <Text style={[styles.heroBadgeText, { color: revenueChangeTone }]}>
                          {revenueChangeUp ? "+" : ""}
                          {Math.abs(revenueChange).toFixed(1)}%
                        </Text>
                      </View>
                      <Text style={styles.heroHint}>
                        vs previous {PERIOD_LABELS[period].toLowerCase()}
                      </Text>
                    </View>
                  </View>

                  {/* Mini spark bars */}
                  {chart.length > 0 && (
                    <View style={styles.spark}>
                      {chart.slice(-7).map((p, i) => {
                        const slice = chart.slice(-7);
                        const heightPct = Math.max(p.revenue / maxChart, 0.08);
                        const isLast = i === slice.length - 1;
                        return (
                          <View key={`${p.day}-${i}`} style={styles.sparkCol}>
                            <View
                              style={[
                                styles.sparkBar,
                                { height: `${Math.round(heightPct * 100)}%` },
                                isLast && styles.sparkBarActive,
                              ]}
                            />
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* KPI Row — flat, divided by hairlines */}
                <View style={styles.kpiRow}>
                  <View style={styles.kpiCell}>
                    <Ionicons name="cube-outline" size={16} color={GOLD} />
                    <AnimatedNumber value={itemsSoldKpi} style={styles.kpiValue} />
                    <Text style={styles.kpiLabel}>Items sold</Text>
                  </View>
                  <View style={styles.kpiDivider} />
                  <View style={styles.kpiCell}>
                    <Ionicons name="receipt-outline" size={16} color={WARNING} />
                    <AnimatedNumber value={stat?.orders ?? 0} style={styles.kpiValue} />
                    <Text style={styles.kpiLabel}>Orders</Text>
                  </View>
                  <View style={styles.kpiDivider} />
                  <View style={styles.kpiCell}>
                    <Ionicons name="cart-outline" size={16} color="#818cf8" />
                    <AnimatedNumber
                      value={parseMoney(stat?.avg)}
                      prefix="$"
                      decimals={2}
                      style={styles.kpiValue}
                    />
                    <Text style={styles.kpiLabel}>Avg order</Text>
                  </View>
                </View>
              </>
            )}

            {/* Statement — itemised storeStatistics breakdown */}
            {loading ? (
              <Skeleton height={320} radius={16} />
            ) : (
              officialStats && (() => {
                const f = officialStats.financial;
                const o = officialStats.operational;
                const periodHint =
                  period === "today"
                    ? formatShortDate(selectedDate).toUpperCase()
                    : period === "this_week"
                    ? formatWeekPill(selectedWeekStart).toUpperCase()
                    : formatMonthPill(selectedMonthStart).toUpperCase();
                const fmt = (n: number) =>
                  `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
                const diningEntries = Object.entries(officialStats.diningMode).sort(
                  (a, b) => b[1] - a[1]
                );
                const paymentEntries = Object.entries(
                  officialStats.paymentMethod
                ).sort((a, b) => b[1] - a[1]);
                return (
                  <View style={styles.block}>
                    <SectionLabel
                      label="Statement"
                      right={<Text style={styles.sectionHint}>{periodHint}</Text>}
                    />

                    <Animated.View
                      style={[
                        styles.statementCard,
                        {
                          opacity: statementAnim,
                          transform: [
                            {
                              translateY: statementAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [8, 0],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      <StatementRow label="Total Orders" value={String(o.totalOrders)} />
                      <StatementDivider />

                      <StatementRow
                        label="Gross Sales"
                        value={fmt(f.grossSales)}
                        emphasis
                      />
                      <StatementSubRow
                        label="Item Sales"
                        value={fmt(f.totalItemSale)}
                      />
                      <StatementSubRow
                        label="Credit Recharge"
                        value={fmt(f.totalCreditAdded)}
                      />
                      <StatementSubRow
                        label="Member Credit"
                        value={fmt(-f.totalCreditUsage)}
                        negative={f.totalCreditUsage > 0}
                      />
                      <StatementSubRow
                        label="Rounding"
                        value={fmt(f.totalRounding)}
                      />

                      <StatementDivider />
                      <StatementRow
                        label="Discounts"
                        value={fmt(-f.totalDiscount)}
                        negative={f.totalDiscount > 0}
                      />
                      <StatementDivider />
                      <StatementRow
                        label={`Refunds (${o.refundCount})`}
                        value={fmt(-f.totalRefunds)}
                        negative={f.totalRefunds > 0}
                      />
                      <StatementDivider />
                      <StatementRow
                        label="Holiday Surcharge"
                        value={fmt(f.totalExtraCharge)}
                      />
                      <StatementDivider />
                      <StatementRow
                        label="Payment Surcharge"
                        value={fmt(f.totalSurcharge)}
                      />
                      {f.totalTax > 0 && (
                        <>
                          <StatementDivider />
                          <StatementRow label="Tax" value={fmt(f.totalTax)} />
                        </>
                      )}
                      <StatementDivider />
                      <StatementRow
                        label="Total Revenue"
                        value={fmt(f.totalRevenue)}
                        total
                      />

                      {diningEntries.length > 0 && (
                        <>
                          <View style={styles.statementSectionHeader}>
                            <Text style={styles.statementSectionHeaderText}>
                              DINING MODE
                            </Text>
                          </View>
                          {diningEntries.map(([name, value], idx) => (
                            <View key={`d-${name}`}>
                              {idx > 0 && <StatementDivider />}
                              <StatementRow label={name} value={fmt(value)} />
                            </View>
                          ))}
                        </>
                      )}

                      {paymentEntries.length > 0 && (
                        <>
                          <View style={styles.statementSectionHeader}>
                            <Text style={styles.statementSectionHeaderText}>
                              PAYMENT METHODS
                            </Text>
                          </View>
                          {paymentEntries.map(([name, value], idx) => (
                            <View key={`p-${name}`}>
                              {idx > 0 && <StatementDivider />}
                              <StatementRow label={name} value={fmt(value)} />
                            </View>
                          ))}
                        </>
                      )}
                    </Animated.View>
                  </View>
                );
              })()
            )}

            {/* Payment breakdown */}
            {!loading && paymentBreakdown.length > 0 && (
              <View style={styles.block}>
                <SectionLabel
                  label="Payment Mix"
                  right={
                    <Text style={styles.sectionHint}>
                      {paymentBreakdown.length}{" "}
                      {paymentBreakdown.length === 1 ? "method" : "methods"}
                    </Text>
                  }
                />

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
              <Skeleton height={140} radius={16} />
            ) : (
              moduleBreakdown.length > 0 && (
                <View style={styles.block}>
                  <SectionLabel label="Revenue by Module" />
                  <View style={styles.moduleList}>
                    {moduleBreakdown.map((m, i) => (
                      <View
                        key={m.module}
                        style={[
                          styles.moduleRow,
                          i !== moduleBreakdown.length - 1 && styles.moduleRowDivider,
                        ]}
                      >
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
                </View>
              )
            )}

            {/* Search — focus-aware pill */}
            <View
              style={[
                styles.searchRow,
                searchFocused && styles.searchRowFocused,
              ]}
            >
              <Ionicons
                name="search"
                size={15}
                color={searchFocused ? GOLD : TEXT_DIM}
              />
              <TextInput
                accessibilityLabel="Search transactions"
                placeholder="Search order ID, module, payment…"
                placeholderTextColor={TEXT_FAINT}
                value={search}
                onChangeText={setSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {search ? (
                <Pressable
                  accessibilityLabel="Clear search"
                  onPress={() => {
                    haptic.selection();
                    setSearch("");
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={18} color={TEXT_DIM} />
                </Pressable>
              ) : null}
            </View>

            {/* Status filter — underline text tabs (matches period tabs) */}
            <View style={styles.statusTabs}>
              {STATUS_FILTERS.map((f) => {
                const active = statusFilter === f;
                const count = statusCounts[f];
                return (
                  <Pressable
                    key={f}
                    accessibilityLabel={`Filter: ${STATUS_LABELS[f]}, ${count} records`}
                    onPress={() => {
                      haptic.selection();
                      setStatusFilter(f);
                    }}
                    style={styles.statusTab}
                  >
                    <View style={styles.statusTabRow}>
                      <Text
                        style={[
                          styles.statusTabText,
                          active && styles.statusTabTextActive,
                        ]}
                      >
                        {STATUS_LABELS[f]}
                      </Text>
                      <View
                        style={[
                          styles.statusTabCount,
                          active && styles.statusTabCountActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusTabCountText,
                            active && styles.statusTabCountTextActive,
                          ]}
                        >
                          {count}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.statusTabUnderline,
                        active && styles.statusTabUnderlineActive,
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>

            {/* Txn header */}
            <SectionLabel
              label="Transactions"
              right={<Text style={styles.sectionHint}>{totalFiltered} records</Text>}
            />
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
        renderItem={({ item, index, section }) => {
          const d = parseDate(item.date);
          const payIcon = PAYMENT_ICONS[item.payment] ?? "card-outline";
          const payColor = PAYMENT_COLORS[item.payment] ?? "#64748b";
          const isLastInSection = index === section.data.length - 1;
          const done = item.status === "completed";
          return (
            <Pressable
              accessibilityLabel={`Order ${item.order_id}, ${item.status}, ${item.total} dollars`}
              onPress={() => haptic.light()}
              style={({ pressed }) => [
                styles.txnRow,
                !isLastInSection && styles.txnRowDivider,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.txnIcon, { backgroundColor: payColor + "1a" }]}>
                <Ionicons name={payIcon} size={16} color={payColor} />
              </View>

              <View style={styles.txnMid}>
                <View style={styles.txnTopRow}>
                  <Text style={styles.txnId} numberOfLines={1}>
                    {item.order_id}
                  </Text>
                  <View
                    style={[
                      styles.modTag,
                      { backgroundColor: (MODULE_COLORS[item.module] ?? "#64748b") + "1f" },
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
                <Text style={styles.txnSub} numberOfLines={1}>
                  {formatTime(d)} · {item.items} items · {item.payment}
                </Text>
              </View>

              <View style={styles.txnRight}>
                <Text style={styles.txnTotal}>${item.total}</Text>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: done ? SUCCESS : WARNING },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: done ? SUCCESS : WARNING },
                    ]}
                  >
                    {done ? "Done" : "Active"}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={null}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: 1, paddingTop: 4 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={64} radius={0} />
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
  content: { padding: SCREEN_PADDING, paddingTop: 8, paddingBottom: 40, gap: 22 },
  pressed: { opacity: 0.7 },

  // Top bar — matches dashboard rhythm
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  eyebrow: {
    color: TEXT_FAINT,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  dateSubtitle: {
    color: TEXT_DIM,
    fontSize: 12,
    fontWeight: "500",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },

  // Period — underline text tabs
  periodTabs: {
    flexDirection: "row",
    gap: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  periodTab: {
    paddingVertical: 10,
    alignItems: "center",
  },
  periodTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT_DIM,
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  periodTabTextActive: {
    color: TEXT,
    fontWeight: "700",
  },
  periodTabUnderline: {
    height: 2,
    width: "100%",
    borderRadius: 1,
    backgroundColor: "transparent",
  },
  periodTabUnderlineActive: {
    backgroundColor: GOLD,
  },

  // Date pager — [<] label [>]
  datePager: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  pagerArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  pagerArrowDisabled: {
    opacity: 0.4,
  },
  pagerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  pagerLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.2,
  },
  pagerCurrentTag: {
    fontSize: 9,
    fontWeight: "700",
    color: GOLD,
    letterSpacing: 1.5,
  },
  pagerJump: {
    fontSize: 10,
    fontWeight: "600",
    color: GOLD,
    letterSpacing: 0.3,
  },

  // Hero — flat (no card)
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
  heroFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heroBadgeText: { fontSize: 12, fontWeight: "600" },
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

  // KPI row — flat with hairline dividers
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

  // Generic flat block (replaces card)
  block: {
    gap: 10,
  },
  sectionHint: { fontSize: 11, color: TEXT_DIM, fontWeight: "600" },

  // Statement card — itemised storeStatistics breakdown
  statementCard: {
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statementRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    gap: 12,
  },
  statementSubRow: {
    paddingVertical: 8,
  },
  statementDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CARD_BORDER,
  },
  statementLabel: {
    color: TEXT_DIM,
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
  },
  statementLabelEmphasis: {
    color: TEXT,
    fontWeight: "600",
  },
  statementLabelTotal: {
    color: TEXT,
    fontWeight: "700",
    fontSize: 14,
  },
  statementValue: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  statementValueEmphasis: {
    fontWeight: "700",
  },
  statementValueTotal: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  statementValueNegative: {
    color: DANGER,
  },
  statementSubLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  statementSubGlyph: {
    color: TEXT_FAINT,
    fontSize: 12,
    fontWeight: "500",
  },
  statementSubLabel: {
    color: TEXT_DIM,
    fontSize: 12,
    fontWeight: "500",
    flexShrink: 1,
  },
  statementSubValue: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  statementSectionHeader: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 4,
  },
  statementSectionHeaderText: {
    color: TEXT_FAINT,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },

  // Stacked bar / legend
  stackedBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendName: { fontSize: 11, color: TEXT, fontWeight: "600" },
  legendPct: { fontSize: 11, color: TEXT_DIM, fontWeight: "500" },

  // Module list
  moduleList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  moduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  moduleRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  moduleLeft: { flexDirection: "row", alignItems: "center", gap: 6, width: 84 },
  moduleDot: { width: 8, height: 8, borderRadius: 4 },
  moduleName: { fontSize: 12, color: TEXT, fontWeight: "600" },
  barWrap: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 3 },
  moduleRevenue: {
    width: 56,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.2,
  },

  // Search — focus-aware pill
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchRowFocused: {
    borderColor: GOLD,
    backgroundColor: GOLD_DIM,
  },
  searchInput: {
    flex: 1,
    color: TEXT,
    fontSize: 14,
    fontWeight: "500",
    padding: 0,
    letterSpacing: -0.1,
  },

  // Status filter — underline text tabs (matches period tabs)
  statusTabs: {
    flexDirection: "row",
    gap: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  statusTab: {
    paddingVertical: 10,
    alignItems: "center",
  },
  statusTabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  statusTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT_DIM,
    letterSpacing: 0.2,
  },
  statusTabTextActive: {
    color: TEXT,
    fontWeight: "700",
  },
  statusTabCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  statusTabCountActive: {
    backgroundColor: GOLD_DIM,
  },
  statusTabCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: TEXT_DIM,
    letterSpacing: 0.1,
  },
  statusTabCountTextActive: {
    color: GOLD,
  },
  statusTabUnderline: {
    height: 2,
    width: "100%",
    borderRadius: 1,
    backgroundColor: "transparent",
  },
  statusTabUnderlineActive: {
    backgroundColor: GOLD,
  },

  // Section header (sticky day grouping)
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: TEXT_DIM,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  sectionHeaderTotal: { fontSize: 12, fontWeight: "700", color: GOLD, letterSpacing: -0.2 },

  // Transactions — flat rows like dashboard order list
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  txnRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
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
  txnId: { fontSize: 13, fontWeight: "700", color: TEXT, flexShrink: 1, letterSpacing: -0.1 },
  modTag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  modTagText: { fontSize: 10, fontWeight: "700" },
  txnSub: { fontSize: 11, color: TEXT_DIM, fontWeight: "500" },

  txnRight: { alignItems: "flex-end", gap: 4 },
  txnTotal: { fontSize: 15, fontWeight: "700", color: TEXT, letterSpacing: -0.3 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 10, fontWeight: "600", letterSpacing: 0.2 },

  // Empty
  emptyCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    borderStyle: "dashed",
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  emptyTitle: { color: TEXT, fontSize: 14, fontWeight: "700", marginTop: 4 },
  emptyBody: { color: TEXT_DIM, fontSize: 12, fontWeight: "500", textAlign: "center" },
  emptyBtn: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: GOLD,
  },
  emptyBtnText: { color: "#181e38", fontWeight: "700", fontSize: 12 },
});
