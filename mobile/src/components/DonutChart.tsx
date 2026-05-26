import React, { useEffect, useMemo, useRef } from "react";
import Svg, { Circle, G } from "react-native-svg";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useThemeTokens } from "../context/ThemeContext";
import type { ThemeTokens } from "../theme/tokens";

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
  const tokens = useThemeTokens();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const trackStroke =
    tokens.STATUS_BAR === "dark"
      ? "rgba(17,19,28,0.08)"
      : "rgba(255,255,255,0.05)";
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

  // Pre-compute arc lengths and offsets, leaving a small gap between slices.
  // `key` is the segment label — assumed unique per dataset (dining options /
  // sales methods both use unique labels). This lets us match an arc across
  // renders so we can morph its length/offset instead of blanking the ring.
  const targetArcs = useMemo(() => {
    let cumulative = 0;
    return segments.map((segment) => {
      const rawLen = (segment.percentage / 100) * circumference;
      const drawLen = Math.max(0, rawLen - GAP);
      const offset = cumulative;
      cumulative += rawLen;
      return {
        key: segment.label,
        label: segment.label,
        color: segment.color,
        percentage: segment.percentage,
        drawLen,
        offset,
      };
    });
  }, [segments, circumference, GAP]);

  // Morph transition: a single 0→1 driver interpolates every arc's length
  // and offset from its previous on-screen value to the new target. New
  // slices grow from 0, removed slices shrink to 0, and reordered slices
  // slide to their new positions — no more "reset to zero and re-sweep"
  // flash on every data refresh.
  const morph = useRef(new Animated.Value(1)).current;
  const previousArcsRef = useRef<typeof targetArcs>([]);
  const sourceArcsRef = useRef<typeof targetArcs>([]);
  const hasMountedRef = useRef(false);

  const signature = items
    .map((it) => `${it.label}:${it.value.toFixed(2)}`)
    .join("|");

  // Snapshot the previous committed arcs as the morph source whenever the
  // data signature changes. We capture this during render (not in the
  // effect) so the JSX below can read consistent source values on the same
  // render where the new targets appear.
  const lastSignatureRef = useRef<string | null>(null);
  if (lastSignatureRef.current !== signature) {
    sourceArcsRef.current = previousArcsRef.current;
    lastSignatureRef.current = signature;
  }

  useEffect(() => {
    morph.setValue(0);
    Animated.timing(morph, {
      toValue: 1,
      // Slightly slower on the very first reveal so the initial grow-in
      // still feels deliberate, faster on subsequent refreshes so morphs
      // don't drag.
      duration: hasMountedRef.current ? 520 : 720,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        previousArcsRef.current = targetArcs;
        hasMountedRef.current = true;
      }
    });
  }, [signature, targetArcs, morph]);

  // Build the union of (previous ∪ current) arcs so removed slices can
  // animate down to zero before disappearing. Each render produces a stable
  // list keyed by label.
  const sourceByKey = new Map(sourceArcsRef.current.map((a) => [a.key, a]));
  const targetByKey = new Map(targetArcs.map((a) => [a.key, a]));
  const allKeys: string[] = [];
  const seen = new Set<string>();
  for (const a of targetArcs) {
    if (!seen.has(a.key)) {
      seen.add(a.key);
      allKeys.push(a.key);
    }
  }
  for (const a of sourceArcsRef.current) {
    if (!seen.has(a.key)) {
      seen.add(a.key);
      allKeys.push(a.key);
    }
  }

  const renderArcs = allKeys.map((key) => {
    const src = sourceByKey.get(key);
    const tgt = targetByKey.get(key);
    // For new arcs, start from 0-length at the target offset so they grow
    // out from where they will live. For removed arcs, target 0-length at
    // their current offset so they shrink in place.
    const fromLen = src ? src.drawLen : 0;
    const toLen = tgt ? tgt.drawLen : 0;
    const fromOffset = src ? src.offset : tgt ? tgt.offset : 0;
    const toOffset = tgt ? tgt.offset : src ? src.offset : 0;
    const color = (tgt ?? src)!.color;
    return { key, fromLen, toLen, fromOffset, toOffset, color };
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
            stroke={trackStroke}
            strokeWidth={strokeWidth}
          />
          {renderArcs.map((arc) => {
            const animatedLen = morph.interpolate({
              inputRange: [0, 1],
              outputRange: [arc.fromLen, arc.toLen],
            });
            const dashArray = animatedLen.interpolate({
              inputRange: [0, circumference],
              outputRange: [`0 ${circumference}`, `${circumference} 0`],
            });
            const animatedOffset = morph.interpolate({
              inputRange: [0, 1],
              outputRange: [-arc.fromOffset, -arc.toOffset],
            });
            return (
              <AnimatedCircle
                key={`arc-${arc.key}`}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeWidth}
                strokeDasharray={dashArray as unknown as string}
                strokeDashoffset={animatedOffset as unknown as number}
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

const makeStyles = (t: ThemeTokens) => StyleSheet.create({
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
    color: t.TEXT_FAINT,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  centerValue: {
    color: t.TEXT,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 2,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  centerMeta: {
    color: t.TEXT_DIM,
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
    color: t.TEXT_DIM,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  legendLabelLead: {
    color: t.TEXT,
    fontWeight: "700",
  },
  legendValue: {
    color: t.TEXT_FAINT,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.1,
    marginTop: 1,
  },
  legendPct: {
    color: t.TEXT,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
    minWidth: 38,
    textAlign: "right",
  },
});
