import React, { useEffect, useRef } from "react";
import Svg, { G, Circle, Text as SvgText } from "react-native-svg";
import { Animated, View, Text, Easing } from "react-native";

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
}

/**
 * Renders a donut/pie chart with labels and legend.
 * Animates a sweep when items change.
 */
export const DonutChart: React.FC<DonutChartProps> = ({
  items,
  width = 200,
  height = 200,
  radius = 60,
  strokeWidth = 30,
}) => {
  // Calculate percentages
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const segments = items.map((item) => ({
    ...item,
    percentage: total > 0 ? (item.value / total) * 100 : 0,
  }));

  const center = width / 2;
  const circumference = 2 * Math.PI * radius;

  // Sweep progress 0..1; replays when items change.
  const sweep = useRef(new Animated.Value(0)).current;
  // Build a stable signature that triggers replay when set of items or values change.
  const signature = items
    .map((it) => `${it.label}:${it.value.toFixed(2)}`)
    .join("|");

  useEffect(() => {
    sweep.setValue(0);
    Animated.timing(sweep, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animating SVG props
    }).start();
  }, [signature, sweep]);

  // Pre-compute cumulative offset (in pixels of arc length) for each segment.
  let cumulative = 0;
  const arcs = segments.map((segment) => {
    const fullLen = (segment.percentage / 100) * circumference;
    const offset = cumulative;
    cumulative += fullLen;
    return { ...segment, fullLen, offset };
  });

  return (
    <View>
      <Svg width={width} height={height}>
        <G rotation={-90} origin={`${center}, ${center}`}>
          {arcs.map((arc, index) => {
            // Animate length growth for each segment proportionally to its slice.
            const animatedLen = sweep.interpolate({
              inputRange: [0, 1],
              outputRange: [0, arc.fullLen],
            });
            // dasharray: [drawn, gap]; gap covers the rest of the circle.
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
                strokeLinecap="butt"
              />
            );
          })}
        </G>
      </Svg>

      {/* Legend */}
      <View style={{ marginTop: 16, gap: 8 }}>
        {segments.map((segment, index) => (
          <View key={`legend-${index}-${segment.label}`} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                backgroundColor: segment.color,
              }}
            />
            <Text
              style={{
                fontSize: 12,
                color: "#999",
                fontWeight: "500",
                flex: 1,
              }}
            >
              {segment.label}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: "#fff",
                fontWeight: "700",
              }}
            >
              {segment.percentage.toFixed(0)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

