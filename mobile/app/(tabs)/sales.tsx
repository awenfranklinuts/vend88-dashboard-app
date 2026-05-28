import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Modal,
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
import { useLocalSearchParams } from "expo-router";
import { File, Paths } from "expo-file-system";
import { Asset } from "expo-asset";
import { useAuth } from "../../src/context/AuthContext";
import { useI18n } from "../../src/context/I18nContext";
import { useNetwork } from "../../src/context/NetworkContext";
import { API_TARGET } from "../../src/services/api";
import {
  fetchOfficialBusinessItemsSoldRange,
  fetchOfficialOrderDetail,
  fetchOfficialProductDetails,
  fetchOfficialSalesHistory,
  fetchOfficialShopDetail,
  fetchOfficialStoreStatisticsRange,
  fetchOfficialTopSellingItems,
  invalidateOfficialDashboardCaches,
  type DashboardTopItem,
  type OfficialOrderDetail,
  type OfficialStoreStatisticsRange,
} from "../../src/services/officialDashboard";
import { AnimatedNumber } from "../../src/components/AnimatedNumber";
import {
  LoadingHero,
  LoadingKpiRow,
  LoadingStatement,
  LoadingModuleBreakdown,
  LoadingTransactionList,
  ShimmerSkeleton,
} from "../../src/components/ShimmerSkeleton";
import { TopProgressBar } from "../../src/components/TopProgressBar";
import { OfflineNotice } from "../../src/components/OfflineNotice";
import { FadingContent } from "../../src/components/FadingContent";
import { SectionLabel } from "../../src/components/SectionLabel";
import { haptic } from "../../src/utils/haptics";
import {
  ACCENT,
  ACCENT_DIM,
  BG,
  BG_ELEVATED,
  CARD,
  CARD_BORDER,
  DANGER,
  GOLD,
  GOLD_DIM,
  SCREEN_PADDING,
  SUCCESS,
  TEXT,
  TEXT_DIM,
  TEXT_FAINT,
  WARNING,
  type ThemeTokens,
} from "../../src/theme/tokens";
import { useThemeTokens } from "../../src/context/ThemeContext";

function useSalesStyles() {
  const tokens = useThemeTokens();
  return useMemo(
    () => ({
      tokens,
      styles: makeStyles(tokens),
      skelStyles: makeSkelStyles(tokens),
      detailStyles: makeDetailStyles(tokens),
    }),
    [tokens]
  );
}

type SharingModule = typeof import("expo-sharing");
type PrintModule = typeof import("expo-print");

const Sharing: SharingModule | null = (() => {
  try {
    return require("expo-sharing") as SharingModule;
  } catch {
    return null;
  }
})();

const Print: PrintModule | null = (() => {
  try {
    return require("expo-print") as PrintModule;
  } catch {
    return null;
  }
})();

// ─── Types ───────────────────────────────────────────────────────────────────

type Sale = {
  id: string | number;
  rawId?: string;
  date: string; // ISO or "YYYY-MM-DD HH:mm"
  order_id: string;
  items: number;
  module: string;
  payment: string;
  total: string;
  rawStatus?: string;
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
  // POS is intentionally blue to match the dashboard's POS module tag
  // (see `orderModTag` in index.tsx — text #3b82f6 / bg rgba(59,130,246,0.16)).
  POS: "#3b82f6",
  KDS: "#c084fc",
  Vending: "#4ade80",
  Kiosk: "#fdba74",
  Loyalty: "#67e8f9",
};

const MODULE_UNKNOWN_COLOR = "#94a3b8";

const PAYMENT_ICONS: Record<string, keyof typeof import("@expo/vector-icons").Ionicons.glyphMap> = {
  Cash: "cash-outline",
  Card: "card-outline",
  QR: "qr-code-outline",
  Wallet: "wallet-outline",
  Mobile: "phone-portrait-outline",
};

const PAYMENT_COLORS: Record<string, string> = {
  // Cash green and Tyro grey both mirror the dashboard's `orderGlyph` palette
  // in index.tsx so the same payment reads as the same color across screens.
  Cash: "#10b981",
  Card: "#5eead4",
  QR: "#a78bfa",
  Wallet: "#818cf8",
  Mobile: "#67e8f9",
  Tyro: "#64748b",
};

const PAYMENT_UNKNOWN_COLOR = "#94a3b8";
const PAYMENT_FALLBACK_PALETTE = [
  "#93c5fd",
  "#5eead4",
  "#c4b5fd",
  "#a5b4fc",
  "#7dd3fc",
  "#67e8f9",
  "#60a5fa",
];

function getPaymentColor(name: string): string {
  const known = PAYMENT_COLORS[name];
  if (known) return known;
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return PAYMENT_UNKNOWN_COLOR;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PAYMENT_FALLBACK_PALETTE.length;
  return PAYMENT_FALLBACK_PALETTE[idx];
}

// Dining-mode palette — intentionally different from payment/module palettes
// so each breakdown section has its own visual identity.
const DINING_COLORS: Record<string, string> = {
  "Dine-in": "#fda4af",
  "Dine In": "#fda4af",
  Takeaway: "#fcd34d",
  "Take Away": "#fcd34d",
  Delivery: "#bef264",
  "Drive-thru": "#5eead4",
  "Drive Thru": "#5eead4",
  Pickup: "#7dd3fc",
};
const DINING_FALLBACK_PALETTE = [
  "#fda4af",
  "#fdba74",
  "#fde047",
  "#bef264",
  "#99f6e4",
  "#bae6fd",
];

// Normalise raw payment-method keys returned by the storeStatistics breakdown
// (e.g. "cash", "card", "eftpos") into the same display labels used elsewhere
// in the app, so colours and existing rows continue to align.
function mapPaymentLabel(raw: string): string {
  const key = (raw ?? "").toLowerCase();
  if (key === "cash") return "Cash";
  if (key === "card" || key === "eftpos") return "Card";
  if (key === "qr") return "QR";
  if (key === "wallet") return "Wallet";
  if (key === "mobile") return "Mobile";
  if (!raw) return "Other";
  // Title-case unknowns so the legend reads cleanly.
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// Same idea for channel/module keys (pos, kiosk, vending, kds, loyalty…).
function mapModuleLabel(raw: string): string {
  const key = (raw ?? "").toLowerCase();
  if (key === "pos" || key === "table") return "POS";
  if (key === "kiosk") return "Kiosk";
  if (key === "vending") return "Vending";
  if (key === "kds") return "KDS";
  if (key === "loyalty") return "Loyalty";
  if (!raw) return "Other";
  return raw.toUpperCase();
}

const PERIODS = ["today", "this_week", "this_month", "custom"] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  this_week: "Week",
  this_month: "Month",
  custom: "Custom",
};

const ALL_STATUS_FILTER = "all";
type StatusFilter = string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseMoney(v: string | number | undefined): number {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return Number(String(v).replace(/[^0-9.-]/g, "")) || 0;
}

function formatCurrency(n: number, fractionDigits = 2): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const value = abs.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${sign}$${value}`;
}

function getTransactionStatusMeta(rawStatus?: string): {
  label: string;
  color: string;
} {
  const raw = (rawStatus ?? "").trim();
  const normalized = raw.toLowerCase();
  const label = raw
    ? raw
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase())
    : "Unknown";

  if (/unpaid/.test(normalized)) {
    return { label, color: WARNING };
  }
  if (/\bpaid\b|complete|done/.test(normalized)) {
    return { label, color: SUCCESS };
  }
  if (/refund|cancel|void/.test(normalized)) {
    return { label, color: DANGER };
  }
  if (/active|open|pending|progress/.test(normalized)) {
    return { label, color: WARNING };
  }
  return { label, color: TEXT_DIM };
}

function transactionNoun(
  count: number,
  t: (key: "sales_transaction_one" | "sales_transaction_other") => string
): string {
  return count === 1 ? t("sales_transaction_one") : t("sales_transaction_other");
}

function recordNoun(
  count: number,
  t: (key: "sales_record_one" | "sales_record_other") => string
): string {
  return count === 1 ? t("sales_record_one") : t("sales_record_other");
}

function itemNoun(
  count: number,
  t: (key: "products_item_one" | "products_item_other") => string
): string {
  return count === 1 ? t("products_item_one") : t("products_item_other");
}

function getTransactionStatusKey(rawStatus?: string): string {
  const raw = (rawStatus ?? "").trim().toLowerCase();
  return raw.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "unknown";
}

function parseDate(s: string): Date {
  // Accept ISO plus API forms like "YYYY-MM-DD HH:mm:ss +1000".
  const raw = String(s ?? "").trim();
  const normalized = raw.includes("T")
    ? raw.replace(" +", "+").replace(" -", "-")
    : raw.replace(" ", "T").replace(" +", "+").replace(" -", "-");
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) return d;

  // Avoid falling back to "now" for unparseable values, which would push
  // historical records into today/week/month incorrectly.
  const fallback = new Date(raw);
  return isNaN(fallback.getTime()) ? new Date(0) : fallback;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function relativeDayLabel(d: Date, t: (key: "sales_relative_today" | "sales_relative_yesterday") => string): string {
  const now = new Date();
  const today = dayKey(now);
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const yesterdayKey = dayKey(yest);
  const k = dayKey(d);
  if (k === today) return t("sales_relative_today");
  if (k === yesterdayKey) return t("sales_relative_yesterday");
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
  selMonthStart: Date,
  customStart?: Date | null,
  customEnd?: Date | null
): boolean {
  if (period === "today") return dayKey(d) === dayKey(selectedDate);
  if (period === "this_week") {
    const end = addDays(selWeekStart, 7); // exclusive
    return d >= selWeekStart && d < end;
  }
  if (period === "custom") {
    if (!customStart || !customEnd) return false;
    const start = startOfDay(customStart);
    const endExclusive = addDays(startOfDay(customEnd), 1);
    return d >= start && d < endExclusive;
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
  customStart?: Date | null,
  customEnd?: Date | null,
  now = new Date()
): { start: Date; endInclusive: Date; endExclusive: Date } {
  if (period === "custom" && customStart && customEnd) {
    const start = startOfDay(customStart);
    const endDay = startOfDay(customEnd);
    const todayStart = startOfDay(now);
    const isCurrent = dayKey(endDay) === dayKey(todayStart);
    const endInclusive = isCurrent
      ? new Date(now)
      : new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 23, 59, 59, 0);
    return {
      start,
      endInclusive,
      endExclusive: addDays(endDay, 1),
    };
  }
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

function getPreviousComparisonBounds(
  bounds: {
    start: Date;
    endInclusive: Date;
    endExclusive: Date;
  },
  period: Period
): { start: Date; endInclusive: Date; endExclusive: Date } {
  // Shift the current window back by one period unit so we compare like for
  // like (e.g. partial Mon-Wed of this week vs Mon-Wed of last week, not
  // Fri-Sun of last week). For "custom" we fall back to a duration-shift.
  const shiftDays = (d: Date, n: number) => {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
  };
  const shiftMonths = (d: Date, n: number) => {
    const copy = new Date(d);
    copy.setMonth(copy.getMonth() + n);
    return copy;
  };

  if (period === "today") {
    return {
      start: shiftDays(bounds.start, -1),
      endInclusive: shiftDays(bounds.endInclusive, -1),
      endExclusive: shiftDays(bounds.endExclusive, -1),
    };
  }
  if (period === "this_week") {
    // Compare against the full previous calendar week (Mon–Sun), not the
    // same elapsed slice. This matches the dashboard's week % and avoids
    // a partial week-to-date appearing positive vs a same-elapsed slice of
    // the previous week even when the full previous week was higher.
    const previousWeekStart = shiftDays(bounds.start, -7);
    const previousWeekEndExclusive = new Date(bounds.start);
    const previousWeekEndInclusive = new Date(previousWeekEndExclusive.getTime() - 1);
    return {
      start: previousWeekStart,
      endInclusive: previousWeekEndInclusive,
      endExclusive: previousWeekEndExclusive,
    };
  }
  if (period === "this_month") {
    const previousMonthStart = new Date(
      bounds.start.getFullYear(),
      bounds.start.getMonth() - 1,
      1
    );
    const previousMonthEndExclusive = new Date(
      bounds.start.getFullYear(),
      bounds.start.getMonth(),
      1
    );
    const previousMonthEndInclusive = new Date(previousMonthEndExclusive.getTime() - 1);

    return {
      // Month comparison should always use the full previous calendar month.
      // This matches the dashboard summary and avoids misleading MTD-vs-MTD
      // percentages such as comparing May 1-23 only against Apr 1-23.
      start: previousMonthStart,
      endInclusive: previousMonthEndInclusive,
      endExclusive: previousMonthEndExclusive,
    };
  }
  // custom: keep the duration-shift behaviour.
  const durationMs = Math.max(
    0,
    bounds.endInclusive.getTime() - bounds.start.getTime()
  );
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
  const { styles } = useSalesStyles();
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
  const { styles } = useSalesStyles();
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
  const { styles } = useSalesStyles();
  return <View style={styles.statementDivider} />;
}

// Empty-state card for breakdown chapters — small icon + one-liner so the
// page never silently drops a section. Uses the same `breakdownGroup` shell
// so it sits visually flush with the populated cards.
function EmptyBreakdownCard({
  icon,
  title,
  message,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
}) {
  const { tokens, styles } = useSalesStyles();
  return (
    <View style={styles.breakdownGroup}>
      <View style={styles.emptyBreakdownInner}>
        <View style={styles.emptyBreakdownIconWrap}>
          <Ionicons name={icon} size={18} color={tokens.TEXT_DIM} />
        </View>
        <View style={styles.emptyBreakdownTextWrap}>
          <Text style={styles.emptyBreakdownTitle}>{title}</Text>
          <Text style={styles.emptyBreakdownMessage}>{message}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Date range picker modal ─────────────────────────────────────────────────

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function buildMonthRows(viewMonth: Date): (Date | null)[][] {
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const daysInMonth = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth() + 1,
    0
  ).getDate();
  // Monday-first index (0..6)
  const leading = (firstOfMonth.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

function DateRangePickerModal({
  visible,
  initialStart,
  initialEnd,
  maxDate,
  onClose,
  onApply,
}: {
  visible: boolean;
  initialStart: Date | null;
  initialEnd: Date | null;
  maxDate: Date;
  onClose: () => void;
  onApply: (start: Date, end: Date) => void;
}) {
  const { tokens, styles } = useSalesStyles();
  const { t } = useI18n();
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    monthStart(initialStart ?? maxDate)
  );
  const [pendingStart, setPendingStart] = useState<Date | null>(initialStart);
  const [pendingEnd, setPendingEnd] = useState<Date | null>(initialEnd);

  // Reset state each time the modal opens
  useEffect(() => {
    if (visible) {
      setPendingStart(initialStart);
      setPendingEnd(initialEnd);
      setViewMonth(monthStart(initialStart ?? maxDate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const rows = useMemo(() => buildMonthRows(viewMonth), [viewMonth]);
  const monthLabel = viewMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const canGoNextMonth =
    viewMonth.getFullYear() < maxDate.getFullYear() ||
    (viewMonth.getFullYear() === maxDate.getFullYear() &&
      viewMonth.getMonth() < maxDate.getMonth());

  const handleDayPress = (d: Date) => {
    haptic.selection();
    if (!pendingStart || (pendingStart && pendingEnd)) {
      // start a new range
      setPendingStart(d);
      setPendingEnd(null);
      return;
    }
    // pendingStart set, pendingEnd not yet
    if (d < pendingStart) {
      setPendingStart(d);
      return;
    }
    setPendingEnd(d);
  };

  const isSameDay = (a: Date | null, b: Date | null) =>
    !!a && !!b && dayKey(a) === dayKey(b);

  const inRange = (d: Date) =>
    pendingStart && pendingEnd && d > pendingStart && d < pendingEnd;

  const canApply = !!(pendingStart && pendingEnd);
  const rangeSummary =
    pendingStart && pendingEnd
      ? `${formatShortDate(pendingStart)} – ${formatShortDate(pendingEnd)}`
      : pendingStart
      ? `${formatShortDate(pendingStart)} ${t("sales_picker_select_end")}`
      : t("sales_picker_select_start");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.pickerBackdrop} onPress={onClose}>
        <Pressable style={styles.pickerCard} onPress={() => {}}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{t("sales_picker_custom_range")}</Text>
            <Pressable
              accessibilityLabel={t("sales_picker_close")}
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [styles.pickerCloseBtn, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={18} color={tokens.TEXT} />
            </Pressable>
          </View>

          <Text style={styles.pickerSummary}>{rangeSummary}</Text>

          <View style={styles.pickerMonthBar}>
            <Pressable
              accessibilityLabel={t("sales_picker_prev_month")}
              onPress={() => {
                haptic.selection();
                setViewMonth((m) => {
                  const x = new Date(m);
                  x.setMonth(x.getMonth() - 1);
                  return x;
                });
              }}
              style={({ pressed }) => [styles.pagerArrow, pressed && styles.pressed]}
              hitSlop={6}
            >
              <Ionicons name="chevron-back" size={18} color={tokens.TEXT} />
            </Pressable>
            <Text style={styles.pickerMonthLabel}>{monthLabel}</Text>
            <Pressable
              accessibilityLabel={t("sales_picker_next_month")}
              disabled={!canGoNextMonth}
              onPress={() => {
                if (!canGoNextMonth) {
                  haptic.warning();
                  return;
                }
                haptic.selection();
                setViewMonth((m) => {
                  const x = new Date(m);
                  x.setMonth(x.getMonth() + 1);
                  return x;
                });
              }}
              style={({ pressed }) => [
                styles.pagerArrow,
                !canGoNextMonth && styles.pagerArrowDisabled,
                pressed && canGoNextMonth && styles.pressed,
              ]}
              hitSlop={6}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={canGoNextMonth ? tokens.TEXT : tokens.TEXT_FAINT}
              />
            </Pressable>
          </View>

          <View style={styles.pickerWeekHeader}>
            {WEEKDAY_LABELS.map((w) => (
              <Text key={w} style={styles.pickerWeekday}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.pickerGrid}>
            {rows.map((row, ri) => (
              <View key={`r-${ri}`} style={styles.pickerRow}>
                {row.map((d, ci) => {
                  if (!d) {
                    return <View key={`e-${ri}-${ci}`} style={styles.pickerCell} />;
                  }
                  const disabled = d > maxDate;
                  const isStart = isSameDay(d, pendingStart);
                  const isEnd = isSameDay(d, pendingEnd);
                  const between = inRange(d);
                  const isRangeEdgeStart = isStart && !!pendingEnd;
                  const isRangeEdgeEnd = isEnd && !!pendingStart;
                  return (
                    <View key={dayKey(d)} style={styles.pickerCell}>
                      {between && <View style={styles.pickerCellRangeBg} />}
                      {isRangeEdgeStart && <View style={styles.pickerCellRangeBgRight} />}
                      {isRangeEdgeEnd && <View style={styles.pickerCellRangeBgLeft} />}
                      <Pressable
                        disabled={disabled}
                        onPress={() => handleDayPress(d)}
                        style={({ pressed }) => [
                          styles.pickerDay,
                          (isStart || isEnd) && styles.pickerDayActive,
                          disabled && styles.pickerDayDisabled,
                          pressed && !disabled && !isStart && !isEnd && styles.pickerDayPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.pickerDayText,
                            (isStart || isEnd) && styles.pickerDayTextActive,
                            disabled && styles.pickerDayTextDisabled,
                          ]}
                        >
                          {d.getDate()}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.pickerActions}>
            <Pressable
              accessibilityLabel={t("sales_picker_clear_range")}
              onPress={() => {
                haptic.selection();
                setPendingStart(null);
                setPendingEnd(null);
              }}
              style={({ pressed }) => [styles.pickerSecondaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.pickerSecondaryBtnText}>{t("sales_picker_clear")}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t("sales_picker_apply_range")}
              disabled={!canApply}
              onPress={() => {
                if (!canApply || !pendingStart || !pendingEnd) {
                  haptic.warning();
                  return;
                }
                onApply(pendingStart, pendingEnd);
              }}
              style={({ pressed }) => [
                styles.pickerPrimaryBtn,
                !canApply && styles.pickerPrimaryBtnDisabled,
                pressed && canApply && styles.pressed,
              ]}
            >
              <Text style={styles.pickerPrimaryBtnText}>{t("sales_picker_apply")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Transactions list skeleton ─────────────────────────────────────────────

/**
 * Pixel-matched skeleton for the All Transactions modal list. Renders:
 *  • A soft "loading" pill at the top with a pulsing dot + count
 *  • Two day-section blocks each with a header row and shimmering txn rows
 * Mirrors the real row layout (icon, id+tag, sub line, amount, status) so
 * there's no visual jump when real data arrives.
 */
function TransactionsLoadingSkeleton({
  count,
  totalLabel,
}: {
  count: number;
  totalLabel: string;
}) {
  const { skelStyles } = useSalesStyles();
  // Pulse for the small "live" dot in the status pill.
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Split the requested rows into two day sections so the skeleton looks
  // structurally like the real list (sticky day headers + rows).
  const firstSection = Math.min(3, Math.max(2, Math.ceil(count / 2)));
  const secondSection = Math.max(0, count - firstSection);
  const sections = [firstSection, secondSection].filter((n) => n > 0);

  return (
    <View style={skelStyles.container}>
      {/* Status pill */}
      <View style={skelStyles.statusPill}>
        <Animated.View style={[skelStyles.statusDot, { opacity: pulse }]} />
        <Text style={skelStyles.statusText}>{totalLabel}…</Text>
      </View>

      {sections.map((rows, sectionIdx) => (
        <View key={sectionIdx} style={skelStyles.section}>
          {/* Day header row */}
          <View style={skelStyles.dayHeader}>
            <ShimmerSkeleton width={64} height={10} radius={3} />
            <ShimmerSkeleton width={72} height={12} radius={3} />
          </View>

          {/* Rows */}
          {Array.from({ length: rows }).map((_, rowIdx) => {
            const isLast = rowIdx === rows - 1;
            // Stagger row widths slightly so the skeleton feels organic,
            // not like a uniform grid.
            const idWidth = 56 + ((rowIdx * 13) % 24);
            const subWidth = 110 + ((rowIdx * 17) % 60);
            const amtWidth = 48 + ((rowIdx * 11) % 24);
            return (
              <View
                key={rowIdx}
                style={[skelStyles.row, !isLast && skelStyles.rowDivider]}
              >
                <View style={skelStyles.iconWrap}>
                  <ShimmerSkeleton width={36} height={36} radius={18} />
                </View>

                <View style={skelStyles.mid}>
                  <View style={skelStyles.midTopRow}>
                    <ShimmerSkeleton width={idWidth} height={12} radius={3} />
                    <ShimmerSkeleton width={36} height={14} radius={6} />
                  </View>
                  <View style={{ height: 6 }} />
                  <ShimmerSkeleton width={subWidth} height={10} radius={3} />
                </View>

                <View style={skelStyles.right}>
                  <ShimmerSkeleton width={amtWidth} height={14} radius={3} />
                  <View style={{ height: 6 }} />
                  <ShimmerSkeleton width={36} height={10} radius={3} />
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const makeSkelStyles = (t: ThemeTokens) => StyleSheet.create({
  container: { paddingTop: 6 },
  statusPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    marginBottom: 18,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.GOLD,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: t.TEXT_DIM,
    letterSpacing: 0.2,
  },
  section: { marginBottom: 18 },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
  },
  mid: { flex: 1 },
  midTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  right: { alignItems: "flex-end" },
});

// ─── Order detail modal ────────────────────────────────────────────────────

type OrderProduct = {
  name: string;
  sku?: string;
  qty: number;
  price: number;
  imageUrl?: string;
  refunded?: boolean;
};

type OrderTransaction = {
  id?: string;
  platform?: string;
  type?: string;
  amount?: number;
  surcharge?: number;
};

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}
function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return undefined;
}

function extractProducts(order: OfficialOrderDetail): OrderProduct[] {
  const candidates: unknown[] = [];
  for (const key of ["products", "items", "order_items", "line_items"]) {
    const v = (order as Record<string, unknown>)[key];
    if (Array.isArray(v)) {
      // Skip if entries are plain strings — those are product IDs and
      // are handled by extractProductRefs below.
      const allStrings = v.every((x) => typeof x === "string");
      if (allStrings) continue;
      candidates.push(...v);
    }
  }
  const products: OrderProduct[] = [];
  for (const raw of candidates) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const name =
      pickString(p, "name", "item_name", "product_name", "title") ?? "Item";
    const sku = pickString(p, "sku", "barcode", "code");
    const qty = pickNumber(p, "qty", "quantity", "count") ?? 1;
    const price =
      pickNumber(p, "price", "cost", "total", "amount", "item_cost") ?? 0;
    const imageUrl = pickString(p, "image", "image_url", "img", "photo");
    const status = pickString(p, "status", "state");
    const refunded =
      typeof status === "string" && /refund/i.test(status);
    products.push({ name, sku, qty, price, imageUrl, refunded });
  }
  return products;
}

/**
 * For the Vend88 backend, an order's `products` field is typically a parallel
 * array of product-ID strings, with quantities in `qtys`. We surface those as
 * lightweight refs so the modal can resolve names asynchronously.
 */
function extractProductRefs(
  order: OfficialOrderDetail
): { id: string; qty: number }[] {
  const o = order as Record<string, unknown>;
  const raw = o.products;
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const v of raw) {
    if (typeof v === "string" && v.length > 0) ids.push(v);
  }
  if (ids.length === 0) return [];
  const qtys = Array.isArray(o.qtys) ? (o.qtys as unknown[]) : [];
  return ids.map((id, i) => {
    const q = qtys[i];
    const qty =
      typeof q === "number" && Number.isFinite(q) && q > 0 ? Math.round(q) : 1;
    return { id, qty };
  });
}

function extractTransactions(order: OfficialOrderDetail): OrderTransaction[] {
  const list: unknown[] = Array.isArray((order as Record<string, unknown>).transactions)
    ? ((order as Record<string, unknown>).transactions as unknown[])
    : [];
  const out: OrderTransaction[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    out.push({
      id: pickString(t, "transaction_id", "id", "_id", "txn_id"),
      platform: pickString(t, "platform", "method", "payment_platform"),
      type: pickString(t, "type", "transaction_type", "kind"),
      amount: pickNumber(t, "amount", "value", "total", "price"),
      surcharge: pickNumber(t, "surcharge", "fee"),
    });
  }
  return out;
}

function formatOrderTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status?: string }) {
  const { tokens, detailStyles } = useSalesStyles();
  const { t } = useI18n();
  const s = (status ?? "").toLowerCase();
  let bg = tokens.TEXT_DIM + "22";
  let fg = tokens.TEXT_DIM;
  let label = status ?? "—";
  if (/unpaid/.test(s)) {
    bg = tokens.WARNING + "22";
    fg = tokens.WARNING;
    label = "Unpaid";
  } else if (/\bpaid\b|complete|done/.test(s)) {
    bg = tokens.SUCCESS + "22";
    fg = tokens.SUCCESS;
    label = t("sales_status_paid");
  } else if (/refund/.test(s)) {
    bg = tokens.DANGER + "22";
    fg = tokens.DANGER;
    label = t("sales_status_refunded");
  } else if (/cancel|void/.test(s)) {
    bg = tokens.DANGER + "22";
    fg = tokens.DANGER;
    label = status ?? t("sales_status_cancelled");
  } else if (/active|open|pending/.test(s)) {
    bg = tokens.WARNING + "22";
    fg = tokens.WARNING;
    label = t("sales_active");
  }
  return (
    <View style={[detailStyles.pill, { backgroundColor: bg }]}>
      <Text style={[detailStyles.pillText, { color: fg }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  mono,
  emphasis,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  const { detailStyles } = useSalesStyles();
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.rowLabel}>{label}</Text>
      <Text
        style={[
          detailStyles.rowValue,
          mono && detailStyles.rowValueMono,
          emphasis && detailStyles.rowValueEmphasis,
        ]}
        numberOfLines={mono ? 1 : 2}
        ellipsizeMode="middle"
      >
        {value}
      </Text>
    </View>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { detailStyles } = useSalesStyles();
  return (
    <View style={detailStyles.card}>
      <Text style={detailStyles.cardTitle}>{title}</Text>
      <View style={detailStyles.cardBody}>{children}</View>
    </View>
  );
}

function OrderDetailModal({
  sale,
  order,
  loading,
  error,
  onClose,
}: {
  sale: Sale | null;
  order: OfficialOrderDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const { tokens, styles, detailStyles } = useSalesStyles();
  const { t } = useI18n();
  const visible = sale != null;

  const summary = useMemo(() => {
    if (!order) return null;
    const o = order as Record<string, unknown>;
    const orderId = pickString(o, "order_id", "_id") ?? "—";
    const orderNum = pickNumber(o, "order_num");
    const cost = pickNumber(o, "price", "total", "cost") ?? 0;
    const status = pickString(o, "status") ?? "—";
    const method =
      pickString(o, "pick_method", "method", "dine_option") ?? "—";
    const source = pickString(o, "source", "module") ?? "—";
    const discount = pickNumber(o, "discount", "discount_total") ?? 0;
    const rounding = pickNumber(o, "rounding", "rounding_total") ?? 0;
    const tax = pickNumber(o, "tax", "tax_total") ?? 0;
    const holidaySurcharge =
      pickNumber(o, "holiday_surcharge", "holiday_surcharge_pct") ?? 0;
    const guestCount = pickNumber(o, "guest_count", "guests", "people") ?? 0;
    const time = pickString(o, "time", "created_at", "date");
    return {
      orderId,
      orderNum,
      cost,
      status,
      method,
      source,
      discount,
      rounding,
      tax,
      holidaySurcharge,
      guestCount,
      time,
    };
  }, [order]);

  const products = useMemo(
    () => (order ? extractProducts(order) : []),
    [order]
  );
  const productRefs = useMemo(
    () => (order ? extractProductRefs(order) : []),
    [order]
  );
  const transactions = useMemo(
    () => (order ? extractTransactions(order) : []),
    [order]
  );

  const [productNameMap, setProductNameMap] = useState<
    Record<string, { name: string; image?: string; price?: number }>
  >({});
  useEffect(() => {
    if (productRefs.length === 0) {
      setProductNameMap({});
      return;
    }
    let cancelled = false;
    const ids = productRefs.map((r) => r.id);
    fetchOfficialProductDetails(ids)
      .then((map) => {
        if (!cancelled) setProductNameMap(map);
      })
      .catch(() => {
        if (!cancelled) setProductNameMap({});
      });
    return () => {
      cancelled = true;
    };
  }, [productRefs]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={detailStyles.safe} edges={["top"]}>
        <View style={detailStyles.header}>
          <View style={{ flex: 1 }}>
            <Text style={detailStyles.eyebrow}>{t("sales_detail_order_details")}</Text>
            <Text style={detailStyles.title} numberOfLines={1}>
              {sale?.order_id ?? "—"}
            </Text>
            {sale ? (
              <Text style={detailStyles.subtitle}>
                {formatOrderTime(sale.date)}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={t("sales_detail_close")}
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [
              detailStyles.closeBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="close" size={20} color={tokens.TEXT} />
          </Pressable>
        </View>

        {loading ? (
          <View style={detailStyles.loading}>
            <View style={detailStyles.loadingCard}>
              <ShimmerSkeleton width="40%" height={12} radius={3} />
              <View style={{ height: 12 }} />
              <ShimmerSkeleton width="80%" height={20} radius={4} />
              <View style={{ height: 16 }} />
              <ShimmerSkeleton width="100%" height={1} radius={0} />
              <View style={{ height: 16 }} />
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={detailStyles.loadingRow}>
                  <ShimmerSkeleton width="30%" height={12} radius={3} />
                  <ShimmerSkeleton width="40%" height={12} radius={3} />
                </View>
              ))}
            </View>
          </View>
        ) : error ? (
          <View style={detailStyles.errorBox}>
            <Ionicons name="alert-circle-outline" size={32} color={tokens.DANGER} />
            <Text style={detailStyles.errorTitle}>{t("sales_detail_error_title")}</Text>
            <Text style={detailStyles.errorBody}>{error}</Text>
          </View>
        ) : summary ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={detailStyles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero — total + status */}
            <View style={detailStyles.hero}>
              <Text style={detailStyles.heroEyebrow}>{t("sales_detail_total")}</Text>
              <Text style={detailStyles.heroAmount}>
                {formatCurrency(summary.cost, 2)}
              </Text>
              <View style={detailStyles.heroMeta}>
                <StatusPill status={summary.status} />
                {summary.method && summary.method !== "—" ? (
                  <View style={detailStyles.heroChip}>
                    <Ionicons name="bag-outline" size={12} color={tokens.TEXT_DIM} />
                    <Text style={detailStyles.heroChipText}>
                      {summary.method}
                    </Text>
                  </View>
                ) : null}
                {summary.source && summary.source !== "—" ? (
                  <View style={detailStyles.heroChip}>
                    <Ionicons name="terminal-outline" size={12} color={tokens.TEXT_DIM} />
                    <Text style={detailStyles.heroChipText}>
                      {summary.source.toUpperCase()}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Order Summary */}
            <SectionCard title={t("sales_detail_section_summary")}>
              <DetailRow label={t("sales_detail_order_id")} value={summary.orderId} mono />
              {summary.orderNum != null ? (
                <DetailRow
                  label={t("sales_detail_order_number")}
                  value={`#${summary.orderNum}`}
                />
              ) : null}
              <DetailRow
                label={t("sales_detail_cost")}
                value={formatCurrency(summary.cost, 2)}
                emphasis
              />
              <DetailRow label={t("sales_detail_status")} value={summary.status} />
              <DetailRow label={t("sales_detail_method")} value={summary.method} />
              <DetailRow label={t("sales_detail_source")} value={summary.source} />
              <DetailRow
                label={t("sales_detail_discount")}
                value={formatCurrency(summary.discount, 2)}
              />
              <DetailRow
                label={t("sales_detail_rounding")}
                value={formatCurrency(summary.rounding, 2)}
              />
              <DetailRow
                label={t("sales_detail_holiday_surcharge")}
                value={`${summary.holidaySurcharge}%`}
              />
              <DetailRow label={t("sales_detail_tax")} value={formatCurrency(summary.tax, 2)} />
              <DetailRow
                label={t("sales_detail_guest_count")}
                value={String(summary.guestCount)}
              />
              <DetailRow
                label={t("sales_detail_date_of_purchase")}
                value={formatOrderTime(summary.time)}
              />
            </SectionCard>

            {/* Products */}
            {products.length > 0 ? (
              <SectionCard title={t("sales_detail_products", { count: products.length })}>
                {products.map((p, i) => (
                  <View
                    key={i}
                    style={[
                      detailStyles.productRow,
                      i !== products.length - 1 && detailStyles.productRowDivider,
                    ]}
                  >
                    <View style={detailStyles.productThumb}>
                      <Ionicons
                        name="cube-outline"
                        size={20}
                        color={tokens.TEXT_DIM}
                      />
                    </View>
                    <View style={detailStyles.productMid}>
                      <View style={detailStyles.productNameRow}>
                        <Text
                          style={detailStyles.productName}
                          numberOfLines={2}
                        >
                          {p.name}
                        </Text>
                        {p.refunded ? (
                          <View style={detailStyles.refundBadge}>
                            <Text style={detailStyles.refundBadgeText}>
                              {t("sales_detail_refund_badge")}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {p.sku ? (
                        <Text style={detailStyles.productSku} numberOfLines={1}>
                          SKU · {p.sku}
                        </Text>
                      ) : null}
                    </View>
                    <View style={detailStyles.productRight}>
                      <Text style={detailStyles.productPrice}>
                        {formatCurrency(p.price, 2)}
                      </Text>
                      <Text style={detailStyles.productQty}>×{p.qty}</Text>
                    </View>
                  </View>
                ))}
              </SectionCard>
            ) : productRefs.length > 0 ? (
              <SectionCard title={t("sales_detail_products", { count: productRefs.length })}>
                {productRefs.map((ref, i) => {
                  const detail = productNameMap[ref.id];
                  const name =
                    detail?.name ??
                    `Item ${ref.id.slice(-6).toUpperCase()}`;
                  const resolved = !!detail?.name;
                  const initial = (detail?.name ?? "?")
                    .trim()
                    .charAt(0)
                    .toUpperCase();
                  return (
                    <View
                      key={`${ref.id}-${i}`}
                      style={[
                        detailStyles.productRow,
                        i !== productRefs.length - 1 &&
                          detailStyles.productRowDivider,
                      ]}
                    >
                      <View style={detailStyles.productThumb}>
                        {detail?.image ? (
                          <Image
                            source={{ uri: detail.image }}
                            style={detailStyles.productThumbImage}
                            resizeMode="cover"
                          />
                        ) : resolved ? (
                          <Text style={detailStyles.productThumbInitial}>
                            {initial}
                          </Text>
                        ) : (
                          <Ionicons
                            name="cube-outline"
                            size={20}
                            color={tokens.TEXT_DIM}
                          />
                        )}
                      </View>
                      <View style={detailStyles.productMid}>
                        {resolved ? (
                          <Text
                            style={detailStyles.productName}
                            numberOfLines={2}
                          >
                            {name}
                          </Text>
                        ) : (
                          <ShimmerSkeleton
                            width="70%"
                            height={13}
                            radius={3}
                          />
                        )}
                        <Text style={detailStyles.productSku} numberOfLines={1}>
                          ID · {ref.id.slice(-8).toUpperCase()}
                        </Text>
                      </View>
                      <View style={detailStyles.productRight}>
                        {detail?.price != null ? (
                          <>
                            <Text style={detailStyles.productPrice}>
                              {formatCurrency(detail.price * ref.qty, 2)}
                            </Text>
                            <Text style={detailStyles.productQty}>
                              {ref.qty > 1
                                ? `${formatCurrency(detail.price, 2)} × ${ref.qty}`
                                : `×${ref.qty}`}
                            </Text>
                          </>
                        ) : (
                          <Text style={detailStyles.productQty}>×{ref.qty}</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </SectionCard>
            ) : null}

            {/* Transactions */}
            {transactions.length > 0 ? (
              <SectionCard title={t("sales_detail_transactions")}>
                {transactions.map((tx, i) => {
                  const isRefund = /refund/i.test(tx.type ?? "");
                  return (
                    <View
                      key={i}
                      style={[
                        detailStyles.txnDetailRow,
                        i !== transactions.length - 1 &&
                          detailStyles.txnDetailRowDivider,
                      ]}
                    >
                      <View style={detailStyles.txnDetailHead}>
                        <View
                          style={[
                            detailStyles.txnDetailDot,
                            {
                              backgroundColor: isRefund ? tokens.DANGER : tokens.SUCCESS,
                            },
                          ]}
                        />
                        <Text style={detailStyles.txnDetailType}>
                          {(tx.type ?? t("sales_detail_payment_label")).toUpperCase()}
                        </Text>
                        {tx.platform ? (
                          <Text style={detailStyles.txnDetailPlatform}>
                            · {tx.platform}
                          </Text>
                        ) : null}
                      </View>
                      {tx.id ? (
                        <Text
                          style={detailStyles.txnDetailId}
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          {tx.id}
                        </Text>
                      ) : null}
                      <View style={detailStyles.txnDetailAmounts}>
                        <Text
                          style={[
                            detailStyles.txnDetailAmount,
                            isRefund && { color: tokens.DANGER },
                          ]}
                        >
                          {isRefund ? "−" : ""}
                          {formatCurrency(tx.amount ?? 0, 2)}
                        </Text>
                        {tx.surcharge != null && tx.surcharge > 0 ? (
                          <Text style={detailStyles.txnDetailSurcharge}>
                            {t("sales_detail_fee_suffix", { amount: formatCurrency(tx.surcharge, 2) })}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </SectionCard>
            ) : null}

            <View style={{ height: 24 }} />
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const makeDetailStyles = (t: ThemeTokens) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: t.BG },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 24,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
    color: t.TEXT_FAINT,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: t.TEXT,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  subtitle: { fontSize: 12, color: t.TEXT_DIM, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  content: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 14,
  },
  hero: {
    backgroundColor: t.CARD,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    padding: 18,
    gap: 8,
  },
  heroEyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
    color: t.TEXT_FAINT,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: "800",
    color: t.TEXT,
    letterSpacing: -0.8,
  },
  heroMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: t.BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  heroChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: t.TEXT_DIM,
    letterSpacing: 0.3,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  card: {
    backgroundColor: t.CARD,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    overflow: "hidden",
  },
  cardTitle: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
    color: t.TEXT_FAINT,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    textTransform: "uppercase",
  },
  cardBody: { paddingHorizontal: 16, paddingBottom: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER + "55",
  },
  rowLabel: { fontSize: 12, color: t.TEXT_DIM, fontWeight: "500" },
  rowValue: {
    fontSize: 13,
    color: t.TEXT,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  rowValueMono: { fontFamily: "Menlo", fontSize: 11, color: t.TEXT_DIM },
  rowValueEmphasis: { fontSize: 14, fontWeight: "800", letterSpacing: -0.2 },

  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  productRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER + "55",
  },
  productThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: t.BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  productThumbImage: { width: "100%", height: "100%" },
  productThumbInitial: {
    fontSize: 18,
    fontWeight: "800",
    color: t.GOLD,
    letterSpacing: -0.4,
  },
  productMid: { flex: 1, gap: 4 },
  productNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  productName: {
    fontSize: 13,
    color: t.TEXT,
    fontWeight: "700",
    flexShrink: 1,
  },
  refundBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: t.DANGER + "22",
  },
  refundBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: t.DANGER,
    letterSpacing: 0.5,
  },
  productSku: { fontSize: 11, color: t.TEXT_DIM, fontWeight: "500" },
  productRight: { alignItems: "flex-end", gap: 2 },
  productPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: t.TEXT,
    letterSpacing: -0.2,
  },
  productQty: { fontSize: 11, color: t.TEXT_DIM, fontWeight: "600" },

  txnDetailRow: { paddingVertical: 12, gap: 6 },
  txnDetailRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER + "55",
  },
  txnDetailHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  txnDetailDot: { width: 6, height: 6, borderRadius: 3 },
  txnDetailType: {
    fontSize: 11,
    fontWeight: "800",
    color: t.TEXT,
    letterSpacing: 1,
  },
  txnDetailPlatform: {
    fontSize: 11,
    color: t.TEXT_DIM,
    fontWeight: "600",
  },
  txnDetailId: {
    fontSize: 11,
    color: t.TEXT_DIM,
    fontFamily: "Menlo",
  },
  txnDetailAmounts: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 2,
  },
  txnDetailAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: t.TEXT,
    letterSpacing: -0.3,
  },
  txnDetailSurcharge: { fontSize: 11, color: t.TEXT_DIM, fontWeight: "600" },

  loading: {
    flex: 1,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 16,
  },
  loadingCard: {
    backgroundColor: t.CARD,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    padding: 18,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },

  errorBox: {
    margin: SCREEN_PADDING,
    backgroundColor: t.CARD,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: t.TEXT,
    marginTop: 4,
  },
  errorBody: {
    fontSize: 12,
    color: t.TEXT_DIM,
    textAlign: "center",
    lineHeight: 18,
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SalesScreen() {
  const { tokens, styles, skelStyles, detailStyles } = useSalesStyles();
  const { email, token, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const { online } = useNetwork();
  const params = useLocalSearchParams<{
    openTodayTxn?: string;
    openWeekTxn?: string;
    intentId?: string;
  }>();
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [chart, setChart] = useState<{ day: string; revenue: number }[]>([]);
  const [officialPeriodStat, setOfficialPeriodStat] = useState<PeriodSummary | null>(null);
  const [officialStats, setOfficialStats] = useState<OfficialStoreStatisticsRange | null>(null);
  const [officialItemsSold, setOfficialItemsSold] = useState<number | null>(null);
  const [topItems, setTopItems] = useState<DashboardTopItem[] | null>(null);
  const [topItemsExpanded, setTopItemsExpanded] = useState(false);
  const [topProductDetailImages, setTopProductDetailImages] = useState<
    Record<string, string>
  >({});
  // Persistent image library learned from any successful /pos/dashboard fetch
  // (any period). Today's /pos/dashboard call often returns nothing, so we
  // reuse images learned during week/month fetches keyed by product name.
  const topImageLibraryRef = useRef<{
    byName: Map<string, string>;
    byNormalized: Map<string, string>;
    normalizedAmbiguous: Set<string>;
  }>({
    byName: new Map(),
    byNormalized: new Map(),
    normalizedAmbiguous: new Set(),
  });
  // Bumped whenever the image library learns new entries so memos recompute.
  const [topImageLibraryRev, setTopImageLibraryRev] = useState(0);
  const [revenueChangePct, setRevenueChangePct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [period, setPeriod] = useState<Period>("this_week");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_STATUS_FILTER);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date>(() => weekStart(new Date()));
  const [selectedMonthStart, setSelectedMonthStart] = useState<Date>(() => monthStart(new Date()));
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<null | "csv" | "pdf">(null);
  const [exportToast, setExportToast] = useState<string | null>(null);
  // Default to OFF — including transactions can require a full sales fetch
  // (potentially slow). Users opt in explicitly when they want it.
  const [exportIncludeTxn, setExportIncludeTxn] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("pdf");
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);
  const [shopDisplayName, setShopDisplayName] = useState<string | null>(null);

  // Preload the brand logo as a base64 data URI so PDFs render it offline.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const asset = Asset.fromModule(
          require("../../assets/images/splash-icon.png")
        );
        await asset.downloadAsync();
        const localUri = asset.localUri ?? asset.uri;
        if (!localUri) return;
        const file = new File(localUri);
        const b64 = await file.base64();
        if (!cancelled && b64) setLogoDataUri(`data:image/png;base64,${b64}`);
      } catch (err) {
        console.log("[sales-export] failed to load logo:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the active shop's display name for export headers.
  useEffect(() => {
    if (API_TARGET !== "official") return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await fetchOfficialShopDetail();
        if (cancelled) return;
        const name = detail?.store_name?.trim() || detail?.name?.trim() || null;
        if (name) setShopDisplayName(name);
      } catch (err) {
        console.log("[sales-export] failed to load shop name:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [allTxnOpen, setAllTxnOpen] = useState(false);
  // Sales history (per-order details) is loaded lazily — only when the user
  // opens the All Transactions modal. `txnLoadedKey` marks the bounds the
  // currently held `sales` array belongs to so we re-fetch on period change.
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnLoadedKey, setTxnLoadedKey] = useState<string | null>(null);
  // Order-detail sheet (opens when a transaction row is tapped).
  const [detailSale, setDetailSale] = useState<Sale | null>(null);
  const [detailOrder, setDetailOrder] = useState<OfficialOrderDetail | null>(
    null
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const consumedIntentRef = useRef<string | null>(null);
  const intentOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);

  const periodLabel = useCallback(
    (p: Period): string => {
      switch (p) {
        case "today":
          return t("sales_today");
        case "this_week":
          return t("sales_week");
        case "this_month":
          return t("sales_month");
        case "custom":
        default:
          return t("sales_custom");
      }
    },
    [t]
  );

  const translateStatusLabel = useCallback(
    (raw: string | undefined, fallback: string): string => {
      const s = (raw ?? "").toLowerCase();
      if (/paid|complete|done/.test(s)) return t("sales_status_paid");
      if (/refund/.test(s)) return t("sales_status_refunded");
      if (/cancel|void/.test(s)) return t("sales_status_cancelled");
      if (/active|open|pending/.test(s)) return t("sales_active");
      return fallback;
    },
    [t]
  );
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

        if (p === "custom") {
          // Custom range is set via the picker; ignore swipe nav.
          return;
        }
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
        selectedMonthStart,
        customStart,
        customEnd
      ),
    [period, selectedDate, selectedWeekStart, selectedMonthStart, customStart, customEnd]
  );

  const txnPeriodKey = useMemo(
    () =>
      `${selectedBounds.start.getTime()}-${selectedBounds.endInclusive.getTime()}`,
    [selectedBounds]
  );
  const txnFetchInFlightKeyRef = useRef<string | null>(null);
  const txnAbortControllerRef = useRef<AbortController | null>(null);

  // Reset cached sales-history when the selected period changes so the modal
  // re-fetches the correct range the next time it's opened. We deliberately
  // do NOT clear `sales` when the modal merely closes/reopens for the same
  // period — that would force a re-fetch every time the user revisits.
  const lastTxnPeriodKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastTxnPeriodKey.current === txnPeriodKey) return;
    // Cancel any in-flight fetch for the previous period so it doesn't keep
    // `txnLoading` locked and block background warmup for the new period.
    txnAbortControllerRef.current?.abort();
    txnAbortControllerRef.current = null;
    lastTxnPeriodKey.current = txnPeriodKey;
    txnFetchInFlightKeyRef.current = null;
    setTxnLoading(false);
    setTxnLoadedKey(null);
    setSales([]);
  }, [txnPeriodKey]);

  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    if (txnFetchInFlightKeyRef.current === txnPeriodKey) {
      return;
    }
    txnFetchInFlightKeyRef.current = txnPeriodKey;
    const fetchKey = txnPeriodKey;
    const localController = signal ? null : new AbortController();
    const activeSignal = signal ?? localController?.signal;
    if (localController) {
      txnAbortControllerRef.current = localController;
    }
    setTxnLoading(true);
    try {
      const history = await fetchOfficialSalesHistory(
        selectedBounds.start,
        selectedBounds.endInclusive,
        { email, token },
        activeSignal,
        (progress) => {
          if (activeSignal?.aborted || lastTxnPeriodKey.current !== fetchKey) return;
          const mappedSales: Sale[] = progress.rows.map((sale) => ({
            id: sale.id,
            rawId: sale.rawId,
            date: sale.date,
            order_id: sale.order_id,
            items: sale.items,
            module: sale.module,
            payment: sale.payment,
            total: sale.total,
            rawStatus: sale.rawStatus,
            status: sale.status,
          }));
          setSales(mappedSales);
          setSummary(buildSalesSummary(mappedSales));
        }
      );

      if (activeSignal?.aborted) return;

      const mappedSales: Sale[] = history.map((sale) => ({
        id: sale.id,
        rawId: sale.rawId,
        date: sale.date,
        order_id: sale.order_id,
        items: sale.items,
        module: sale.module,
        payment: sale.payment,
        total: sale.total,
        rawStatus: sale.rawStatus,
        status: sale.status,
      }));
      setSales(mappedSales);
      setSummary(buildSalesSummary(mappedSales));
      setTxnLoadedKey(fetchKey);
      setLoadError(false);

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
    } catch {
      if (activeSignal?.aborted) return;
      // Preserve previously loaded sales/summary/chart so the user still sees
      // the last-known values when the network drops. Flip the error flag so
      // the UI can surface a notice when there is genuinely nothing to show.
      setLoadError(true);
    } finally {
      if (txnAbortControllerRef.current === localController) {
        txnAbortControllerRef.current = null;
      }
      const shouldClearLoading =
        txnFetchInFlightKeyRef.current === fetchKey ||
        txnFetchInFlightKeyRef.current === null;
      if (txnFetchInFlightKeyRef.current === fetchKey) {
        txnFetchInFlightKeyRef.current = null;
      }
      if (shouldClearLoading) {
        setTxnLoading(false);
      }
    }
  }, [email, token, selectedBounds, txnPeriodKey]);

  // Deep-link intent from Dashboard Recent Orders: land on the selected
  // period first, then open the transactions sheet shortly after so users
  // see the weekly sales page transition before the modal appears.
  useEffect(() => {
    const wantsWeek = params.openWeekTxn === "1";
    const wantsLegacyToday = params.openTodayTxn === "1";
    if (!wantsWeek && !wantsLegacyToday) return;

    const intentKey = `${wantsWeek ? "week" : "today"}:${params.intentId ?? "default"}`;
    if (consumedIntentRef.current === intentKey) return;
    consumedIntentRef.current = intentKey;

    if (wantsWeek) {
      setPeriod("this_week");
      setSelectedWeekStart(weekStart(new Date()));
    } else {
      // Backward compatibility for older in-app links.
      setPeriod("today");
      setSelectedDate(startOfDay(new Date()));
    }
    setStatusFilter(ALL_STATUS_FILTER);
    setSearch("");

    if (intentOpenTimerRef.current) {
      clearTimeout(intentOpenTimerRef.current);
      intentOpenTimerRef.current = null;
    }

    intentOpenTimerRef.current = setTimeout(() => {
      setAllTxnOpen(true);
      intentOpenTimerRef.current = null;
    }, 420);

    return () => {
      if (intentOpenTimerRef.current) {
        clearTimeout(intentOpenTimerRef.current);
        intentOpenTimerRef.current = null;
      }
    };
  }, [params.openWeekTxn, params.openTodayTxn, params.intentId]);

  // When the modal is opened (manually or via deep-link), ensure the
  // transaction rows for the active period are loaded.
  useEffect(() => {
    if (!allTxnOpen) return;
    if (txnLoading || txnLoadedKey === txnPeriodKey) return;
    void fetchAll();
  }, [allTxnOpen, txnLoading, txnLoadedKey, txnPeriodKey, fetchAll]);

  // Warm transactions in the background once summary data has settled for the
  // active period, so opening the Transactions sheet feels instant.
  useEffect(() => {
    if (authLoading) return;
    if (loading || isFetching) return;
    if (txnLoading || txnLoadedKey === txnPeriodKey) return;
    void fetchAll();
  }, [
    authLoading,
    loading,
    isFetching,
    txnLoading,
    txnLoadedKey,
    txnPeriodKey,
    fetchAll,
  ]);

  const onRefresh = async () => {
    haptic.light();
    setRefreshing(true);
    setIsFetching(true);
    if (API_TARGET === "official") {
      invalidateOfficialDashboardCaches();
    }
    try {
      // Bump the refresh sentinel so the storeStatistics effect re-runs and
      // re-fetches the full snapshot (including abnormal transactions, payment
      // mix, dining mode, etc.) against the now-empty cache.
      setRefreshKey((k) => k + 1);
      // Also re-fetch sales history if the user has already opened it once
      // for this period.
      const tasks: Promise<unknown>[] = [];
      if (txnLoadedKey) {
        tasks.push(fetchAll());
      }
      await Promise.all(tasks);
      haptic.success();
    } finally {
      setRefreshing(false);
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (API_TARGET !== "official") {
      setOfficialPeriodStat(null);
      setOfficialStats(null);
      setOfficialItemsSold(null);
      setTopItems(null);
      setRevenueChangePct(null);
      return;
    }
    if (authLoading) {
      return;
    }

    let cancelled = false;
    setIsFetching(true);
    (async () => {
      try {
        const previousBounds = getPreviousComparisonBounds(selectedBounds, period);
        const [stats, previousStats, itemsSold] = await Promise.all([
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
          fetchOfficialBusinessItemsSoldRange(
            selectedBounds.start,
            selectedBounds.endInclusive,
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
        setOfficialItemsSold(itemsSold);
        setRevenueChangePct(
          calcRevenueChangePct(stats.revenue, previousStats.revenue)
        );
        setLoadError(false);      } catch (err) {
        console.log("[sales-period] storeStatistics fetch failed:", err);
        if (!cancelled) {
          // Keep prior officialStats/officialPeriodStat/officialItemsSold so
          // the dashboard still renders the most recent values during a
          // network outage. Only flip the error flag so we can show a notice
          // when there is no cached data at all.
          setLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsFetching(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, email, token, selectedBounds, period, refreshKey]);

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

  // Stacked-bar growth animation — segments interpolate width from 0% → pct%
  // on every fresh `officialStats`. Driven on the JS thread because width is
  // a layout prop and not bridgeable via useNativeDriver.
  const barAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!officialStats) return;
    barAnim.setValue(0);
    const id = requestAnimationFrame(() => {
      Animated.timing(barAnim, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });
    return () => cancelAnimationFrame(id);
  }, [officialStats, barAnim]);

  // Top selling items for the active period — surfaced as its own card
  // between Revenue by Module and Abnormal Transactions.
  useEffect(() => {
    if (API_TARGET !== "official" || authLoading) return;
    const topPeriod: "today" | "week" | "month" =
      period === "today"
        ? "today"
        : period === "this_week"
        ? "week"
        : "month";
    let cancelled = false;
    (async () => {
      try {
        const items = await fetchOfficialTopSellingItems(5, topPeriod, {
          email,
          token,
        });
        if (!cancelled) setTopItems(items);
      } catch (err) {
        console.log("[sales-period] top items fetch failed:", err);
        if (!cancelled) setTopItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, email, token, period, selectedBounds, refreshKey]);

  // Seed the image library from the month period in the background so Today
  // can render thumbnails even when /pos/dashboard returns no data for it.
  useEffect(() => {
    if (API_TARGET !== "official" || authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await fetchOfficialTopSellingItems(20, "month", {
          email,
          token,
        });
        if (cancelled || !Array.isArray(items) || items.length === 0) return;
        ingestTopImageLibrary(items);
      } catch (err) {
        // Non-fatal — the active-period fetch may still populate images.
        console.log("[sales-period] top items image seed failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, email, token, refreshKey]);

  // Whenever the active-period top items arrive with image URLs, ingest them
  // into the persistent image library so future periods (notably Today) can
  // reuse those mappings.
  useEffect(() => {
    if (!topItems || topItems.length === 0) return;
    ingestTopImageLibrary(topItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topItems]);

  // Resolve images by product id from storeStatistics top_products so Today
  // can render the same thumbnails even when names differ slightly.
  useEffect(() => {
    if (API_TARGET !== "official" || authLoading) return;
    const ids = Array.from(
      new Set(
        (officialStats?.topProducts ?? [])
          .map((p) => (typeof p.id === "string" ? p.id.trim() : ""))
          .filter((id): id is string => id.length > 0)
      )
    );
    if (ids.length === 0) {
      setTopProductDetailImages({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const details = await fetchOfficialProductDetails(ids, { email, token });
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const id of ids) {
          const image = details[id]?.image;
          if (typeof image === "string" && image.trim().length > 0) {
            next[id] = image;
          }
        }
        setTopProductDetailImages(next);
      } catch (err) {
        console.log("[sales-period] top product detail image fetch failed:", err);
        if (!cancelled) setTopProductDetailImages({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, email, token, officialStats, period, selectedBounds, refreshKey]);

  const normalizeTopItemName = useCallback((value: string): string => {
    return value
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  const ingestTopImageLibrary = useCallback(
    (items: DashboardTopItem[]) => {
      const lib = topImageLibraryRef.current;
      let added = false;
      for (const it of items) {
        if (!it?.image || !it?.name) continue;
        if (!lib.byName.has(it.name)) {
          lib.byName.set(it.name, it.image);
          added = true;
        }
        const normalized = normalizeTopItemName(it.name);
        if (!normalized) continue;
        if (lib.normalizedAmbiguous.has(normalized)) continue;
        const existing = lib.byNormalized.get(normalized);
        if (!existing) {
          lib.byNormalized.set(normalized, it.image);
          added = true;
        } else if (existing !== it.image) {
          // Conflicting images for same normalized name — drop to avoid
          // assigning the wrong thumbnail.
          lib.byNormalized.delete(normalized);
          lib.normalizedAmbiguous.add(normalized);
          added = true;
        }
      }
      if (added) setTopImageLibraryRev((r) => r + 1);
    },
    [normalizeTopItemName]
  );

  // Prefer top items derived from /dashboard/storeStatistics (same source
  // as the Statement card) so the list stays consistent with the headline
  // revenue figures. Image URLs are resolved via the persistent image library
  // populated by /pos/dashboard fetches across all periods.
  const displayTopItems = useMemo<DashboardTopItem[] | null>(() => {
    const fromStats = officialStats?.topProducts ?? null;
    const lib = topImageLibraryRef.current;
    const imagesByName = lib.byName;
    const imagesByNormalizedName = lib.byNormalized;
    const ambiguousNormalizedNames = lib.normalizedAmbiguous;
    if (officialStats) {
      return (fromStats ?? [])
        .slice()
        .sort((a, b) => b.total - a.total)
        .map((p, i) => {
          const normalized = normalizeTopItemName(p.name);
          const normalizedImage =
            normalized && !ambiguousNormalizedNames.has(normalized)
              ? imagesByNormalizedName.get(normalized)
              : undefined;
          const byId =
            typeof p.id === "string" && p.id.trim().length > 0
              ? topProductDetailImages[p.id.trim()]
              : undefined;
          return {
            id: p.id ? `stat:${p.id}` : `stat:${p.name}:${i}`,
            name: p.name,
            units: Math.round(p.qty),
            revenue: String(p.total),
            image: byId ?? imagesByName.get(p.name) ?? normalizedImage,
          };
        });
    }
    return topItems;
  }, [
    officialStats,
    topItems,
    topProductDetailImages,
    topImageLibraryRev,
    normalizeTopItemName,
  ]);

  const fallbackStat = useMemo(
    () => buildPeriodSummary(sales, selectedBounds.start, selectedBounds.endExclusive),
    [sales, selectedBounds]
  );
  const previousBounds = useMemo(
    () => getPreviousComparisonBounds(selectedBounds, period),
    [selectedBounds, period]
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
      : summary && period !== "custom"
      ? summary[period]
      : fallbackStat;
  const revenueChange =
    API_TARGET === "official"
      ? revenueChangePct ?? fallbackRevenueChange
      : fallbackRevenueChange;
  const revenueChangeUp = revenueChange >= 0;
  const revenueChangeTone = revenueChange > 0 ? tokens.SUCCESS : revenueChange < 0 ? tokens.DANGER : tokens.TEXT_DIM;

  // Filter + group transactions
  const {
    sections,
    totalFiltered,
    paymentBreakdown,
    statusCounts,
    statusTabs,
    moduleBreakdown,
    periodItemsSold,
  } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = sales.filter((s) => {
      const d = parseDate(s.date);
      if (!isInPeriod(d, period, selectedDate, selectedWeekStart, selectedMonthStart, customStart, customEnd)) return false;
      if (statusFilter !== ALL_STATUS_FILTER) {
        const statusKey = getTransactionStatusKey(s.rawStatus ?? s.status);
        if (statusKey !== statusFilter) return false;
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
      return isInPeriod(d, period, selectedDate, selectedWeekStart, selectedMonthStart, customStart, customEnd);
    });

    // Status counts (within current period + search, before status filter)
    const periodMatched = sales.filter((s) => {
      const d = parseDate(s.date);
      if (!isInPeriod(d, period, selectedDate, selectedWeekStart, selectedMonthStart, customStart, customEnd)) return false;
      if (q) {
        const hay = `${s.order_id} ${s.module} ${s.payment}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const counts: Record<string, number> = {
      [ALL_STATUS_FILTER]: periodMatched.length,
    };
    const labels: Record<string, string> = {
      [ALL_STATUS_FILTER]: "All",
    };
    const orderedStatusKeys: string[] = [];
    for (const sale of periodMatched) {
      const statusKey = getTransactionStatusKey(sale.rawStatus ?? sale.status);
      counts[statusKey] = (counts[statusKey] ?? 0) + 1;
      if (!labels[statusKey]) {
        labels[statusKey] = getTransactionStatusMeta(sale.rawStatus ?? sale.status).label;
      }
      if (!orderedStatusKeys.includes(statusKey)) {
        orderedStatusKeys.push(statusKey);
      }
    }
    const tabs = [
      { key: ALL_STATUS_FILTER, label: "All", count: counts[ALL_STATUS_FILTER] ?? 0 },
      ...orderedStatusKeys.map((key) => ({
        key,
        label: labels[key],
        count: counts[key] ?? 0,
      })),
    ];
    const itemsSold = periodOnly.reduce(
      (sum, s) => sum + (Number.isFinite(s.items) ? s.items : 0),
      0
    );

    // Group by day
    const groups = new Map<string, { title: string; date: Date; items: Sale[] }>();
    for (const s of filtered) {
      const d = parseDate(s.date);
      const key = dayKey(d);
      const g = groups.get(key) ?? { title: relativeDayLabel(d, t), date: d, items: [] };
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
      statusTabs: tabs,
      moduleBreakdown: moduleArr,
      periodItemsSold: itemsSold,
    };
  }, [
    customEnd,
    customStart,
    period,
    sales,
    search,
    selectedDate,
    selectedMonthStart,
    selectedWeekStart,
    statusFilter,
    t,
  ]);

  useEffect(() => {
    if (statusFilter === ALL_STATUS_FILTER) return;
    if (!statusTabs.some((tab) => tab.key === statusFilter)) {
      setStatusFilter(ALL_STATUS_FILTER);
    }
  }, [statusFilter, statusTabs]);

  const activeStatusLabel =
    statusTabs.find((tab) => tab.key === statusFilter)?.label ?? "All";

  const itemsSoldKpi =
    API_TARGET === "official" ? officialItemsSold ?? periodItemsSold : periodItemsSold;

  // For the official API, the per-period storeStatistics breakdown is the
  // authoritative source for payment-mix and module (channel) revenue and is
  // available across all periods (today / week / month). The sales-history
  // derived fallbacks above only populate when /search/order_search returns
  // rows for the period, which can be empty for today/month even when the
  // statistics endpoint has data — so prefer the stats-derived breakdowns.
  const displayPaymentBreakdown = useMemo(() => {
    if (API_TARGET === "official" && officialStats) {
      // Merge raw keys that normalise to the same display label (e.g. "card"
      // and "eftpos" both map to "Card") so the legend doesn't render two
      // entries — and React doesn't see duplicate keys.
      const merged = new Map<string, number>();
      for (const [rawName, value] of Object.entries(officialStats.paymentMethod)) {
        if (!(value > 0)) continue;
        const label = mapPaymentLabel(rawName);
        merged.set(label, (merged.get(label) ?? 0) + value);
      }
      const total = Array.from(merged.values()).reduce((s, v) => s + v, 0) || 1;
      return Array.from(merged.entries())
        .map(([name, value]) => ({
          name,
          value,
          pct: (value / total) * 100,
        }))
        .sort((a, b) => b.value - a.value);
    }
    return paymentBreakdown;
  }, [officialStats, paymentBreakdown]);

  const displayModuleBreakdown = useMemo<ModuleStat[]>(() => {
    if (API_TARGET === "official" && officialStats) {
      // Same dedupe as above — multiple raw channels (e.g. "pos", "table")
      // collapse to one display module ("POS").
      const merged = new Map<string, number>();
      for (const [rawName, value] of Object.entries(officialStats.channel)) {
        if (!(value > 0)) continue;
        const label = mapModuleLabel(rawName);
        merged.set(label, (merged.get(label) ?? 0) + value);
      }
      if (merged.size > 0) {
        const total = Array.from(merged.values()).reduce((s, v) => s + v, 0) || 1;
        return Array.from(merged.entries())
          .map(([module, value]) => ({
            module,
            revenue: value,
            orders: 0,
            pct: (value / total) * 100,
          }))
          .sort((a, b) => b.revenue - a.revenue);
      }
    }
    return moduleBreakdown;
  }, [officialStats, moduleBreakdown]);

  // The Transactions section on the report page surfaces a single CTA that
  // opens the full list in a separate page. Keeping the inline section empty
  // keeps the report scannable and avoids visual duplication with the modal.

  // Human-readable label for the active period — used in the modal header.
  const allTxnPeriodLabel = useMemo(() => {
    if (period === "today") {
      return selectedDate.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
    if (period === "this_week") {
      const end = addDays(selectedWeekStart, 6);
      const sameMonth = selectedWeekStart.getMonth() === end.getMonth();
      const startStr = selectedWeekStart.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      const endStr = end.toLocaleDateString(undefined, {
        month: sameMonth ? undefined : "short",
        day: "numeric",
      });
      return `${startStr} – ${endStr}`;
    }
    if (period === "this_month") {
      return selectedMonthStart.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
    }
    if (customStart && customEnd) {
      const sameYear = customStart.getFullYear() === customEnd.getFullYear();
      const startStr = customStart.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: sameYear ? undefined : "numeric",
      });
      const endStr = customEnd.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return `${startStr} – ${endStr}`;
    }
    return periodLabel(period);
  }, [period, selectedDate, selectedWeekStart, selectedMonthStart, customStart, customEnd, periodLabel]);

  const openOrderDetail = useCallback(
    async (sale: Sale) => {
      setDetailSale(sale);
      setDetailOrder(null);
      setDetailError(null);
      const rawId = sale.rawId;
      if (!rawId) {
        setDetailError(t("sales_detail_unavailable"));
        setDetailLoading(false);
        return;
      }
      setDetailLoading(true);
      try {
        const data = await fetchOfficialOrderDetail(rawId, { email, token });
        if (!data) {
          setDetailError(t("sales_detail_load_error"));
        } else {
          setDetailOrder(data);
        }
      } catch {
        setDetailError(t("sales_detail_load_error"));
      } finally {
        setDetailLoading(false);
      }
    },
    [email, token, t]
  );

  const closeOrderDetail = useCallback(() => {
    setDetailSale(null);
    setDetailOrder(null);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  const renderTxnItem = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: Sale;
      index: number;
      section: { data: Sale[] };
    }) => {
      const d = parseDate(item.date);
      const payIcon = PAYMENT_ICONS[item.payment] ?? "card-outline";
      const payColor = getPaymentColor(item.payment);
      const isLastInSection = index === section.data.length - 1;
      const statusMeta = getTransactionStatusMeta(item.rawStatus ?? item.status);
      const statusLabel = statusMeta.label;
      const txnTotal = parseMoney(item.total);
      return (
        <Pressable
          accessibilityLabel={`${item.order_id}, ${statusLabel}, ${formatCurrency(txnTotal, 2)}`}
          onPress={() => {
            haptic.light();
            openOrderDetail(item);
          }}
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
                  {
                    backgroundColor:
                      (MODULE_COLORS[item.module] ?? MODULE_UNKNOWN_COLOR) + "1f",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modTagText,
                    { color: MODULE_COLORS[item.module] ?? MODULE_UNKNOWN_COLOR },
                  ]}
                >
                  {item.module}
                </Text>
              </View>
            </View>
            <Text style={styles.txnSub} numberOfLines={1}>
              {formatTime(d)} · {item.items} {itemNoun(item.items, t)} · {item.payment}
            </Text>
          </View>

          <View style={styles.txnRight}>
            <Text style={styles.txnTotal}>{formatCurrency(txnTotal, 2)}</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                    { backgroundColor: statusMeta.color },
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                    { color: statusMeta.color },
                ]}
              >
                  {statusLabel}
              </Text>
            </View>
          </View>
        </Pressable>
      );
    },
    [openOrderDetail, t]
  );

  const renderTxnHeader = useCallback(
    ({ section }: { section: { title: string; total: number } }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{section.title}</Text>
        <AnimatedNumber
          value={section.total}
          style={styles.sectionHeaderTotal}
          prefix="$"
          decimals={2}
          duration={520}
        />
      </View>
    ),
    []
  );

  // ─── Export (CSV / PDF / Copy) ────────────────────────────────────────────
  const exportFileBase = useMemo(() => {
    const slug = allTxnPeriodLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return `vend88-sales-${slug || period}`;
  }, [allTxnPeriodLabel, period]);

  const exportRows = useMemo(() => {
    const rows: Sale[] = [];
    for (const section of sections) {
      for (const sale of section.data) rows.push(sale);
    }
    return rows;
  }, [sections]);

  const csvEscape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const buildCsv = useCallback(() => {
    const lines: string[] = [];
    const row = (...cells: unknown[]) => lines.push(cells.map(csvEscape).join(","));
    const blank = () => lines.push("");
    const money = (n: number) => n.toFixed(2);

    // Header
    row("Vend88 Sales Report");
    if (shopDisplayName) row("Store", shopDisplayName);
    row("Period", allTxnPeriodLabel);
    row("Generated", new Date().toLocaleString());
    blank();

    // KPIs
    row("Summary");
    row("Revenue", money(parseMoney(stat.revenue)));
    row("Orders", stat.orders);
    row("Average order", money(parseMoney(stat.avg)));
    blank();

    // Statement
    if (officialStats) {
      const f = officialStats.financial;
      const o = officialStats.operational;
      row("Statement");
      row("Label", "Amount");
      row("Total Orders", o.totalOrders);
      row("Gross Sales", money(f.grossSales));
      row("  Item Sales", money(f.totalItemSale));
      row("  Credit Recharge", money(f.totalCreditAdded));
      row("  Member Credit", money(-f.totalCreditUsage));
      row("  Rounding", money(f.totalRounding));
      row("Discounts", money(-f.totalDiscount));
      row(`Refunds (${o.refundCount})`, money(-f.totalRefunds));
      row("Holiday Surcharge", money(f.totalExtraCharge));
      row("Payment Surcharge", money(f.totalSurcharge));
      if (f.totalTax > 0) row("Tax", money(f.totalTax));
      row("Total Revenue", money(f.totalRevenue));

      const diningEntries = Object.entries(officialStats.diningMode).sort(
        (a, b) => b[1] - a[1]
      );
      if (diningEntries.length) {
        blank();
        row("Dining Mode");
        row("Type", "Amount");
        for (const [n, v] of diningEntries) row(n, money(v));
      }
      const paymentEntries = Object.entries(officialStats.paymentMethod).sort(
        (a, b) => b[1] - a[1]
      );
      if (paymentEntries.length) {
        blank();
        row("Payment Methods");
        row("Method", "Amount");
        for (const [n, v] of paymentEntries) row(n, money(v));
      }
      blank();
    }

    // Abnormal
    if (officialStats?.abnormal) {
      const a = officialStats.abnormal;
      const items: { label: string; count: number; amount: number }[] = [
        { label: "Voided", count: a.voided.count, amount: a.voided.amount },
        { label: "Refunds", count: a.refunds.count, amount: a.refunds.amount },
        { label: "Discounts", count: a.discounts.count, amount: a.discounts.amount },
        { label: "Coupons", count: a.coupons.count, amount: a.coupons.amount },
        { label: "Credit Paid", count: a.creditPaid.count, amount: a.creditPaid.amount },
        { label: "Cancelled", count: a.cancelled.count, amount: a.cancelled.amount },
      ].filter((it) => it.count > 0 || it.amount !== 0);
      if (items.length) {
        row("Abnormal Transactions");
        row("Type", "Count", "Amount");
        for (const it of items) row(it.label, it.count, money(it.amount));
        blank();
      }
    }

    // Transactions (optional)
    if (exportIncludeTxn) {
      row("Transactions");
      row("Date", "Order ID", "Module", "Payment", "Items", "Total", "Status");
      for (const r of exportRows) {
        row(r.date, r.order_id, r.module, r.payment, r.items, r.total, r.status);
      }
    }

    return lines.join("\r\n");
  }, [
    exportRows,
    allTxnPeriodLabel,
    stat,
    officialStats,
    exportIncludeTxn,
    shopDisplayName,
  ]);

  const buildPdfHtml = useCallback(() => {
    const esc = (s: unknown) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const fmt = (n: number) => formatCurrency(n, 2);

    // ── Statement block (from officialStats) ──
    let statementHtml = "";
    if (officialStats) {
      const f = officialStats.financial;
      const o = officialStats.operational;
      const diningEntries = Object.entries(officialStats.diningMode).sort(
        (a, b) => b[1] - a[1]
      );
      const paymentEntries = Object.entries(officialStats.paymentMethod).sort(
        (a, b) => b[1] - a[1]
      );
      const row = (label: string, value: string, opts?: { sub?: boolean; total?: boolean; neg?: boolean }) =>
        `<tr class="${opts?.sub ? "sub" : ""} ${opts?.total ? "total" : ""}">
           <td>${opts?.sub ? "<span class=\"glyph\">└</span> " : ""}${esc(label)}</td>
           <td class="num ${opts?.neg ? "neg" : ""}">${esc(value)}</td>
         </tr>`;
      const groupHeader = (label: string) =>
        `<tr class="group"><td colspan="2">${esc(label)}</td></tr>`;
      statementHtml = `
        <table class="stmt">
          <tbody>
            ${row(t("sales_stmt_total_orders"), String(o.totalOrders))}
            ${row(t("sales_stmt_gross_sales"), fmt(f.grossSales))}
            ${row(t("sales_stmt_item_sales"), fmt(f.totalItemSale), { sub: true })}
            ${row(t("sales_stmt_credit_recharge"), fmt(f.totalCreditAdded), { sub: true })}
            ${row(t("sales_stmt_member_credit"), fmt(-f.totalCreditUsage), {
              sub: true,
              neg: f.totalCreditUsage > 0,
            })}
            ${row(t("sales_stmt_rounding"), fmt(f.totalRounding), { sub: true })}
            ${row(t("sales_stmt_discounts"), fmt(-f.totalDiscount), {
              neg: f.totalDiscount > 0,
            })}
            ${row(
              t("sales_stmt_refunds", { count: o.refundCount }),
              fmt(-f.totalRefunds),
              { neg: f.totalRefunds > 0 }
            )}
            ${row(t("sales_stmt_holiday_surcharge"), fmt(f.totalExtraCharge))}
            ${row(t("sales_stmt_payment_surcharge"), fmt(f.totalSurcharge))}
            ${f.totalTax > 0 ? row(t("sales_stmt_tax"), fmt(f.totalTax)) : ""}
            ${row(t("sales_stmt_total_revenue"), fmt(f.totalRevenue), { total: true })}
            ${
              diningEntries.length
                ? groupHeader(t("sales_stmt_dining_mode")) +
                  diningEntries.map(([n, v]) => row(n, fmt(v))).join("")
                : ""
            }
            ${
              paymentEntries.length
                ? groupHeader(t("sales_stmt_payment_methods")) +
                  paymentEntries.map(([n, v]) => row(n, fmt(v))).join("")
                : ""
            }
          </tbody>
        </table>`;
    }

    // ── Abnormal transactions block ──
    let abnormalHtml = "";
    if (officialStats?.abnormal) {
      const a = officialStats.abnormal;
      const items: { label: string; count: number; amount: number }[] = [
        { label: t("sales_abnormal_voided"), count: a.voided.count, amount: a.voided.amount },
        { label: t("sales_abnormal_refunds"), count: a.refunds.count, amount: a.refunds.amount },
        { label: t("sales_abnormal_discounts"), count: a.discounts.count, amount: a.discounts.amount },
        { label: t("sales_abnormal_coupons"), count: a.coupons.count, amount: a.coupons.amount },
        { label: t("sales_abnormal_credit_paid"), count: a.creditPaid.count, amount: a.creditPaid.amount },
        { label: t("sales_abnormal_cancelled"), count: a.cancelled.count, amount: a.cancelled.amount },
      ].filter((it) => it.count > 0 || it.amount !== 0);
      if (items.length) {
        abnormalHtml = `
          <table class="abn">
            <thead><tr><th>Type</th><th class="num">Count</th><th class="num">Amount</th></tr></thead>
            <tbody>
              ${items
                .map(
                  (it) => `
                <tr>
                  <td>${esc(it.label)}</td>
                  <td class="num">${esc(it.count)}</td>
                  <td class="num">${esc(fmt(it.amount))}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>`;
      }
    }

    // ── Transactions list (optional) ──
    let txnHtml = "";
    if (exportIncludeTxn) {
      const rowsHtml = sections
        .map(
          (sec) => `
          <tr class="group"><td colspan="5">${esc(sec.title)}</td><td class="num">${esc(
            fmt(sec.total)
          )}</td></tr>
          ${sec.data
            .map(
              (r) => `
            <tr>
              <td>${esc(r.date)}</td>
              <td>${esc(r.order_id)}</td>
              <td>${esc(r.module)}</td>
              <td>${esc(r.payment)}</td>
              <td class="num">${esc(r.items)}</td>
              <td class="num">${esc(fmt(parseMoney(r.total)))}</td>
            </tr>`
            )
            .join("")}`
        )
        .join("");
      txnHtml = `
        <h2>${esc(t("sales_all_txn_eyebrow"))}</h2>
        <table class="txn">
          <thead><tr>
            <th>Date</th><th>Order ID</th><th>Module</th><th>Payment</th>
            <th class="num">Items</th><th class="num">Total</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="foot">${esc(exportRows.length)} transaction(s)</div>`;
    }

    const generated = new Date().toLocaleString();
    return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Vend88 Sales — ${esc(allTxnPeriodLabel)}</title>
<style>
  /* Single page sized to content — height is set by printToFileAsync.
     'auto' lets the print engine match the requested canvas height. */
  @page { size: 210mm auto; margin: 14mm 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, Segoe UI, Roboto, Helvetica, sans-serif;
    color: #1a1f2e;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Dark header band (sits within page margins) */
  .header {
    background: #0f1427;
    color: #ffffff;
    padding: 18px 22px;
    margin-bottom: 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-radius: 10px;
    border-bottom: 4px solid #d4af37;
  }
  .brand {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }
  .brand img {
    width: 180px;
    height: 180px;
    object-fit: contain;
    display: block;
    /* Negative vertical margin lets the logo render bigger without
       inflating the header card height. Top margin is larger than
       bottom to nudge the logo visually upward. */
    margin: -30px 0 -35px;
  }
  .brand .mark {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: #181e38;
    color: #d4af37;
    font-weight: 900;
    font-size: 20px;
    letter-spacing: 0.5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .title-right { text-align: right; min-width: 0; }
  .title-right .eyebrow {
    font-size: 10px;
    letter-spacing: 3px;
    color: #d4af37;
    text-transform: uppercase;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .title-right h1 {
    font-size: 22px;
    margin: 0;
    font-weight: 800;
    letter-spacing: 0.3px;
    color: #ffffff;
  }
  .title-right .store {
    margin-top: 6px;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
  }
  .title-right .meta {
    margin-top: 4px;
    color: #aab0c4;
    font-size: 11px;
  }

  h2 {
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #6b7280;
    margin: 0 0 10px;
    font-weight: 700;
  }
  .section { margin-bottom: 22px; }

  /* KPI cards */
  .kpis { display: flex; gap: 12px; margin: 0 0 8px; page-break-inside: avoid; break-inside: avoid; }
  .kpi {
    flex: 1;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 12px 14px;
    background: #fafafa;
  }
  .kpi .label {
    font-size: 9px;
    letter-spacing: 1.5px;
    color: #6b7280;
    text-transform: uppercase;
    font-weight: 700;
  }
  .kpi .value {
    font-size: 20px;
    font-weight: 800;
    margin-top: 6px;
    color: #0f1427;
    font-variant-numeric: tabular-nums;
  }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }
  tr, td, th { page-break-inside: avoid; break-inside: avoid; }
  th, td { padding: 7px 10px; border-bottom: 1px solid #eef0f4; text-align: left; vertical-align: top; }
  th {
    background: #f3f4f8;
    font-size: 9px;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: #4b5563;
    font-weight: 700;
    border-bottom: 1px solid #d1d5db;
  }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.neg { color: #b91c1c; }
  tr.group td {
    background: #f9fafb;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    font-size: 9px;
    color: #6b7280;
    padding: 8px 10px;
    border-top: 1px solid #e5e7eb;
  }
  tr.sub td { color: #4b5563; }
  tr.sub .glyph { color: #9ca3af; margin-right: 4px; }
  tr.total td {
    font-weight: 800;
    border-top: 2px solid #0f1427;
    border-bottom: 2px solid #0f1427;
    background: #fafafa;
    font-size: 12px;
  }

  /* Two-column layout for statement + abnormal.
     Uses display:table so the block flows immediately after the summary
     instead of being forced onto the next page by flex break-inside rules. */
  .two-col {
    display: table;
    width: 100%;
    border-spacing: 16px 0;
    margin: 0 -16px 22px;
    table-layout: fixed;
  }
  .two-col .col { display: table-cell; vertical-align: top; width: 50%; min-width: 0; }
  .col-card {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    overflow: hidden;
  }
  .col-card table { font-size: 10.5px; }
  .col-card th, .col-card td { padding: 6px 12px; }

  /* Transactions — allow breaking across pages */
  .txn-section { page-break-inside: auto; break-inside: auto; }
  .txn table { font-size: 10px; }
  .txn tbody tr:nth-child(even) td { background: #fbfbfd; }
  .txn tr.group { page-break-after: avoid; }

  .footer {
    margin-top: 22px;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
    color: #9ca3af;
    font-size: 9px;
    display: flex;
    justify-content: space-between;
  }
</style></head><body>
  <div class="header">
    <div class="brand">
      ${
        logoDataUri
          ? `<img src="${logoDataUri}" alt="Vend88" />`
          : `<div class="mark">V88</div>`
      }
    </div>
    <div class="title-right">
      <div class="eyebrow">Vend88 Dashboard</div>
      <h1>Sales Report</h1>
      ${shopDisplayName ? `<div class="store">${esc(shopDisplayName)}</div>` : ""}
      <div class="meta">${esc(allTxnPeriodLabel)} · generated ${esc(generated)}</div>
    </div>
  </div>
  <div class="section">
    <h2>Summary</h2>
    <div class="kpis">
      <div class="kpi"><div class="label">Revenue</div><div class="value">${esc(
        fmt(parseMoney(stat.revenue))
      )}</div></div>
      <div class="kpi"><div class="label">Orders</div><div class="value">${esc(stat.orders)}</div></div>
      <div class="kpi"><div class="label">Avg order</div><div class="value">${esc(
        fmt(parseMoney(stat.avg))
      )}</div></div>
    </div>
  </div>
  ${
    statementHtml || abnormalHtml
      ? `<div class="two-col">
          ${
            statementHtml
              ? `<div class="col section">
                  <h2>${esc(t("sales_statement"))}</h2>
                  <div class="col-card">${statementHtml}</div>
                </div>`
              : ""
          }
          ${
            abnormalHtml
              ? `<div class="col section">
                  <h2>${esc(t("sales_abnormal_section"))}</h2>
                  <div class="col-card">${abnormalHtml}</div>
                </div>`
              : ""
          }
        </div>`
      : ""
  }
  ${txnHtml ? `<div class="txn-section txn">${txnHtml}</div>` : ""}
  <div class="footer">
    <span>${esc(shopDisplayName ?? "Vend88 Dashboard")} · Sales Report</span>
    <span>${esc(allTxnPeriodLabel)}</span>
  </div>
</body></html>`;
  }, [
    sections,
    allTxnPeriodLabel,
    stat,
    exportRows.length,
    officialStats,
    exportIncludeTxn,
    t,
    logoDataUri,
    shopDisplayName,
  ]);

  const showExportToast = useCallback((msg: string) => {
    setExportToast(msg);
    setTimeout(() => setExportToast(null), 2200);
  }, []);

  const handleExport = useCallback(
    async (kind: "csv" | "pdf") => {
      // Only wait for the transactions list when the user has opted to
      // include it. Otherwise the statement export can proceed immediately.
      if (exportIncludeTxn && (txnLoading || txnLoadedKey !== txnPeriodKey)) {
        // Transactions for this period haven't finished loading yet.
        haptic.selection();
        return;
      }
      if (exportRows.length === 0 && !officialStats) {
        haptic.error();
        showExportToast(t("sales_export_empty"));
        setExportOpen(false);
        return;
      }
      try {
        setExporting(kind);
        haptic.selection();
        if (kind === "csv") {
          const file = new File(Paths.cache, `${exportFileBase}.csv`);
          if (file.exists) file.delete();
          file.create();
          file.write(buildCsv());
          if (Sharing && (await Sharing.isAvailableAsync())) {
            await Sharing.shareAsync(file.uri, {
              mimeType: "text/csv",
              dialogTitle: t("sales_export_title"),
              UTI: "public.comma-separated-values-text",
            });
          } else {
            showExportToast("Sharing unavailable on this device");
          }
          haptic.success();
        } else {
          if (!Print) {
            showExportToast("PDF export unavailable on this device");
            haptic.warning();
            setExportOpen(false);
            return;
          }
          // ── Estimate output height so the PDF fits content tightly
          // instead of leaving a huge blank tail. Values are in points
          // (1pt = 1/72in). Tuned to match the CSS row heights/padding.
          const ROW = 24; // table row incl. padding
          const SECTION_HEADER = 32; // h2 + margin
          let statementRows = 0;
          if (officialStats) {
            // Base statement rows (Total Orders, Gross Sales + 4 sub,
            // Discounts, Refunds, Holiday, Payment surcharge, Tax?,
            // Total Revenue) ≈ 11
            statementRows = 11;
            if (officialStats.financial.totalTax > 0) statementRows += 1;
            const diningCount = Object.keys(officialStats.diningMode).length;
            const paymentCount = Object.keys(officialStats.paymentMethod).length;
            if (diningCount) statementRows += 1 + diningCount; // group header + entries
            if (paymentCount) statementRows += 1 + paymentCount;
          }
          let abnormalRows = 0;
          if (officialStats?.abnormal) {
            const a = officialStats.abnormal;
            abnormalRows = [
              a.voided, a.refunds, a.discounts,
              a.coupons, a.creditPaid, a.cancelled,
            ].filter((it) => it.count > 0 || it.amount !== 0).length;
            if (abnormalRows) abnormalRows += 1; // thead row
          }
          const twoColHeight = Math.max(
            statementRows ? SECTION_HEADER + statementRows * ROW + 16 : 0,
            abnormalRows ? SECTION_HEADER + abnormalRows * ROW + 16 : 0
          );
          let txnHeight = 0;
          if (exportIncludeTxn) {
            const totalTxnRows =
              sections.reduce((acc, sec) => acc + sec.data.length, 0) +
              sections.length; // group header per section
            txnHeight = SECTION_HEADER + 28 /* thead */ + totalTxnRows * 20 + 30;
          }
          const HEADER = 220; // dark brand header
          const SUMMARY = 110; // KPI cards section
          const FOOTER = 60;
          const PADDING = 60; // top/bottom margins safety
          const estimatedHeight = Math.max(
            842, // never shorter than A4 portrait
            HEADER + SUMMARY + twoColHeight + txnHeight + FOOTER + PADDING
          );

          const { uri } = await Print.printToFileAsync({
            html: buildPdfHtml(),
            // Render as a single page sized to fit content — A4 width
            // with auto-calculated height. Avoids both pagination and
            // large empty space at the bottom.
            width: 595,
            height: estimatedHeight,
            margins: { top: 40, bottom: 40, left: 40, right: 40 },
          });
          const target = new File(Paths.cache, `${exportFileBase}.pdf`);
          let shareUri = uri;
          try {
            if (target.exists) target.delete();
            const tmp = new File(uri);
            tmp.move(target);
            shareUri = target.uri;
          } catch {
            // fall back to the original print uri
          }
          if (Sharing && (await Sharing.isAvailableAsync())) {
            await Sharing.shareAsync(shareUri, {
              mimeType: "application/pdf",
              dialogTitle: t("sales_export_title"),
              UTI: "com.adobe.pdf",
            });
          } else {
            showExportToast("Sharing unavailable on this device");
          }
          haptic.success();
        }
        setExportOpen(false);
      } catch (err) {
        console.log("[sales-export] failed:", err);
        haptic.error();
      } finally {
        setExporting(null);
      }
    },
    [
      exportRows.length,
      buildCsv,
      buildPdfHtml,
      exportFileBase,
      showExportToast,
      t,
      txnLoading,
      txnLoadedKey,
      txnPeriodKey,
      officialStats,
    ]
  );

  return (
    <SafeAreaView style={styles.safeContainer} edges={["top"]}>
      <OfflineNotice />
      <TopProgressBar visible={isFetching && !loading} />
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <SectionList<Sale, { title: string; total: number; data: Sale[] }>
        sections={[]}
        keyExtractor={(item) => String(item.id)}
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={onRefresh}
            tintColor="transparent"
            colors={["transparent"]}
            progressBackgroundColor="transparent"
          />
        }
        ListHeaderComponent={
          <>
            {/* Top bar */}
            <View style={styles.topBar}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.eyebrow}>{t("sales_reports_eyebrow")}</Text>
                <Text style={styles.title}>{t("sales_title")}</Text>
              </View>
              <Pressable
                accessibilityLabel={t("sales_export_report")}
                onPress={() => {
                  haptic.selection();
                  setExportOpen(true);
                  // Do NOT prefetch the transaction list by default — it can
                  // be slow and is only needed when the user ticks the
                  // “Include transaction list” option in the export sheet.
                }}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              >
                <Ionicons name="download-outline" size={18} color={tokens.TEXT} />
              </Pressable>
            </View>

            {/* Period — underline text tabs */}
            <View style={styles.periodTabs}>
              {PERIODS.map((p) => {
                const active = period === p;
                return (
                  <Pressable
                    key={p}
                    accessibilityLabel={t("sales_show_period_data", { period: periodLabel(p) })}
                    disabled={isFetching}
                    onPress={() => {
                      haptic.selection();
                      if (p === "custom") {
                        setPeriod("custom");
                        setPickerOpen(true);
                      } else {
                        setPeriod(p);
                      }
                    }}
                    style={styles.periodTab}
                  >
                    <Text
                      style={[
                        styles.periodTabText,
                        active && styles.periodTabTextActive,
                        isFetching && styles.periodTabTextDisabled,
                      ]}
                    >
                      {periodLabel(p)}
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

            {/* Date pager — unified pill: [<]  📅 label  ·  [>] */}
            {(() => {
              if (period === "custom") {
                const hasRange = !!(customStart && customEnd);
                const rangeLabel = hasRange
                  ? `${formatShortDate(customStart!)} – ${formatShortDate(customEnd!)}`
                  : t("sales_pager_select_range");
                return (
                  <View style={styles.datePager}>
                    <Pressable
                      accessibilityLabel={t("sales_pager_edit_range")}
                      onPress={() => {
                        haptic.selection();
                        setPickerOpen(true);
                      }}
                      style={({ pressed }) => [
                        styles.pagerArrow,
                        pressed && styles.pagerArrowPressed,
                      ]}
                      hitSlop={6}
                    >
                      <Ionicons name="calendar-outline" size={16} color={tokens.TEXT} />
                    </Pressable>

                    <View style={styles.pagerDivider} />

                    <Pressable
                      accessibilityLabel={t("sales_pager_change_range")}
                      onPress={() => {
                        haptic.selection();
                        setPickerOpen(true);
                      }}
                      style={styles.pagerCenter}
                      hitSlop={6}
                    >
                      <View style={styles.pagerLabelRow}>
                        <Text style={styles.pagerLabel} numberOfLines={1}>
                          {rangeLabel}
                        </Text>
                      </View>
                      <Text style={styles.pagerJump}>
                        {hasRange ? t("sales_pager_change_range_btn") : t("sales_pager_tap_choose")}
                      </Text>
                    </Pressable>

                    <View style={styles.pagerDivider} />

                    <Pressable
                      accessibilityLabel={t("sales_pager_edit_range")}
                      onPress={() => {
                        haptic.selection();
                        setPickerOpen(true);
                      }}
                      style={({ pressed }) => [
                        styles.pagerArrow,
                        pressed && styles.pagerArrowPressed,
                      ]}
                      hitSlop={6}
                    >
                      <Ionicons name="create-outline" size={16} color={tokens.TEXT} />
                    </Pressable>
                  </View>
                );
              }
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
                    accessibilityLabel={t("sales_pager_previous")}
                    onPress={goPrev}
                    style={({ pressed }) => [
                      styles.pagerArrow,
                      pressed && styles.pagerArrowPressed,
                    ]}
                    hitSlop={6}
                  >
                    <Ionicons name="chevron-back" size={18} color={tokens.TEXT} />
                  </Pressable>

                  <View style={styles.pagerDivider} />

                  <Pressable
                    accessibilityLabel={
                      isCurrent
                        ? t("sales_pager_today_tag")
                        : t("sales_pager_jump_current")
                    }
                    onPress={isCurrent ? undefined : goCurrent}
                    style={styles.pagerCenter}
                    hitSlop={6}
                  >
                    <View style={styles.pagerLabelRow}>
                      <Text style={styles.pagerLabel} numberOfLines={1}>
                        {label}
                      </Text>
                      {isCurrent ? <View style={styles.pagerCurrentDot} /> : null}
                    </View>
                    {isCurrent ? (
                      <Text style={styles.pagerCurrentTag}>
                        {period === "today"
                          ? t("sales_pager_today_tag")
                          : period === "this_week"
                          ? t("sales_pager_this_week_tag")
                          : t("sales_pager_this_month_tag")}
                      </Text>
                    ) : (
                      <Text style={styles.pagerJump}>
                        {period === "today"
                          ? t("sales_pager_jump_today")
                          : period === "this_week"
                          ? t("sales_pager_jump_week")
                          : t("sales_pager_jump_month")}
                      </Text>
                    )}
                  </Pressable>

                  <View style={styles.pagerDivider} />

                  <Pressable
                    accessibilityLabel={t("sales_pager_next")}
                    onPress={goNext}
                    disabled={!canGoNext}
                    style={({ pressed }) => [
                      styles.pagerArrow,
                      !canGoNext && styles.pagerArrowDisabled,
                      pressed && canGoNext && styles.pagerArrowPressed,
                    ]}
                    hitSlop={6}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={canGoNext ? tokens.TEXT : tokens.TEXT_FAINT}
                    />
                  </Pressable>
                </View>
              );
            })()}

            {/* Network/empty state notice — shown when we couldn't load any
                data AND there is nothing cached to display, so the user
                isn't left looking at silent zeros. */}
            {!loading && !officialStats && sales.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons
                  name={
                    loadError
                      ? online
                        ? "alert-circle-outline"
                        : "cloud-offline-outline"
                      : "stats-chart-outline"
                  }
                  size={32}
                  color={loadError ? (online ? tokens.DANGER : tokens.GOLD) : tokens.TEXT_DIM}
                />
                <Text style={styles.emptyTitle}>
                  {loadError
                    ? online
                      ? t("sales_load_error_title")
                      : t("sales_offline_title")
                    : t("sales_no_data_title")}
                </Text>
                <Text style={styles.emptyBody}>
                  {loadError
                    ? online
                      ? t("sales_load_error_body")
                      : t("sales_offline_body")
                    : t("sales_no_data_body")}
                </Text>
                <Pressable
                  onPress={() => {
                    haptic.selection();
                    if (API_TARGET === "official") {
                      invalidateOfficialDashboardCaches();
                    }
                    setRefreshKey((k) => k + 1);
                    if (txnLoadedKey) {
                      void fetchAll();
                    }
                  }}
                  style={styles.emptyBtn}
                >
                  <Text style={styles.emptyBtnText}>{t("common_retry")}</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Hero revenue — flat, dashboard-style */}
            {loading ? (
              <>
                <LoadingHero />
                <LoadingKpiRow />
              </>
            ) : !officialStats && sales.length === 0 ? null : (
              <FadingContent fading={isFetching}>
                <View style={styles.hero}>
                  <View style={styles.heroLeft}>
                    <View style={styles.heroLabelRow}>
                      <Text style={styles.heroLabel}>
                        {period === "custom"
                          ? customStart && customEnd
                            ? `${formatShortDate(customStart).toUpperCase()} – ${formatShortDate(customEnd).toUpperCase()} · ${t("sales_revenue_word").toUpperCase()}`
                            : t("sales_hero_custom_revenue")
                          : period === "today" && !isSelectedToday
                          ? `${formatShortDate(selectedDate).toUpperCase()} · ${t("sales_revenue_word").toUpperCase()}`
                          : period === "this_week" &&
                            dayKey(selectedWeekStart) !== dayKey(thisWeekStart)
                          ? `${formatWeekPill(selectedWeekStart).toUpperCase()} · ${t("sales_revenue_word").toUpperCase()}`
                          : period === "this_month" &&
                            (selectedMonthStart.getFullYear() !== thisMonthStart.getFullYear() ||
                              selectedMonthStart.getMonth() !== thisMonthStart.getMonth())
                          ? `${formatMonthPill(selectedMonthStart).toUpperCase()} · ${t("sales_revenue_word").toUpperCase()}`
                          : `${periodLabel(period).toUpperCase()} ${t("sales_revenue_word").toUpperCase()}`}
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
                        <View
                          style={[styles.heroDot, period === "custom" && styles.heroDotActive]}
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
                        {t("sales_vs_previous_period", { period: periodLabel(period).toLowerCase() })}
                      </Text>
                    </View>
                  </View>

                </View>

                {/* KPI Row — flat, divided by hairlines */}
                <View style={styles.kpiRow}>
                  <View style={styles.kpiCell}>
                    <Ionicons name="cube-outline" size={16} color={tokens.GOLD} />
                    <AnimatedNumber value={itemsSoldKpi} style={styles.kpiValue} />
                    <Text style={styles.kpiLabel}>{t("sales_kpi_items_sold")}</Text>
                  </View>
                  <View style={styles.kpiDivider} />
                  <View style={styles.kpiCell}>
                    <Ionicons name="receipt-outline" size={16} color={tokens.WARNING} />
                    <AnimatedNumber value={stat?.orders ?? 0} style={styles.kpiValue} />
                    <Text style={styles.kpiLabel}>{t("sales_kpi_orders")}</Text>
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
                    <Text style={styles.kpiLabel}>{t("sales_kpi_avg_order")}</Text>
                  </View>
                </View>
              </FadingContent>
            )}

            {/* Statement — itemised storeStatistics breakdown */}
            {loading ? (
              <LoadingStatement />
            ) : (
              <FadingContent fading={isFetching}>
                {officialStats && (() => {
                const f = officialStats.financial;
                const o = officialStats.operational;
                const periodHint =
                  period === "today"
                    ? formatShortDate(selectedDate).toUpperCase()
                    : period === "this_week"
                    ? formatWeekPill(selectedWeekStart).toUpperCase()
                    : period === "custom"
                    ? customStart && customEnd
                      ? `${formatShortDate(customStart).toUpperCase()} – ${formatShortDate(customEnd).toUpperCase()}`
                      : t("sales_period_hint_custom")
                    : formatMonthPill(selectedMonthStart).toUpperCase();
                const fmt = (n: number) => formatCurrency(n, 2);
                const diningEntries = Object.entries(officialStats.diningMode).sort(
                  (a, b) => b[1] - a[1]
                );
                const paymentEntries = Object.entries(
                  officialStats.paymentMethod
                ).sort((a, b) => b[1] - a[1]);
                return (
                  <View style={styles.block}>
                    <SectionLabel
                      label={t("sales_statement")}
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
                      <StatementRow label={t("sales_stmt_total_orders")} value={String(o.totalOrders)} />
                      <StatementDivider />

                      <StatementRow
                        label={t("sales_stmt_gross_sales")}
                        value={fmt(f.grossSales)}
                        emphasis
                      />
                      <StatementSubRow
                        label={t("sales_stmt_item_sales")}
                        value={fmt(f.totalItemSale)}
                      />
                      <StatementSubRow
                        label={t("sales_stmt_credit_recharge")}
                        value={fmt(f.totalCreditAdded)}
                      />
                      <StatementSubRow
                        label={t("sales_stmt_member_credit")}
                        value={fmt(-f.totalCreditUsage)}
                        negative={f.totalCreditUsage > 0}
                      />
                      <StatementSubRow
                        label={t("sales_stmt_rounding")}
                        value={fmt(f.totalRounding)}
                      />

                      <StatementDivider />
                      <StatementRow
                        label={t("sales_stmt_discounts")}
                        value={fmt(-f.totalDiscount)}
                        negative={f.totalDiscount > 0}
                      />
                      <StatementDivider />
                      <StatementRow
                        label={t("sales_stmt_refunds", { count: o.refundCount })}
                        value={fmt(-f.totalRefunds)}
                        negative={f.totalRefunds > 0}
                      />
                      <StatementDivider />
                      <StatementRow
                        label={t("sales_stmt_holiday_surcharge")}
                        value={fmt(f.totalExtraCharge)}
                      />
                      <StatementDivider />
                      <StatementRow
                        label={t("sales_stmt_payment_surcharge")}
                        value={fmt(f.totalSurcharge)}
                      />
                      {f.totalTax > 0 && (
                        <>
                          <StatementDivider />
                          <StatementRow label={t("sales_stmt_tax")} value={fmt(f.totalTax)} />
                        </>
                      )}
                      <StatementDivider />
                      <StatementRow
                        label={t("sales_stmt_total_revenue")}
                        value={fmt(f.totalRevenue)}
                        total
                      />
                    </Animated.View>
                  </View>
                );
              })()}
              </FadingContent>
            )}

            {/* Dining Mode — standalone card matching Payment Methods /
                Revenue by Module: stacked bar + dot/name/amount/% rows. */}
            {!loading && officialStats?.diningMode && (() => {
              const entries = Object.entries(officialStats.diningMode)
                .filter(([, v]) => (v as number) > 0)
                .sort((a, b) => (b[1] as number) - (a[1] as number)) as [string, number][];
              if (!entries.length) return null;
              const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
              const items = entries.map(([name, value], i) => ({
                name,
                value,
                pct: (value / total) * 100,
                color:
                  DINING_COLORS[name] ??
                  DINING_FALLBACK_PALETTE[i % DINING_FALLBACK_PALETTE.length],
              }));
              return (
                <FadingContent fading={isFetching}>
                  <View style={styles.breakdownGroup}>
                    <View style={styles.breakdownSection}>
                      <SectionLabel
                        label={t("sales_stmt_dining_mode")}
                        style={styles.breakdownSectionLabel}
                        right={
                          <Text style={styles.sectionHint}>{items.length}</Text>
                        }
                      />

                      {/* Stacked bar — dining mix at a glance */}
                      <View style={styles.stackedBar}>
                        {items.map((d) => (
                          <Animated.View
                            key={d.name}
                            style={{
                              width: barAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: ["0%", `${d.pct}%`],
                              }),
                              backgroundColor: d.color,
                            }}
                          />
                        ))}
                      </View>

                      {/* Unified rows: dot · name · amount · % */}
                      <View style={styles.moduleList}>
                        {items.map((d, i) => (
                          <View
                            key={d.name}
                            style={[
                              styles.paymentRow,
                              i !== items.length - 1 && styles.moduleRowDivider,
                            ]}
                          >
                            <View style={styles.moduleLeft}>
                              <View
                                style={[
                                  styles.moduleDot,
                                  { backgroundColor: d.color },
                                ]}
                              />
                              <Text style={styles.moduleName} numberOfLines={1}>
                                {d.name}
                              </Text>
                            </View>
                            <Text style={styles.paymentAmount}>
                              {formatCurrency(d.value, 2)}
                            </Text>
                            <Text style={styles.paymentPct}>
                              {d.pct.toFixed(0)}%
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                </FadingContent>
              );
            })()}

            {/* Payment Methods — unified card: stacked bar + dot/name/amount/%
                rows. Replaces the old separate amount-table and percent-mix. */}
            {!loading && displayPaymentBreakdown.length > 0 && (
              <View style={styles.breakdownGroup}>
                <View style={styles.breakdownSection}>
                  <SectionLabel
                    label={t("sales_stmt_payment_methods")}
                    style={styles.breakdownSectionLabel}
                    right={
                      <Text style={styles.sectionHint}>
                        {displayPaymentBreakdown.length}{" "}
                        {displayPaymentBreakdown.length === 1
                          ? t("sales_method_one")
                          : t("sales_method_other")}
                      </Text>
                    }
                  />

                  {/* Stacked bar — overall mix at a glance */}
                  <View style={styles.stackedBar}>
                    {displayPaymentBreakdown.map((p) => (
                      <Animated.View
                        key={p.name}
                        style={{
                          width: barAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ["0%", `${p.pct}%`],
                          }),
                            backgroundColor: getPaymentColor(p.name),
                        }}
                      />
                    ))}
                  </View>

                  {/* Unified rows: dot · name · amount · % */}
                  <View style={styles.moduleList}>
                    {displayPaymentBreakdown.map((p, i) => (
                      <View
                        key={p.name}
                        style={[
                          styles.paymentRow,
                          i !== displayPaymentBreakdown.length - 1 && styles.moduleRowDivider,
                        ]}
                      >
                        <View style={styles.moduleLeft}>
                          <View
                            style={[
                              styles.moduleDot,
                              {
                                backgroundColor: getPaymentColor(p.name),
                              },
                            ]}
                          />
                          <Text style={styles.moduleName} numberOfLines={1}>
                            {p.name}
                          </Text>
                        </View>
                        <Text style={styles.paymentAmount}>
                          {formatCurrency(p.value, 2)}
                        </Text>
                        <Text style={styles.paymentPct}>
                          {p.pct.toFixed(0)}%
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Revenue by Module — separate card, same visual language as
                Payment Methods (stacked bar + dot/name/amount/% rows) so the
                two breakdown chapters read consistently. */}
            {!loading && displayModuleBreakdown.length > 0 && (
              <FadingContent fading={isFetching}>
                <View style={styles.breakdownGroup}>
                  <View style={styles.breakdownSection}>
                    <SectionLabel
                      label={t("sales_revenue_by_module")}
                      style={styles.breakdownSectionLabel}
                      right={
                        <Text style={styles.sectionHint}>
                          {displayModuleBreakdown.length}
                        </Text>
                      }
                    />

                    {/* Stacked bar — module mix at a glance */}
                    <View style={styles.stackedBar}>
                      {displayModuleBreakdown.map((m) => (
                        <Animated.View
                          key={m.module}
                          style={{
                            width: barAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: ["0%", `${m.pct}%`],
                            }),
                            backgroundColor:
                              MODULE_COLORS[m.module] ?? MODULE_UNKNOWN_COLOR,
                          }}
                        />
                      ))}
                    </View>

                    {/* Unified rows: dot · name · amount · % */}
                    <View style={styles.moduleList}>
                      {displayModuleBreakdown.map((m, i) => (
                        <View
                          key={m.module}
                          style={[
                            styles.paymentRow,
                            i !== displayModuleBreakdown.length - 1 && styles.moduleRowDivider,
                          ]}
                        >
                          <View style={styles.moduleLeft}>
                            <View
                              style={[
                                styles.moduleDot,
                                {
                                  backgroundColor:
                                    MODULE_COLORS[m.module] ?? MODULE_UNKNOWN_COLOR,
                                },
                              ]}
                            />
                            <Text style={styles.moduleName} numberOfLines={1}>
                              {m.module}
                            </Text>
                          </View>
                          <Text style={styles.paymentAmount}>
                            {formatCurrency(m.revenue, 2)}
                          </Text>
                          <Text style={styles.paymentPct}>
                            {m.pct.toFixed(0)}%
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              </FadingContent>
            )}

            {/* Top Items — top 5 best-selling SKUs for the active period.
                Mirrors the dashboard's top-items row: image thumbnail with
                medal badge for ranks 1-3, name, units, and revenue. */}
            {!loading && displayTopItems && displayTopItems.length > 0 && (
              <FadingContent fading={isFetching}>
                <View style={styles.breakdownGroup}>
                  <View style={styles.breakdownSection}>
                    <SectionLabel
                      label={t("sales_top_items")}
                      style={styles.breakdownSectionLabel}
                      right={
                        displayTopItems.length > 5 ? (
                          <Pressable
                            accessibilityLabel={topItemsExpanded ? "Show less top items" : `See all ${displayTopItems.length} top items`}
                            onPress={() => {
                              haptic.selection();
                              setTopItemsExpanded((v) => !v);
                            }}
                            style={({ pressed }) => [
                              styles.topItemsChip,
                              pressed && styles.topItemsChipPressed,
                            ]}
                            hitSlop={6}
                          >
                            <Text style={styles.topItemsChipText}>
                              {topItemsExpanded ? t("sales_top_items_collapse") : t("sales_top_items_see_all")}
                            </Text>
                            <Ionicons
                              name={topItemsExpanded ? "chevron-up" : "chevron-forward"}
                              size={13}
                              color={tokens.TEXT_DIM}
                            />
                          </Pressable>
                        ) : (
                          <Text style={styles.sectionHint}>
                            {displayTopItems.length}
                          </Text>
                        )
                      }
                    />
                    <View style={styles.moduleList}>
                      {(topItemsExpanded ? displayTopItems : displayTopItems.slice(0, 5)).map((item, i) => {
                        const visibleItems = topItemsExpanded ? displayTopItems : displayTopItems.slice(0, 5);
                        const initial = (item.name?.[0] ?? "?").toUpperCase();
                        return (
                          <View
                            key={item.id}
                            style={[
                              styles.topItemRow,
                              i !== visibleItems.length - 1 && styles.moduleRowDivider,
                            ]}
                          >
                            <View style={styles.topItemThumb}>
                              {item.image ? (
                                <Image
                                  source={{ uri: item.image }}
                                  style={styles.topItemThumbImage}
                                  resizeMode="cover"
                                />
                              ) : (
                                <Text style={styles.topItemThumbText}>
                                  {initial}
                                </Text>
                              )}
                            </View>
                            <Text style={styles.topItemName} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={styles.topItemUnits}>
                              {item.units}
                            </Text>
                            <Text style={styles.paymentAmount}>
                              {formatCurrency(parseFloat(item.revenue), 2)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </FadingContent>
            )}

            {/* Empty-state placeholders — surface a small icon + one-liner
                when a period has no data for a given breakdown so the page
                doesn't quietly hide entire chapters. */}
            {!loading && officialStats && displayPaymentBreakdown.length === 0 && (
              <EmptyBreakdownCard
                icon="card-outline"
                title={t("sales_stmt_payment_methods")}
                message={t("sales_empty_payment")}
              />
            )}
            {!loading && officialStats && displayModuleBreakdown.length === 0 && (
              <EmptyBreakdownCard
                icon="apps-outline"
                title={t("sales_revenue_by_module")}
                message={t("sales_empty_module")}
              />
            )}
            {!loading && displayTopItems !== null && displayTopItems.length === 0 && (
              <EmptyBreakdownCard
                icon="bag-outline"
                title={t("sales_top_items")}
                message={t("sales_empty_top_items")}
              />
            )}

            {/* Loading-state placeholder for the module breakdown lives outside
                the unified card because payment-mix is also gated on !loading. */}
            {loading && <LoadingModuleBreakdown />}

            {/* Abnormal transactions — placed AFTER Statement + Revenue
                breakdown so the positive revenue narrative reads first,
                with exception cases (voided / refunds / discounts /
                coupons / credit / cancelled) closing the chapter. */}
            {!loading && officialStats && (() => {
              const a = officialStats.abnormal;
              const items: {
                key: string;
                label: string;
                icon: keyof typeof Ionicons.glyphMap;
                color: string;
                count: number;
                amount: number;
              }[] = [
                { key: "voided",     label: t("sales_abnormal_voided"),     icon: "close-circle-outline",     color: "#ef4444", count: a.voided.count,     amount: a.voided.amount },
                { key: "refunds",    label: t("sales_abnormal_refunds"),    icon: "return-down-back-outline", color: "#f97316", count: a.refunds.count,    amount: a.refunds.amount },
                { key: "discounts",  label: t("sales_abnormal_discounts"),  icon: "pricetag-outline",         color: "#f59e0b", count: a.discounts.count,  amount: a.discounts.amount },
                { key: "coupons",    label: t("sales_abnormal_coupons"),    icon: "ticket-outline",           color: "#8b5cf6", count: a.coupons.count,    amount: a.coupons.amount },
                { key: "creditPaid", label: t("sales_abnormal_credit_paid"), icon: "wallet-outline",       color: "#06b6d4", count: a.creditPaid.count, amount: a.creditPaid.amount },
                { key: "cancelled",  label: t("sales_abnormal_cancelled"),  icon: "ban-outline",              color: "#dc2626", count: a.cancelled.count,  amount: a.cancelled.amount },
              ];
              const totalCount = items.reduce((sum, i) => sum + i.count, 0);
              const fmt = (n: number) => formatCurrency(n, 2);
              return (
                <FadingContent fading={isFetching}>
                  <View style={styles.block}>
                    <SectionLabel
                      label={t("sales_abnormal_section")}
                      right={
                        <Text style={styles.sectionHint}>
                          {t("sales_records", { count: totalCount })}
                        </Text>
                      }
                    />
                    <Animated.View
                      style={[
                        styles.statementCard,
                        styles.abnormalCard,
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
                      {items.map((it, idx) => (
                        <View key={it.key}>
                          {idx > 0 && <StatementDivider />}
                          <View style={styles.abnormalRow}>
                            <View
                              style={[
                                styles.abnormalIcon,
                                { backgroundColor: it.color + "1f" },
                              ]}
                            >
                              <Ionicons name={it.icon} size={16} color={it.color} />
                            </View>
                            <View style={styles.abnormalBody}>
                              <Text style={styles.abnormalLabel}>{it.label}</Text>
                              <Text style={styles.abnormalCount}>
                                {t("sales_txns", { count: it.count })}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.abnormalAmount,
                                it.amount > 0 && styles.statementValueNegative,
                              ]}
                            >
                              {it.amount > 0 ? `-${fmt(it.amount)}` : fmt(0)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </Animated.View>
                  </View>
                </FadingContent>
              );
            })()}

            {/* Txn header — chapter break: extra top margin separates the
                transactions CTA from the revenue breakdown card above. */}
            <SectionLabel
              label={t("sales_transactions")}
              style={styles.txnChapterLabel}
            />
          </>
        }
        renderSectionHeader={renderTxnHeader}
        renderItem={renderTxnItem}
        ItemSeparatorComponent={null}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListEmptyComponent={
          loading ? (
            <LoadingTransactionList />
          ) : (stat?.orders ?? 0) > 0 ? (
            <Pressable
              accessibilityLabel={`${t("dashboard_see_all")} ${stat.orders} ${transactionNoun(stat.orders, t)} ${periodLabel}`}
              onPress={() => {
                haptic.selection();
                setAllTxnOpen(true);
                if (txnLoadedKey !== txnPeriodKey && !txnLoading) {
                  fetchAll();
                }
              }}
              style={({ pressed }) => [
                styles.txnHeroCard,
                pressed && styles.txnHeroCardPressed,
              ]}
            >
              <View style={styles.txnHeroAccent} />
              <View style={styles.txnHeroInner}>
                <View style={styles.txnHeroIcon}>
                  <Ionicons name="receipt-outline" size={20} color={tokens.GOLD} />
                </View>

                <View style={styles.txnHeroBody}>
                  <Text style={styles.txnHeroEyebrow} numberOfLines={1}>
                    {allTxnPeriodLabel.toUpperCase()}
                  </Text>
                  <View style={styles.txnHeroCountRow}>
                    <AnimatedNumber
                      value={stat.orders}
                      style={styles.txnHeroCount}
                    />
                    <Text style={styles.txnHeroCountLabel}>
                      {transactionNoun(stat.orders, t)}
                    </Text>
                  </View>
                  <Text style={styles.txnHeroHint}>
                    {t("sales_tap_to_view_all")}
                  </Text>
                </View>

                <View style={styles.txnHeroCtaPill}>
                  <Ionicons name="arrow-forward" size={15} color="#181e38" />
                </View>
              </View>
            </Pressable>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={32} color={tokens.TEXT_DIM} />
              <Text style={styles.emptyTitle}>{t("sales_no_transactions")}</Text>
              <Text style={styles.emptyBody}>
                {search
                  ? t("sales_no_search_results")
                  : statusFilter !== ALL_STATUS_FILTER
                  ? t("sales_no_filtered_orders", {
                      status: activeStatusLabel.toLowerCase(),
                    })
                  : t("sales_try_different_time_range")}
              </Text>
              {(search || statusFilter !== ALL_STATUS_FILTER) && (
                <Pressable
                  onPress={() => {
                    haptic.selection();
                    setSearch("");
                    setStatusFilter(ALL_STATUS_FILTER);
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
      <Modal
        visible={allTxnOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAllTxnOpen(false)}
      >
        <SafeAreaView style={styles.allTxnContainer} edges={["top"]}>
          <View style={styles.allTxnHeader}>
            <View style={styles.allTxnHeaderText}>
              <Text style={styles.allTxnEyebrow}>{t("sales_all_txn_eyebrow")}</Text>
              <Text style={styles.allTxnTitle}>{allTxnPeriodLabel}</Text>
              <Text style={styles.allTxnSubtitle}>
                {txnLoading && txnLoadedKey !== txnPeriodKey
                  ? t("sales_all_txn_loading", {
                      count: stat?.orders ?? 0,
                      label: recordNoun(stat?.orders ?? 0, t),
                    })
                  : `${t("sales_records", { count: totalFiltered })}${
                      statusFilter !== ALL_STATUS_FILTER
                        ? ` · ${activeStatusLabel}`
                        : ""
                    }`}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={t("sales_all_txn_close")}
              hitSlop={8}
              onPress={() => {
                haptic.selection();
                setAllTxnOpen(false);
              }}
              style={({ pressed }) => [
                styles.allTxnCloseBtn,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="close" size={20} color={tokens.TEXT} />
            </Pressable>
          </View>

          <View style={styles.allTxnControls}>
            <View
              style={[
                styles.searchRow,
                searchFocused && styles.searchRowFocused,
              ]}
            >
              <Ionicons
                name="search"
                size={15}
                color={searchFocused ? tokens.GOLD : tokens.TEXT_DIM}
              />
              <TextInput
                accessibilityLabel={t("sales_search_transactions")}
                placeholder={t("sales_search_placeholder")}
                placeholderTextColor={tokens.TEXT_FAINT}
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
                  accessibilityLabel={t("sales_clear_search")}
                  onPress={() => {
                    haptic.selection();
                    setSearch("");
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={18} color={tokens.TEXT_DIM} />
                </Pressable>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.statusTabsScroll}
              contentContainerStyle={styles.statusTabs}
            >
              {statusTabs.map((tab) => {
                const active = statusFilter === tab.key;
                const count = statusCounts[tab.key] ?? 0;
                return (
                  <Pressable
                    key={tab.key}
                    accessibilityLabel={`${tab.label}, ${t("sales_records", { count })}`}
                    onPress={() => {
                      haptic.selection();
                      setStatusFilter(tab.key);
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
                        {tab.label}
                      </Text>
                      <View
                        style={[
                          styles.statusTabCount,
                          active && styles.statusTabCountActive,
                        ]}
                      >
                        <AnimatedNumber
                          value={count}
                          duration={420}
                          separator
                          style={
                            active
                              ? [styles.statusTabCountText, styles.statusTabCountTextActive]
                              : styles.statusTabCountText
                          }
                        />
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
            </ScrollView>
          </View>

          <SectionList<Sale, { title: string; total: number; data: Sale[] }>
            sections={sections}
            keyExtractor={(item) => `all-${item.id}`}
            style={styles.allTxnList}
            contentContainerStyle={styles.allTxnContent}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled
            renderSectionHeader={renderTxnHeader}
            renderItem={renderTxnItem}
            SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
            ListEmptyComponent={
              txnLoading || txnLoadedKey !== txnPeriodKey ? (
                <TransactionsLoadingSkeleton
                  count={Math.min(Math.max(stat?.orders ?? 6, 4), 10)}
                  totalLabel={
                    (stat?.orders ?? 0) > 0
                      ? t("sales_all_txn_loading", {
                          count: stat.orders,
                          label: transactionNoun(stat.orders, t),
                        })
                      : t("sales_loading_transactions")
                  }
                />
              ) : (
                <View style={styles.emptyCard}>
                  <Ionicons name="receipt-outline" size={32} color={tokens.TEXT_DIM} />
                  <Text style={styles.emptyTitle}>{t("sales_no_transactions")}</Text>
                  <Text style={styles.emptyBody}>{t("sales_try_different_time_range")}</Text>
                </View>
              )
            }
          />
          <OrderDetailModal
            sale={detailSale}
            order={detailOrder}
            loading={detailLoading}
            error={detailError}
            onClose={closeOrderDetail}
          />
        </SafeAreaView>
      </Modal>
      <Modal
        visible={exportOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !exporting && setExportOpen(false)}
      >
        <Pressable
          style={styles.exportBackdrop}
          onPress={() => !exporting && setExportOpen(false)}
        >
          <Pressable style={styles.exportSheet} onPress={() => {}}>
            <View style={styles.exportHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.exportTitle}>{t("sales_export_title")}</Text>
                <Text style={styles.exportSubtitle} numberOfLines={1}>
                  {txnLoading || txnLoadedKey !== txnPeriodKey
                    ? t("sales_loading_transactions")
                    : allTxnPeriodLabel}
                </Text>
              </View>
              <Pressable
                disabled={!!exporting}
                onPress={() => setExportOpen(false)}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.exportClose,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons name="close" size={18} color={tokens.TEXT_DIM} />
              </Pressable>
            </View>

            <Text style={styles.exportSectionLabel}>{t("sales_export_format_label")}</Text>
            <View style={styles.exportFormatRow}>
              {(["pdf", "csv"] as const).map((fmt) => {
                const selected = exportFormat === fmt;
                const isPdf = fmt === "pdf";
                return (
                  <Pressable
                    key={fmt}
                    disabled={!!exporting}
                    onPress={() => {
                      haptic.selection();
                      setExportFormat(fmt);
                    }}
                    style={({ pressed }) => [
                      styles.exportFormatTile,
                      selected && styles.exportFormatTileOn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.exportFormatIcon,
                        {
                          backgroundColor: selected
                            ? isPdf
                              ? tokens.GOLD_DIM
                              : tokens.ACCENT_DIM
                            : tokens.CARD_BORDER,
                        },
                      ]}
                    >
                      <Ionicons
                        name={isPdf ? "document-outline" : "document-text-outline"}
                        size={18}
                        color={selected ? (isPdf ? tokens.GOLD : tokens.ACCENT) : tokens.TEXT_DIM}
                      />
                    </View>
                    <Text
                      style={[
                        styles.exportFormatTitle,
                        selected && { color: tokens.TEXT },
                      ]}
                    >
                      {isPdf ? t("sales_export_pdf") : t("sales_export_csv")}
                    </Text>
                    <Text
                      style={styles.exportFormatDesc}
                      numberOfLines={2}
                    >
                      {isPdf ? t("sales_export_pdf_desc") : t("sales_export_csv_desc")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              disabled={!!exporting}
              onPress={() => {
                haptic.selection();
                setExportIncludeTxn((v) => {
                  const next = !v;
                  // Kick off the (potentially slow) transactions fetch the
                  // moment the user opts in, so the wait happens here
                  // instead of after they press Download.
                  if (next && !txnLoading && txnLoadedKey !== txnPeriodKey) {
                    fetchAll();
                  }
                  return next;
                });
              }}
              style={({ pressed }) => [
                styles.exportToggleRow,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.exportCheckbox,
                  exportIncludeTxn && styles.exportCheckboxOn,
                ]}
              >
                {exportIncludeTxn ? (
                  <Ionicons name="checkmark" size={14} color="#181e38" />
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.exportRowTitle}>{t("sales_export_include_txn")}</Text>
                <Text style={styles.exportRowDesc}>{t("sales_export_include_txn_desc")}</Text>
              </View>
            </Pressable>

            <Pressable
              disabled={
                !!exporting ||
                (exportIncludeTxn && (txnLoading || txnLoadedKey !== txnPeriodKey))
              }
              onPress={() => handleExport(exportFormat)}
              style={({ pressed }) => [
                styles.exportCta,
                pressed && { opacity: 0.85 },
                !!exporting && styles.exportCtaDisabled,
                !exporting &&
                  exportIncludeTxn &&
                  (txnLoading || txnLoadedKey !== txnPeriodKey) &&
                  styles.exportCtaLoading,
              ]}
            >
              {!exporting &&
              exportIncludeTxn &&
              (txnLoading || txnLoadedKey !== txnPeriodKey) ? (
                <View style={styles.exportCtaSkeleton}>
                  <ShimmerSkeleton width={18} height={18} radius={9} />
                  <ShimmerSkeleton width={140} height={12} radius={4} />
                  <ShimmerSkeleton width={48} height={12} radius={4} />
                </View>
              ) : (
                <>
                  <Ionicons
                    name={exporting ? "hourglass-outline" : "download-outline"}
                    size={16}
                    color="#181e38"
                  />
                  <Text style={styles.exportCtaText}>
                    {exporting
                      ? t("sales_loading_transactions")
                      : t("sales_export_download", {
                          format: exportFormat.toUpperCase(),
                        })}
                  </Text>
                </>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      {exportToast ? (
        <View pointerEvents="none" style={styles.exportToast}>
          <Text style={styles.exportToastText}>{exportToast}</Text>
        </View>
      ) : null}
      <DateRangePickerModal
        visible={pickerOpen}
        initialStart={customStart}
        initialEnd={customEnd}
        maxDate={today}
        onClose={() => setPickerOpen(false)}
        onApply={(s, e) => {
          setCustomStart(s);
          setCustomEnd(e);
          setPeriod("custom");
          setPickerOpen(false);
          haptic.success();
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (t: ThemeTokens) => StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: t.BG },
  container: { flex: 1, backgroundColor: "transparent" },
  content: { padding: SCREEN_PADDING, paddingTop: 8, paddingBottom: 140, gap: 22 },
  pressed: { opacity: 0.7 },

  // Top bar — matches dashboard rhythm
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  eyebrow: {
    color: t.TEXT_FAINT,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: t.TEXT,
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  dateSubtitle: {
    color: t.TEXT_DIM,
    fontSize: 12,
    fontWeight: "500",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },

  // Period — underline text tabs
  periodTabs: {
    flexDirection: "row",
    gap: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  periodTab: {
    paddingVertical: 10,
    alignItems: "center",
  },
  periodTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: t.TEXT_DIM,
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  periodTabTextActive: {
    color: t.TEXT,
    fontWeight: "700",
  },
  periodTabTextDisabled: {
    opacity: 0.5,
  },
  periodTabUnderline: {
    height: 2,
    width: "100%",
    borderRadius: 1,
    backgroundColor: "transparent",
  },
  periodTabUnderlineActive: {
    backgroundColor: t.GOLD,
  },

  // Date pager — unified pill navigator
  datePager: {
    flexDirection: "row",
    alignItems: "stretch",
    height: 48,
    marginTop: 10,
    marginBottom: 2,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    backgroundColor: t.CARD,
    overflow: "hidden",
  },
  pagerArrow: {
    width: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  pagerArrowPressed: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  pagerArrowDisabled: {
    opacity: 0.35,
  },
  pagerDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "center",
    height: 24,
    backgroundColor: t.CARD_BORDER,
  },
  pagerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    gap: 2,
  },
  pagerLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pagerLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: t.TEXT,
    letterSpacing: -0.2,
  },
  pagerCurrentDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: t.GOLD,
    marginLeft: 2,
  },
  pagerCurrentTag: {
    fontSize: 9,
    fontWeight: "700",
    color: t.GOLD,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  pagerJump: {
    fontSize: 10,
    fontWeight: "600",
    color: t.GOLD,
    letterSpacing: 0.4,
    textTransform: "uppercase",
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
    backgroundColor: t.GOLD,
    width: 10,
  },
  heroLabel: {
    color: t.TEXT_DIM,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  heroValue: {
    color: t.TEXT,
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
  heroHint: { color: t.TEXT_DIM, fontSize: 12, fontWeight: "500" },

  // KPI row — flat with hairline dividers
  kpiRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  kpiCell: {
    flex: 1,
    gap: 6,
    paddingHorizontal: 4,
  },
  kpiDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: t.CARD_BORDER,
    marginHorizontal: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "700",
    color: t.TEXT,
    marginTop: 4,
    letterSpacing: -0.4,
  },
  kpiLabel: { fontSize: 11, color: t.TEXT_DIM, fontWeight: "500" },

  // Generic flat block (replaces card)
  block: {
    gap: 8,
  },
  // Tighter SectionLabel rhythm used in the stacked Payment Mix → Revenue by
  // Module → Transactions stretch so the sections don't feel adrift.
  tightSectionLabel: {
    marginTop: 10,
    marginBottom: 6,
  },
  // Unified revenue-breakdown card: Payment Mix + Revenue by Module inside one
  // bordered surface with an internal hairline divider. Reads as a single
  // "where did the money come from?" chapter instead of two floating blocks.
  breakdownGroup: {
    marginTop: 12,
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
  },
  breakdownSection: {
    gap: 8,
  },
  breakdownSectionLabel: {
    marginTop: 10,
    marginBottom: 6,
  },
  breakdownDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.CARD_BORDER,
    marginTop: 14,
    marginBottom: 2,
  },
  // Plain whitespace gap between Payment Mix and Revenue by Module subsections
  // — no hairline so the two flow visually inside the unified card.
  breakdownGap: {
    height: 10,
  },
  // Chapter-break header: stronger top margin separates the Transactions
  // CTA from the revenue-breakdown card above.
  txnChapterLabel: {
    marginTop: 18,
    marginBottom: 2,
  },
  sectionHint: { fontSize: 11, color: t.TEXT_DIM, fontWeight: "600" },

  // Top items section — "See all" / collapse chip in SectionLabel right slot
  topItemsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  topItemsChipPressed: { opacity: 0.5 },
  topItemsChipText: {
    fontSize: 12,
    color: t.TEXT_DIM,
    fontWeight: "600",
  },

  // Statement card — itemised storeStatistics breakdown
  statementCard: {
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
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
    backgroundColor: t.CARD_BORDER,
  },
  statementLabel: {
    color: t.TEXT_DIM,
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
  },
  statementLabelEmphasis: {
    color: t.TEXT,
    fontWeight: "600",
  },
  statementLabelTotal: {
    color: t.TEXT,
    fontWeight: "700",
    fontSize: 14,
  },
  statementValue: {
    color: t.TEXT,
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
    color: t.DANGER,
  },
  statementSubLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  statementSubGlyph: {
    color: t.TEXT_FAINT,
    fontSize: 12,
    fontWeight: "500",
  },
  statementSubLabel: {
    color: t.TEXT_DIM,
    fontSize: 12,
    fontWeight: "500",
    flexShrink: 1,
  },
  statementSubValue: {
    color: t.TEXT,
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
    color: t.TEXT_FAINT,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },

  // Abnormal transactions
  abnormalCard: {
    paddingVertical: 4,
  },
  abnormalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  abnormalIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  abnormalBody: {
    flex: 1,
    gap: 2,
  },
  abnormalLabel: {
    color: t.TEXT,
    fontSize: 13,
    fontWeight: "600",
  },
  abnormalCount: {
    color: t.TEXT_DIM,
    fontSize: 11,
    fontWeight: "500",
  },
  abnormalAmount: {
    color: t.TEXT,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
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
  legendName: { fontSize: 11, color: t.TEXT, fontWeight: "600" },
  legendPct: { fontSize: 11, color: t.TEXT_DIM, fontWeight: "500" },

  // Module list
  moduleList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  moduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  moduleRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  moduleLeft: { flexDirection: "row", alignItems: "center", gap: 6, width: 84 },
  moduleDot: { width: 8, height: 8, borderRadius: 4 },
  moduleName: { fontSize: 12, color: t.TEXT, fontWeight: "600" },
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
    color: t.TEXT,
    letterSpacing: -0.2,
  },
  // Unified payment-methods row: name (flexes) · amount · % — sits on the
  // same moduleList container so it shares the hairline-top divider.
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  paymentAmount: {
    fontSize: 12,
    fontWeight: "700",
    color: t.TEXT,
    letterSpacing: -0.2,
    marginLeft: "auto",
  },
  paymentPct: {
    width: 40,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
    color: t.TEXT_DIM,
  },

  // Top items rows — image thumbnail (with medal badge for top 3) + name +
  // units + revenue. Mirrors the dashboard's top-items row.
  topItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  topItemThumb: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: t.GOLD_DIM,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  topItemThumbImage: {
    width: "100%",
    height: "100%",
  },
  topItemThumbText: {
    color: t.GOLD,
    fontSize: 14,
    fontWeight: "700",
  },
  topItemRankBadge: {
    position: "absolute",
    top: -4,
    left: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.BG,
  },
  topItemRankBadgeGold: { backgroundColor: t.GOLD },
  topItemRankBadgeSilver: { backgroundColor: "#c0c4cc" },
  topItemRankBadgeBronze: { backgroundColor: "#cd7f32" },
  topItemRankBadgeText: {
    color: "#181e38",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  topItemName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: t.TEXT,
  },
  topItemUnits: {
    fontSize: 11,
    fontWeight: "600",
    color: t.TEXT_DIM,
    width: 40,
    textAlign: "right",
  },

  // Empty-state breakdown card
  emptyBreakdownInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  emptyBreakdownIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBreakdownTextWrap: { flex: 1 },
  emptyBreakdownTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: t.TEXT,
    marginBottom: 2,
  },
  emptyBreakdownMessage: {
    fontSize: 11,
    color: t.TEXT_DIM,
    lineHeight: 15,
  },

  // Search — focus-aware pill
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 30,
  },
  searchRowFocused: {
    borderColor: t.CARD_BORDER,
    backgroundColor: t.CARD,
  },
  searchInput: {
    flex: 1,
    color: t.TEXT,
    fontSize: 14,
    fontWeight: "500",
    padding: 0,
    letterSpacing: -0.1,
  },

  // Status filter — underline text tabs (matches period tabs)
  statusTabsScroll: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  statusTabs: {
    flexDirection: "row",
    gap: 24,
    paddingRight: 10,
  },
  statusTab: {
    paddingVertical: 10,
    alignItems: "center",
    flexShrink: 0,
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
    color: t.TEXT_DIM,
    letterSpacing: 0.2,
  },
  statusTabTextActive: {
    color: t.TEXT,
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
    backgroundColor: t.GOLD_DIM,
  },
  statusTabCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: t.TEXT_DIM,
    letterSpacing: 0.1,
  },
  statusTabCountTextActive: {
    color: t.GOLD,
  },
  statusTabUnderline: {
    height: 2,
    width: "100%",
    borderRadius: 1,
    backgroundColor: "transparent",
  },
  statusTabUnderlineActive: {
    backgroundColor: t.GOLD,
  },

  // Section header (sticky day grouping)
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: t.BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: t.TEXT_DIM,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  sectionHeaderTotal: { fontSize: 12, fontWeight: "700", color: t.GOLD, letterSpacing: -0.2 },

  // Transactions — flat rows like dashboard order list
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  txnRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
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
  txnId: { fontSize: 13, fontWeight: "700", color: t.TEXT, flexShrink: 1, letterSpacing: -0.1 },
  modTag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  modTagText: { fontSize: 10, fontWeight: "700" },
  txnSub: { fontSize: 11, color: t.TEXT_DIM, fontWeight: "500" },

  txnRight: { alignItems: "flex-end", gap: 4 },
  txnTotal: { fontSize: 15, fontWeight: "700", color: t.TEXT, letterSpacing: -0.3 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 10, fontWeight: "600", letterSpacing: 0.2 },

  // See-all transactions hero CTA — redesigned: vertical gold accent strip,
  // larger animated count, refined typography, and a filled gold action pill.
  txnHeroCard: {
    marginTop: 4,
    flexDirection: "row",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  txnHeroCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
  },
  txnHeroAccent: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: t.GOLD,
  },
  txnHeroInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  txnHeroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.GOLD + "14",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.GOLD + "33",
  },
  txnHeroBody: { flex: 1, gap: 4 },
  txnHeroEyebrow: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
    color: t.TEXT_FAINT,
    textTransform: "uppercase",
  },
  txnHeroCountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  txnHeroCount: {
    fontSize: 28,
    fontWeight: "800",
    color: t.TEXT,
    letterSpacing: -0.8,
  },
  txnHeroCountLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: t.TEXT_DIM,
  },
  txnHeroHint: {
    fontSize: 11,
    fontWeight: "500",
    color: t.TEXT_DIM,
    letterSpacing: 0.1,
  },
  txnHeroCtaPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.GOLD,
  },

  // See-all transactions hero CTA — replaces the inline preview list.
  seeAllCard: {
    marginTop: 4,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  seeAllCardPressed: { opacity: 0.85 },
  seeAllAccent: {
    height: 3,
    backgroundColor: t.GOLD,
    opacity: 0.9,
  },
  seeAllInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  seeAllIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.GOLD + "1f",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.GOLD + "33",
  },
  seeAllBody: { flex: 1, gap: 2 },
  seeAllEyebrow: {
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: "700",
    color: t.TEXT_FAINT,
  },
  seeAllCountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  seeAllCount: {
    fontSize: 22,
    fontWeight: "800",
    color: t.TEXT,
    letterSpacing: -0.6,
  },
  seeAllCountLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: t.TEXT_DIM,
  },
  seeAllHint: {
    fontSize: 11,
    fontWeight: "500",
    color: t.TEXT_DIM,
  },
  seeAllChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.GOLD + "1f",
  },

  // All-transactions modal
  allTxnContainer: { flex: 1, backgroundColor: t.BG },
  allTxnHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 24,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  allTxnHeaderText: { flex: 1, gap: 2 },
  allTxnEyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
    color: t.TEXT_FAINT,
  },
  allTxnTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: t.TEXT,
    letterSpacing: -0.4,
  },
  allTxnSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: t.TEXT_DIM,
  },
  allTxnCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  allTxnList: { flex: 1, backgroundColor: "transparent" },
  allTxnContent: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 8,
    paddingBottom: 32,
  },
  allTxnControls: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 10,
    gap: 10,
  },
  allTxnLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 56,
    paddingHorizontal: 24,
    gap: 14,
  },
  allTxnLoadingTitle: {
    color: t.TEXT,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
    marginTop: 4,
  },
  allTxnLoadingHint: {
    color: t.TEXT_DIM,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },

  // Empty
  emptyCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    borderStyle: "dashed",
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  emptyTitle: { color: t.TEXT, fontSize: 14, fontWeight: "700", marginTop: 4 },
  emptyBody: { color: t.TEXT_DIM, fontSize: 12, fontWeight: "500", textAlign: "center" },
  emptyBtn: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: t.GOLD,
  },
  emptyBtnText: { color: "#181e38", fontWeight: "700", fontSize: 12 },

  // Date range picker modal
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  pickerCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: t.BG,
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    gap: 12,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerTitle: {
    color: t.TEXT,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  pickerCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  pickerSummary: {
    color: t.GOLD,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  pickerMonthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  pickerMonthLabel: {
    color: t.TEXT,
    fontSize: 15,
    fontWeight: "700",
  },
  pickerWeekHeader: {
    flexDirection: "row",
  },
  pickerWeekday: {
    flex: 1,
    textAlign: "center",
    color: t.TEXT_DIM,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  pickerGrid: {
    flexDirection: "column",
  },
  pickerRow: {
    flexDirection: "row",
  },
  pickerCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  pickerCellRangeBg: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 0,
    right: 0,
    backgroundColor: t.GOLD_DIM,
    opacity: 0.25,
  },
  pickerCellRangeBgLeft: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 0,
    right: "50%",
    backgroundColor: t.GOLD_DIM,
    opacity: 0.25,
  },
  pickerCellRangeBgRight: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: "50%",
    right: 0,
    backgroundColor: t.GOLD_DIM,
    opacity: 0.25,
  },
  pickerDay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerDayPressed: {
    backgroundColor: t.CARD,
  },
  pickerDayActive: {
    backgroundColor: t.GOLD,
  },
  pickerDayDisabled: {
    opacity: 0.3,
  },
  pickerDayText: {
    color: t.TEXT,
    fontSize: 13,
    fontWeight: "600",
  },
  pickerDayTextActive: {
    color: "#181e38",
    fontWeight: "800",
  },
  pickerDayTextDisabled: {
    color: t.TEXT_FAINT,
  },
  pickerActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  pickerSecondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  pickerSecondaryBtnText: {
    color: t.TEXT,
    fontSize: 13,
    fontWeight: "700",
  },
  pickerPrimaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.GOLD,
  },
  pickerPrimaryBtnDisabled: {
    opacity: 0.4,
  },
  pickerPrimaryBtnText: {
    color: "#181e38",
    fontSize: 13,
    fontWeight: "800",
  },

  // Export sheet
  exportBackdrop: {
    flex: 1,
    backgroundColor: "rgba(8,10,20,0.55)",
    justifyContent: "flex-end",
  },
  exportSheet: {
    backgroundColor: t.BG_ELEVATED,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -8 },
    elevation: 24,
  },
  exportHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  exportClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  exportTitle: {
    color: t.TEXT,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  exportSubtitle: {
    color: t.TEXT_DIM,
    fontSize: 12,
    marginTop: 2,
  },
  exportSectionLabel: {
    color: t.TEXT_FAINT,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  exportFormatRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  exportFormatTile: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.CARD_BORDER,
    backgroundColor: t.BG,
    gap: 8,
  },
  exportFormatTileOn: {
    borderColor: t.GOLD,
    backgroundColor: "rgba(212,175,55,0.06)",
  },
  exportFormatIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  exportFormatTitle: {
    color: t.TEXT_DIM,
    fontSize: 14,
    fontWeight: "700",
  },
  exportFormatDesc: {
    color: t.TEXT_FAINT,
    fontSize: 11,
    lineHeight: 15,
  },
  exportToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: t.BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    marginBottom: 16,
  },
  exportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    backgroundColor: t.BG,
  },
  exportRowActive: {
    opacity: 0.6,
  },
  exportIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  exportCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: t.CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  exportCheckboxOn: {
    backgroundColor: t.GOLD,
    borderColor: t.GOLD,
  },
  exportRowTitle: {
    color: t.TEXT,
    fontSize: 14,
    fontWeight: "700",
  },
  exportRowDesc: {
    color: t.TEXT_DIM,
    fontSize: 11,
    marginTop: 2,
  },
  exportCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: t.GOLD,
  },
  exportCtaDisabled: {
    opacity: 0.5,
  },
  exportCtaLoading: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  exportCtaSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
  },
  exportCtaText: {
    color: "#181e38",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  exportToast: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 180,
    backgroundColor: "rgba(20,20,24,0.95)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  exportToastText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
});
