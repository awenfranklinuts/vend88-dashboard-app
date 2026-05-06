// Smooth-curve hourly/daily revenue chart with sticky y-axis, pinch-to-zoom,
// horizontal swipe, and a draggable selected-point handle. Used by the
// dashboard detail modal for today/week/month periods.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  PanResponderGestureState,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  ScrollView,
} from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { CARD_BORDER, GOLD, SUCCESS, TEXT, TEXT_DIM, TEXT_FAINT } from "@/src/theme/tokens";
import { haptic } from "@/src/utils/haptics";

export type LinePoint = { day: string; revenue: number };

type Props = {
  data: LinePoint[];
  niceMax: number;
  ticks: number[]; // top → bottom values for gridlines (e.g. [niceMax, 0.75n, 0.5n, 0.25n, 0])
  avg: number;
  formatMoney: (n: number) => string;
  currentLabel?: string; // x-label of "now"; gets a vertical guide + active styling
  selectedIndex: number | null;
  onSelectIndex: (idx: number | null) => void;
  height?: number;
  /** Show only every Nth x-label. */
  xLabelEvery?: number;
  /** Min horizontal pixels per data point — chart becomes scrollable if it exceeds viewport. */
  minPointSpacing?: number;
  /** Lower bound for pinch-to-zoom (tighter view when zoomed out). */
  minPointSpacingFloor?: number;
  /** Upper bound for pinch-to-zoom (wider view when zoomed in). */
  minPointSpacingCeil?: number;
};

const Y_AXIS_W = 40;
const PADDING_RIGHT = 12;
const PADDING_TOP = 18;
const PADDING_BOTTOM = 28;

function buildSmoothPath(
  points: { x: number; y: number }[],
  yMin: number,
  yMax: number
): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y}`;
  }
  // Catmull–Rom → cubic bezier (tension = 0.5).
  // Reduce tension when adjacent y values differ sharply to avoid the curve
  // overshooting below the baseline (visible as a dip below 0 between two
  // non-zero neighbours surrounding a zero point).
  const baseT = 0.5;
  const clampY = (y: number) => Math.max(yMin, Math.min(yMax, y));
  const segs: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    // Adaptive tension: when the segment is a deep "valley" (one neighbour is
    // much lower than its surrounding peaks), shrink tension toward 0 so the
    // curve doesn't bow past the actual data point.
    const segHeight = Math.abs(p2.y - p1.y);
    const adjacentSpread = Math.max(
      Math.abs(p1.y - p0.y),
      Math.abs(p3.y - p2.y),
      segHeight
    );
    const ratio = adjacentSpread > 0 ? segHeight / adjacentSpread : 0;
    const t = baseT * (1 - 0.6 * Math.min(1, ratio));
    const c1x = p1.x + ((p2.x - p0.x) / 6) * t * 2;
    const c1y = clampY(p1.y + ((p2.y - p0.y) / 6) * t * 2);
    const c2x = p2.x - ((p3.x - p1.x) / 6) * t * 2;
    const c2y = clampY(p2.y - ((p3.y - p1.y) / 6) * t * 2);
    segs.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`);
  }
  return segs.join(" ");
}

export function TodayLineChart({
  data,
  niceMax,
  ticks,
  avg,
  formatMoney,
  currentLabel,
  selectedIndex,
  onSelectIndex,
  height = 280,
  xLabelEvery = 1,
  minPointSpacing = 36,
  minPointSpacingFloor = 12,
  minPointSpacingCeil = 96,
}: Props) {
  const [outerW, setOuterW] = useState(0);
  const [spacing, setSpacing] = useState(minPointSpacing);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const spacingAtPinchStart = useRef(minPointSpacing);
  const scrollRef = useRef<ScrollView>(null);
  const didAutoScroll = useRef(false);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== outerW) setOuterW(w);
  };

  const beginPinch = () => {
    spacingAtPinchStart.current = spacing;
  };

  const applyPinchScale = (scale: number) => {
    const next = spacingAtPinchStart.current * scale;
    const clamped = Math.max(
      minPointSpacingFloor,
      Math.min(minPointSpacingCeil, next)
    );
    if (Math.abs(clamped - spacing) > 0.5) {
      setSpacing(clamped);
    }
  };

  // Modern Gesture API: composes correctly with the native ScrollView on
  // Android (the legacy PinchGestureHandler was being starved of touches by
  // the inner ScrollView, so two-finger zoom never fired on Android).
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          runOnJS(beginPinch)();
        })
        .onUpdate((e) => {
          runOnJS(applyPinchScale)(e.scale);
        }),
    // beginPinch/applyPinchScale close over `spacing` via refs/setState — safe
    // to recreate when spacing changes so onBegin captures the latest value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spacing]
  );

  // Width available for the plot inside the ScrollView (subtract sticky y-axis on the left).
  const viewportPlotW = Math.max(0, outerW - Y_AXIS_W);

  // Effective spacing: when the user-controlled spacing would leave the data
  // narrower than the viewport (e.g. 7 weekday points × 36 px on a wide
  // phone), expand it so points span the full width by default. Pinch-zooming
  // in still increases spacing past this fit value; pinching out is bounded
  // by viewport-fit so the chart can't shrink into a corner.
  const fitSpacing =
    data.length > 1 && viewportPlotW > 0
      ? Math.max(0, viewportPlotW - PADDING_RIGHT) / (data.length - 1)
      : 0;
  const effectiveSpacing = Math.max(spacing, fitSpacing);

  // Natural plot width based on effective point spacing.
  const naturalPlotW =
    data.length > 1
      ? (data.length - 1) * effectiveSpacing + PADDING_RIGHT
      : viewportPlotW;

  // When the natural chart is wider than the viewport AND a "now" marker
  // exists, add half-viewport pad on each side so the current point can sit
  // at the horizontal centre. If the chart already fits, skip the pad —
  // otherwise the data would be squashed into the middle with empty space
  // on either side.
  const needsScroll = naturalPlotW > viewportPlotW + 0.5;
  const sidePad =
    currentLabel && needsScroll && viewportPlotW > 0
      ? Math.floor(viewportPlotW / 2)
      : 0;
  const intrinsicPlotW = Math.max(viewportPlotW, naturalPlotW + sidePad * 2);

  const innerH = Math.max(0, height - PADDING_TOP - PADDING_BOTTOM);
  const safeMax = niceMax > 0 ? niceMax : 1;

  const points = useMemo(() => {
    if (data.length === 0 || intrinsicPlotW <= 0 || innerH <= 0) return [];
    const usableW = Math.max(0, naturalPlotW - PADDING_RIGHT);
    const stepX = data.length > 1 ? usableW / (data.length - 1) : 0;
    return data.map((p, i) => ({
      x: sidePad + i * stepX,
      y: PADDING_TOP + (1 - p.revenue / safeMax) * innerH,
      revenue: p.revenue,
      day: p.day,
    }));
  }, [data, intrinsicPlotW, naturalPlotW, sidePad, innerH, safeMax]);

  const currentIdx = currentLabel
    ? data.findIndex((p) => p.day === currentLabel)
    : -1;

  // Only draw the line/area up to the current-time bucket so future periods
  // aren't rendered as flat-line zeros stretching to the end of the period.
  const linePoints = useMemo(() => {
    if (currentIdx < 0) return points;
    return points.slice(0, currentIdx + 1);
  }, [points, currentIdx]);

  const linePath = useMemo(
    () =>
      buildSmoothPath(
        linePoints.map((p) => ({ x: p.x, y: p.y })),
        PADDING_TOP,
        PADDING_TOP + innerH
      ),
    [linePoints, innerH]
  );

  const areaPath = useMemo(() => {
    if (linePoints.length === 0) return "";
    const baselineY = PADDING_TOP + innerH;
    const first = linePoints[0];
    const last = linePoints[linePoints.length - 1];
    return `${linePath} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
  }, [linePath, linePoints, innerH]);

  const avgY =
    avg > 0 && avg <= safeMax ? PADDING_TOP + (1 - avg / safeMax) * innerH : null;

  const selected = selectedIndex !== null ? points[selectedIndex] : null;
  const currentPoint = currentIdx >= 0 ? points[currentIdx] : null;

  // Pulsing ring around the "now" dot to indicate live/ongoing time.
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!currentPoint) return;
    pulseAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [currentPoint, pulseAnim]);
  const pulseR = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [4, 16] });
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0],
  });
  const dotPulseScale = pulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.35, 1],
  });
  const dotPulseR = Animated.multiply(dotPulseScale, 4);

  // Drag-scrub: while a point is selected, the user can grab a wide handle
  // around the dot/pill and drag horizontally to move the selection across hours.
  // We use refs so the PanResponder's stable handlers always read the latest
  // points/selected values.
  const HANDLE_RADIUS = 28;
  const pointsRef = useRef(points);
  const selectedRef = useRef(selected);
  const selectedIndexRef = useRef(selectedIndex);
  pointsRef.current = points;
  selectedRef.current = selected;
  selectedIndexRef.current = selectedIndex;
  const lastDragIdxRef = useRef<number | null>(null);
  const dragStartXRef = useRef<number>(0);
  const findNearestIndex = (x: number) => {
    const pts = pointsRef.current;
    if (pts.length === 0) return null;
    let best = 0;
    let bestDist = Math.abs(pts[0].x - x);
    for (let i = 1; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };
  const dragResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        // Anchor the gesture to the dot's x at the moment the drag begins.
        // Subsequent moves use cumulative dx so re-centring of the handle
        // (when selection changes) does not feed back into the calculation.
        const sel = selectedRef.current;
        dragStartXRef.current = sel ? sel.x : 0;
        lastDragIdxRef.current = selectedIndexRef.current;
        // Lock the parent horizontal ScrollView so the chart doesn't pan
        // while we're scrubbing the selection.
        setScrollEnabled(false);
      },
      onPanResponderMove: (_evt: GestureResponderEvent, g: PanResponderGestureState) => {
        const absX = dragStartXRef.current + g.dx;
        const idx = findNearestIndex(absX);
        if (idx === null) return;
        if (idx !== lastDragIdxRef.current) {
          lastDragIdxRef.current = idx;
          haptic.selection();
          onSelectIndex(idx);
        }
      },
      onPanResponderRelease: () => {
        lastDragIdxRef.current = null;
        setScrollEnabled(true);
      },
      onPanResponderTerminate: () => {
        lastDragIdxRef.current = null;
        setScrollEnabled(true);
      },
    })
  ).current;

  // Adaptive label density: when pinched in, show every label; pinched out, thin them.
  // Each label cell is ~36 px wide; ensure ≥ 36 px between visible labels.
  const effectiveLabelEvery = Math.max(
    xLabelEvery,
    Math.ceil(36 / Math.max(effectiveSpacing, 1))
  );

  // Re-arm auto-scroll whenever the data identity, period, or "now" bucket
  // changes (e.g. user switches Today/Week/Month tab inside the modal).
  React.useEffect(() => {
    didAutoScroll.current = false;
  }, [data, currentLabel]);

  // On first measurement (and after re-arm), scroll horizontally so "now" is
  // centred in view.
  React.useEffect(() => {
    if (didAutoScroll.current) return;
    if (currentIdx < 0 || viewportPlotW <= 0 || points.length === 0) return;
    const targetX = points[currentIdx]?.x ?? 0;
    const offset = Math.max(
      0,
      Math.min(intrinsicPlotW - viewportPlotW, targetX - viewportPlotW / 2)
    );
    scrollRef.current?.scrollTo({ x: offset, animated: false });
    didAutoScroll.current = true;
  }, [currentIdx, viewportPlotW, intrinsicPlotW, points]);

  return (
    <View style={[styles.wrap, { height }]} onLayout={onLayout}>
      {/* Sticky y-axis (gridline labels) on the left */}
      <View style={[styles.yAxis, { width: Y_AXIS_W, height }]} pointerEvents="none">
        {ticks.map((v, i) => {
          const top =
            PADDING_TOP +
            (ticks.length > 1 ? (i / (ticks.length - 1)) * innerH : 0) -
            6;
          return (
            <Text key={i} style={[styles.yLabel, { top }]}>
              {formatMoney(v)}
            </Text>
          );
        })}
      </View>

      {/* Scrollable + pinchable plot */}
      <GestureDetector gesture={pinchGesture}>
        <ScrollView
          ref={scrollRef}
          horizontal
          scrollEnabled={scrollEnabled}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ width: intrinsicPlotW }}
          style={[styles.scroll, { marginLeft: Y_AXIS_W }]}
          decelerationRate="fast"
        >
        <View style={{ width: intrinsicPlotW, height }}>
          {viewportPlotW > 0 && (
            <Svg width={intrinsicPlotW} height={height} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={GOLD} stopOpacity="0.45" />
                  <Stop offset="60%" stopColor={GOLD} stopOpacity="0.10" />
                  <Stop offset="100%" stopColor={GOLD} stopOpacity="0" />
                </LinearGradient>
              </Defs>

              {/* Gridlines */}
              {ticks.map((_, i) => {
                const y =
                  PADDING_TOP +
                  (ticks.length > 1 ? (i / (ticks.length - 1)) * innerH : 0);
                return (
                  <Line
                    key={i}
                    x1={0}
                    y1={y}
                    x2={intrinsicPlotW - PADDING_RIGHT}
                    y2={y}
                    stroke={CARD_BORDER}
                    strokeWidth={i === ticks.length - 1 ? 1 : StyleSheet.hairlineWidth}
                  />
                );
              })}

              {/* Current-time vertical guide */}
              {currentIdx >= 0 && points[currentIdx] && (
                <Line
                  x1={points[currentIdx].x}
                  y1={PADDING_TOP}
                  x2={points[currentIdx].x}
                  y2={PADDING_TOP + innerH}
                  stroke={GOLD}
                  strokeWidth={1}
                  strokeOpacity={0.25}
                  strokeDasharray="3,4"
                />
              )}

              {/* Area + line */}
              {areaPath && <Path d={areaPath} fill="url(#goldFill)" />}
              {linePath && (
                <Path
                  d={linePath}
                  stroke={GOLD}
                  strokeWidth={2}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Dots — hide future-period dots (after "now") so the
                  truncated line doesn't have orphaned points trailing it. */}
              {points.map((p, i) => {
                const isCurrent = i === currentIdx;
                const isSelected = i === selectedIndex;
                const isFuture = currentIdx >= 0 && i > currentIdx;
                if (isFuture && !isSelected) return null;
                if (isCurrent) return null; // rendered separately as animated pulse
                const isZero = p.revenue <= 0;
                const r = isSelected ? 5 : 2.5;
                return (
                  <Circle
                    key={`d-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill={isZero ? "#0F1427" : GOLD}
                    stroke={isZero ? TEXT_FAINT : GOLD}
                    strokeWidth={isSelected ? 2 : 1}
                    opacity={isZero && !isSelected ? 0.4 : 1}
                  />
                );
              })}

              {/* Flashing "now" dot with expanding pulse ring. */}
              {currentPoint && (
                <>
                  <AnimatedCircle
                    cx={currentPoint.x}
                    cy={currentPoint.y}
                    r={pulseR as unknown as number}
                    fill={GOLD}
                    opacity={pulseOpacity as unknown as number}
                  />
                  <AnimatedCircle
                    cx={currentPoint.x}
                    cy={currentPoint.y}
                    r={dotPulseR as unknown as number}
                    fill={GOLD}
                    stroke={GOLD}
                    strokeWidth={1}
                  />
                </>
              )}

              {/* Average dashed line */}
              {avgY !== null && (
                <Line
                  x1={0}
                  y1={avgY}
                  x2={intrinsicPlotW - PADDING_RIGHT}
                  y2={avgY}
                  stroke={SUCCESS}
                  strokeWidth={1.25}
                  strokeDasharray="5,4"
                  opacity={0.85}
                />
              )}

              {/* Selected vertical line */}
              {selected && (
                <Line
                  x1={selected.x}
                  y1={PADDING_TOP}
                  x2={selected.x}
                  y2={PADDING_TOP + innerH}
                  stroke={GOLD}
                  strokeWidth={1}
                  strokeOpacity={0.6}
                />
              )}
            </Svg>
          )}

          {/* Full-height tap columns — let users tap anywhere above an x-label to select that point.
              Width = spacing between adjacent points so columns tile the entire plot. */}
          {points.map((p, i) => {
            const prevX = i > 0 ? points[i - 1].x : p.x;
            const nextX = i < points.length - 1 ? points[i + 1].x : p.x;
            const halfLeft = (p.x - prevX) / 2 || 16;
            const halfRight = (nextX - p.x) / 2 || 16;
            const colLeft = p.x - halfLeft;
            const colWidth = halfLeft + halfRight;
            return (
              <Pressable
                key={`hit-${i}`}
                accessibilityLabel={`${data[i].day} ${formatMoney(data[i].revenue)}`}
                onPress={() => {
                  haptic.selection();
                  onSelectIndex(selectedIndex === i ? null : i);
                }}
                style={{
                  position: "absolute",
                  left: colLeft,
                  width: colWidth,
                  top: 0,
                  bottom: PADDING_BOTTOM,
                }}
              />
            );
          })}

          {/* X-axis labels, absolute-positioned at each point's x. */}
          {points.map((p, i) => {
            const original = data[i];
            const isCurrent = i === currentIdx;
            const isSelected = i === selectedIndex;
            const showLabel =
              effectiveLabelEvery <= 1 ||
              i === 0 ||
              i === data.length - 1 ||
              i === currentIdx ||
              i === selectedIndex ||
              i % effectiveLabelEvery === 0;
            return (
              <View
                key={`x-${original.day}-${i}`}
                pointerEvents="none"
                style={[
                  styles.xCell,
                  {
                    left: p.x - 18,
                    width: 36,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.xLabel,
                    isCurrent && styles.xLabelActive,
                    isSelected && styles.xLabelSelected,
                  ]}
                  numberOfLines={1}
                >
                  {showLabel ? original.day : ""}
                </Text>
              </View>
            );
          })}

          {/* Selected value pill above the dot */}
          {selected && (
            <View
              pointerEvents="none"
              style={[
                styles.pill,
                {
                  left: Math.max(4, Math.min(intrinsicPlotW - 80, selected.x - 36)),
                  top: Math.max(0, selected.y - 28),
                },
              ]}
            >
              <Text style={styles.pillText}>{formatMoney(selected.revenue)}</Text>
            </View>
          )}

          {/* Drag-scrub handle: invisible wide hit area centred on the selected dot.
              Lets users drag horizontally to scrub through hours. */}
          {selected && (
            <View
              {...dragResponder.panHandlers}
              style={{
                position: "absolute",
                left: selected.x - 28,
                top: 0,
                width: 56,
                bottom: PADDING_BOTTOM,
                // Transparent — the existing dot/pill remain the visual cue.
                backgroundColor: "transparent",
              }}
            />
          )}
        </View>
        </ScrollView>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    width: "100%",
    flexDirection: "row",
  },
  scroll: {
    flex: 1,
  },
  yAxis: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 2,
  },
  yLabel: {
    position: "absolute",
    left: 0,
    width: Y_AXIS_W - 4,
    textAlign: "right",
    color: TEXT_FAINT,
    fontSize: 9,
    fontWeight: "600",
  },
  xCell: {
    position: "absolute",
    bottom: 4,
    alignItems: "center",
    paddingTop: 4,
  },
  xLabel: {
    fontSize: 10,
    color: TEXT_DIM,
    fontWeight: "600",
  },
  xLabelActive: {
    color: TEXT,
    fontWeight: "700",
  },
  xLabelSelected: {
    color: GOLD,
    fontWeight: "700",
  },
  pill: {
    position: "absolute",
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: GOLD,
    alignItems: "center",
  },
  pillText: {
    color: "#181e38",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
