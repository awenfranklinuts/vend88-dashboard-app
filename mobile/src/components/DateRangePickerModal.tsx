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
import {
  BG,
  CARD,
  CARD_BORDER,
  GOLD,
  GOLD_DIM,
  TEXT,
  TEXT_DIM,
  TEXT_FAINT,
} from "../theme/tokens";

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function formatShortDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${m}/${d.getFullYear()}`;
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

export function DateRangePickerModal({
  visible,
  initialStart,
  initialEnd,
  maxDate,
  onClose,
  onApply,
  title = "Custom range",
}: {
  visible: boolean;
  initialStart: Date | null;
  initialEnd: Date | null;
  maxDate: Date;
  onClose: () => void;
  onApply: (start: Date, end: Date) => void;
  title?: string;
}) {
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    monthStart(initialStart ?? maxDate)
  );
  const [pendingStart, setPendingStart] = useState<Date | null>(initialStart);
  const [pendingEnd, setPendingEnd] = useState<Date | null>(initialEnd);

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
      setPendingStart(d);
      setPendingEnd(null);
      return;
    }
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
      ? `${formatShortDate(pendingStart)} – select end`
      : "Select start date";

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
              <Ionicons name="close" size={18} color={TEXT} />
            </Pressable>
          </View>

          <Text style={s.summary}>{rangeSummary}</Text>

          <View style={s.monthBar}>
            <Pressable
              accessibilityLabel="Previous month"
              onPress={() => {
                haptic.selection();
                setViewMonth((m) => {
                  const x = new Date(m);
                  x.setMonth(x.getMonth() - 1);
                  return x;
                });
              }}
              style={({ pressed }) => [s.pagerArrow, pressed && s.pressed]}
              hitSlop={6}
            >
              <Ionicons name="chevron-back" size={18} color={TEXT} />
            </Pressable>
            <Text style={s.monthLabel}>{monthLabel}</Text>
            <Pressable
              accessibilityLabel="Next month"
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
                s.pagerArrow,
                !canGoNextMonth && s.pagerArrowDisabled,
                pressed && canGoNextMonth && s.pressed,
              ]}
              hitSlop={6}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={canGoNextMonth ? TEXT : TEXT_FAINT}
              />
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
                  const disabled = d > maxDate;
                  const isStart = isSameDay(d, pendingStart);
                  const isEnd = isSameDay(d, pendingEnd);
                  const between = inRange(d);
                  const isRangeEdgeStart = isStart && !!pendingEnd;
                  const isRangeEdgeEnd = isEnd && !!pendingStart;
                  return (
                    <View key={dayKey(d)} style={s.cell}>
                      {between && <View style={s.cellRangeBg} />}
                      {isRangeEdgeStart && <View style={s.cellRangeBgRight} />}
                      {isRangeEdgeEnd && <View style={s.cellRangeBgLeft} />}
                      <Pressable
                        disabled={disabled}
                        onPress={() => handleDayPress(d)}
                        style={({ pressed }) => [
                          s.day,
                          (isStart || isEnd) && s.dayActive,
                          disabled && s.dayDisabled,
                          pressed && !disabled && !isStart && !isEnd && s.dayPressed,
                        ]}
                      >
                        <Text
                          style={[
                            s.dayText,
                            (isStart || isEnd) && s.dayTextActive,
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
              accessibilityLabel="Clear range"
              onPress={() => {
                haptic.selection();
                setPendingStart(null);
                setPendingEnd(null);
              }}
              style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
            >
              <Text style={s.secondaryBtnText}>Clear</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Apply range"
              disabled={!canApply}
              onPress={() => {
                if (!canApply || !pendingStart || !pendingEnd) {
                  haptic.warning();
                  return;
                }
                onApply(pendingStart, pendingEnd);
              }}
              style={({ pressed }) => [
                s.primaryBtn,
                !canApply && s.primaryBtnDisabled,
                pressed && canApply && s.pressed,
              ]}
            >
              <Text style={s.primaryBtnText}>Apply</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
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
    backgroundColor: BG,
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: TEXT,
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
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  summary: {
    color: GOLD,
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
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  pagerArrowDisabled: { opacity: 0.4 },
  monthLabel: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "700",
  },
  weekHeader: { flexDirection: "row" },
  weekday: {
    flex: 1,
    textAlign: "center",
    color: TEXT_DIM,
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
  cellRangeBg: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 0,
    right: 0,
    backgroundColor: GOLD_DIM,
    opacity: 0.25,
  },
  cellRangeBgLeft: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 0,
    right: "50%",
    backgroundColor: GOLD_DIM,
    opacity: 0.25,
  },
  cellRangeBgRight: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: "50%",
    right: 0,
    backgroundColor: GOLD_DIM,
    opacity: 0.25,
  },
  day: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dayPressed: { backgroundColor: CARD },
  dayActive: { backgroundColor: GOLD },
  dayDisabled: { opacity: 0.3 },
  dayText: { color: TEXT, fontSize: 13, fontWeight: "600" },
  dayTextActive: { color: "#181e38", fontWeight: "800" },
  dayTextDisabled: { color: TEXT_FAINT },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  secondaryBtnText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "700",
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GOLD,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: {
    color: "#181e38",
    fontSize: 13,
    fontWeight: "800",
  },
});
