import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { haptic } from "../utils/haptics";
import { useThemeTokens } from "../context/ThemeContext";
import type { ThemeTokens } from "../theme/tokens";

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function parseISODate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  const d = new Date(y, mo, da);
  if (
    d.getFullYear() !== y ||
    d.getMonth() !== mo ||
    d.getDate() !== da
  ) {
    return null;
  }
  return d;
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildMonthRows(viewMonth: Date): (Date | null)[][] {
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const daysInMonth = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth() + 1,
    0
  ).getDate();
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

export function SingleDatePickerModal({
  visible,
  initialDate,
  onClose,
  onApply,
  title = "Select date",
  applyLabel = "Apply",
  clearLabel = "Clear",
}: {
  visible: boolean;
  /** ISO date string (YYYY-MM-DD) or null. */
  initialDate: string | null;
  onClose: () => void;
  /** Returns ISO date string (YYYY-MM-DD). */
  onApply: (isoDate: string) => void;
  title?: string;
  applyLabel?: string;
  clearLabel?: string;
}) {
  const tokens = useThemeTokens();
  const s = useMemo(() => makeStyles(tokens), [tokens]);
  const initialDateObj = useMemo(() => parseISODate(initialDate), [initialDate]);
  // Start of today (local time) — used as the minimum selectable date.
  const todayStart = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);
  const [viewMonth, setViewMonth] = useState<Date>(
    () => monthStart(initialDateObj ?? new Date())
  );
  const [pending, setPending] = useState<Date | null>(initialDateObj);

  useEffect(() => {
    if (visible) {
      const parsed = parseISODate(initialDate);
      // If the initial date is in the past, don't preselect it — the user
      // must pick a valid (today or future) date.
      const validInitial =
        parsed && parsed.getTime() >= todayStart.getTime() ? parsed : null;
      setPending(validInitial);
      setViewMonth(monthStart(validInitial ?? todayStart));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const rows = useMemo(() => buildMonthRows(viewMonth), [viewMonth]);
  const monthLabel = viewMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  // Disable the back-arrow once the visible month is at or before today's month.
  const canGoPrevMonth =
    viewMonth.getFullYear() > todayStart.getFullYear() ||
    (viewMonth.getFullYear() === todayStart.getFullYear() &&
      viewMonth.getMonth() > todayStart.getMonth());

  const handleDayPress = (d: Date) => {
    if (d.getTime() < todayStart.getTime()) {
      haptic.warning();
      return;
    }
    haptic.selection();
    setPending(d);
  };

  const isSameDay = (a: Date | null, b: Date | null) =>
    !!a && !!b && dayKey(a) === dayKey(b);

  const canApply = !!pending;
  const summary = pending ? formatLongDate(pending) : "Pick a date";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.header}>
            <Text style={s.title}>{title}</Text>
            <Pressable
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [s.closeBtn, pressed && s.pressed]}
            >
              <Ionicons name="close" size={18} color={tokens.TEXT} />
            </Pressable>
          </View>

          <Text style={s.summary}>{summary}</Text>

          <View style={s.monthBar}>
            <Pressable
              accessibilityLabel="Previous month"
              disabled={!canGoPrevMonth}
              onPress={() => {
                if (!canGoPrevMonth) {
                  haptic.warning();
                  return;
                }
                haptic.selection();
                setViewMonth((m) => {
                  const x = new Date(m);
                  x.setMonth(x.getMonth() - 1);
                  return x;
                });
              }}
              style={({ pressed }) => [
                s.pagerArrow,
                !canGoPrevMonth && s.pagerArrowDisabled,
                pressed && canGoPrevMonth && s.pressed,
              ]}
              hitSlop={6}
            >
              <Ionicons
                name="chevron-back"
                size={18}
                color={canGoPrevMonth ? tokens.TEXT : tokens.TEXT_FAINT}
              />
            </Pressable>
            <Text style={s.monthLabel}>{monthLabel}</Text>
            <Pressable
              accessibilityLabel="Next month"
              onPress={() => {
                haptic.selection();
                setViewMonth((m) => {
                  const x = new Date(m);
                  x.setMonth(x.getMonth() + 1);
                  return x;
                });
              }}
              style={({ pressed }) => [s.pagerArrow, pressed && s.pressed]}
              hitSlop={6}
            >
              <Ionicons name="chevron-forward" size={18} color={tokens.TEXT} />
            </Pressable>
          </View>

          <View style={s.weekHeader}>
            {WEEKDAY_LABELS.map((w) => (
              <Text key={w} style={s.weekday}>
                {w}
              </Text>
            ))}
          </View>

          <View style={s.grid}>
            {rows.map((row, ri) => (
              <View key={`r-${ri}`} style={s.rowR}>
                {row.map((d, ci) => {
                  if (!d) {
                    return <View key={`e-${ri}-${ci}`} style={s.cell} />;
                  }
                  const active = isSameDay(d, pending);
                  const disabled = d.getTime() < todayStart.getTime();
                  return (
                    <View key={dayKey(d)} style={s.cell}>
                      <Pressable
                        disabled={disabled}
                        onPress={() => handleDayPress(d)}
                        style={({ pressed }) => [
                          s.day,
                          active && s.dayActive,
                          disabled && s.dayDisabled,
                          pressed && !active && !disabled && s.dayPressed,
                        ]}
                      >
                        <Text
                          style={[
                            s.dayText,
                            active && s.dayTextActive,
                            disabled && s.dayTextDisabled,
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

          <View style={s.actions}>
            <Pressable
              accessibilityLabel="Clear date"
              onPress={() => {
                haptic.selection();
                setPending(null);
              }}
              style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
            >
              <Text style={s.secondaryBtnText}>{clearLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Apply date"
              disabled={!canApply}
              onPress={() => {
                if (!canApply || !pending) {
                  haptic.warning();
                  return;
                }
                onApply(dayKey(pending));
              }}
              style={({ pressed }) => [
                s.primaryBtn,
                !canApply && s.primaryBtnDisabled,
                pressed && canApply && s.pressed,
              ]}
            >
              <Text style={s.primaryBtnText}>{applyLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  pressed: { opacity: 0.7 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: t.BG_ELEVATED,
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: t.TEXT,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  summary: {
    color: t.GOLD,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  pagerArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  pagerArrowDisabled: { opacity: 0.4 },
  monthLabel: { color: t.TEXT, fontSize: 15, fontWeight: "700" },
  weekHeader: { flexDirection: "row" },
  weekday: {
    flex: 1,
    textAlign: "center",
    color: t.TEXT_DIM,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  grid: { flexDirection: "column" },
  rowR: { flexDirection: "row" },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  day: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dayPressed: { backgroundColor: t.CARD },
  dayActive: { backgroundColor: t.GOLD },
  dayDisabled: { opacity: 0.3 },
  dayText: { color: t.TEXT, fontSize: 13, fontWeight: "600" },
  dayTextActive: { color: t.TEXT_INVERSE, fontWeight: "800" },
  // Kept for parity with range picker (not used here but harmless).
  dayTextDisabled: { color: t.TEXT_FAINT },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  secondaryBtnText: { color: t.TEXT, fontSize: 13, fontWeight: "700" },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.GOLD,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: t.TEXT_INVERSE, fontSize: 13, fontWeight: "800" },
});
