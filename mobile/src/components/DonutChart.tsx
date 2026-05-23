import React, { useEffect, useMemo, useRef } from "react";
import Svg, { Circle, G } from "react-native-svg";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface DonutChartItem {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  items: DonutChartItem[];
  width?: number;
  height?: number;
  radius?: number;
  strokeWidth?: number;
  /** Side-by-side donut + legend, or stacked donut over legend. */
  layout?: "row" | "stacked";
  /** Small label rendered above the main value in the donut center. */
  centerLabel?: string;
  /** Main value rendered inside the donut center. */
  centerValue?: string;
  /** Optional formatter so the legend can show real units (e.g. currency). */
  formatValue?: (value: number) => string;
}

/**
 * Visual treatment:
 *  • A faint background track ring sits behind the segments so partial data
 *    still feels like a complete chart instead of floating arcs.
 *  • Segments use rounded caps with a tiny inter-segment gap to read as
 *    discrete pills around the ring (modern donut style).
 *  • An optional centre label/value sits inside the ring, paired with a
 *    rich side legend that includes a thin progress bar, raw value, and %.
 */
export const DonutChart: React.FC<DonutChartProps> = ({
  items,
  width = 220,
  height = 220,
  radius = 78,
  strokeWidth = 14,
  layout = "row",
  centerLabel,
  centerValue,
  formatValue,
}) => {
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.value, 0),
    [items]
  );

  const segments = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        percentage: total > 0 ? (item.value / total) * 100 : 0,
      })),
    [items, total]
  );

  const center = width / 2;
  const circumference = 2 * Math.PI * radius;
  // Small inter-segment gap (arc length). Skip the gap entirely when there's
  // only a single visible slice so the ring looks continuous.
  const visibleCount = segments.filter((s) => s.percentage > 0).length;
  const GAP = visibleCount > 1 ? Math.min(4, circumference * 0.012) : 0;

  // Sweep replay when the data signature changes.
  const sweep = useRef(new Animated.Value(0)).current;
  const signature = items
    .map((it) => `${it.label}:${it.value.toFixed(2)}`)
    .join("|");

  useEffect(() => {
    sweep.setValue(0);
    Animated.timing(sweep, {
      toValue: 1,
      duration: 720,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [signature, sweep]);

  // Pre-compute arc lengths and offsets, leaving a small gap between slices.
  let cumulative = 0;
  const arcs = segments.map((segment) => {
    const rawLen = (segment.percentage / 100) * circumference;
    const drawLen = Math.max(0, rawLen - GAP);
    const offset = cumulative;
    cumulative += rawLen;
    return { ...segment, drawLen, offset };
  });

  // Resolve the centre display. Defaults to leading segment label + its share.
  const leading = segments[0];
  const resolvedCenterLabel = centerLabel ?? (leading ? "Top share" : undefined);
  const resolvedCenterValue =
    centerValue ?? (leading ? leading.label : undefined);
  const leadingPct = leading ? `${leading.percentage.toFixed(0)}%` : undefined;

  const Donut = (
    <View style={[styles.donutWrap, { width, height }]}>
      <Svg width={width} height={height}>
        <G rotation={-90} origin={`${center}, ${center}`}>
          {/* Background track ring */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={strokeWidth}
          />
          {arcs.map((arc, index) => {
            const animatedLen = sweep.interpolate({
              inputRange: [0, 1],
              outputRange: [0, arc.drawLen],
            });
            const dashArray = animatedLen.interpolate({
              inputRange: [0, circumference],
              outputRange: [`0 ${circumference}`, `${circumference} 0`],
            });
            return (
              <AnimatedCircle
                key={`arc-${index}-${arc.label}`}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeWidth}
                strokeDasharray={dashArray as unknown as string}
                strokeDashoffset={-arc.offset}
                strokeLinecap="round"
              />
            );
          })}
        </G>
      </Svg>

      {/* Centre summary — small label, big % of the leading segment, then
         that segment's name underneath. Keeps the ring's focal point on the
         most important number rather than the raw category list. */}
      {leading && (
        <View pointerEvents="none" style={styles.donutCenter}>
          {resolvedCenterLabel && (
            <Text style={styles.centerLabel} numberOfLines={1}>
              {resolvedCenterLabel}
            </Text>
          )}
          {leadingPct && (
            <Text style={styles.centerValue} numberOfLines={1}>
              {leadingPct}
            </Text>
          )}
          {resolvedCenterValue && (
            <Text style={styles.centerMeta} numberOfLines={1}>
              {resolvedCenterValue}
            </Text>
          )}
        </View>
      )}
    </View>
  );

  const Legend = (
    <View style={styles.legend}>
      {segments.map((segment, index) => {
        const isLead = index === 0 && segment.percentage > 0;
        return (
          <View
            key={`legend-${index}-${segment.label}`}
            style={styles.legendRow}
          >
            <View
              style={[styles.legendDot, { backgroundColor: segment.color }]}
            />
            <View style={styles.legendBody}>
              <Text
                style={[styles.legendLabel, isLead && styles.legendLabelLead]}
                numberOfLines={1}
              >
                {segment.label}
              </Text>
              {formatValue && (
                <Text style={styles.legendValue} numberOfLines={1}>
                  {formatValue(segment.value)}
                </Text>
              )}
            </View>
            <Text style={styles.legendPct}>
              {segment.percentage.toFixed(0)}%
            </Text>
          </View>
        );
      })}
    </View>
  );

  if (layout === "stacked") {
    return (
      <View style={styles.stackedContainer}>
        {Donut}
        <View style={styles.stackedLegend}>{Legend}</View>
      </View>
    );
  }

  return (
    <View style={styles.rowContainer}>
      {Donut}
      <View style={styles.rowLegend}>{Legend}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  rowContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  rowLegend: {
    flex: 1,
  },
  stackedContainer: {
    alignItems: "center",
    gap: 20,
  },
  stackedLegend: {
    alignSelf: "stretch",
  },
  donutWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  donutCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  centerLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  centerValue: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 2,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  centerMeta: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
    letterSpacing: 0.1,
    maxWidth: 110,
    textAlign: "center",
  },
  legend: {
    gap: 10,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendBody: {
    flex: 1,
    minWidth: 0,
  },
  legendLabel: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  legendLabelLead: {
    color: "rgba(255,255,255,0.95)",
    fontWeight: "700",
  },
  legendValue: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.1,
    marginTop: 1,
  },
  legendPct: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
    minWidth: 38,
    textAlign: "right",
  },
});
