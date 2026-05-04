import { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { CARD_BORDER, CARD } from "../theme/tokens";

type Props = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

/**
 * Shimmer Skeleton — Modern loading placeholder with animated gradient shimmer.
 * Better visual polish than basic opacity pulsing.
 */
export function ShimmerSkeleton({
  width = "100%",
  height = 16,
  radius = 8,
  style,
}: Props) {
  const shimmerProgress = useSharedValue(0);

  useEffect(() => {
    shimmerProgress.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [shimmerProgress]);

  const animatedStyle = useAnimatedStyle(() => {
    // Shimmer moves from left to right across the skeleton
    const translateX = interpolate(shimmerProgress.value, [0, 1], [-300, 300]);
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View
      style={[
        styles.container,
        { width: width as any, height, borderRadius: radius, overflow: "hidden" },
        style,
      ]}
    >
      <View style={[styles.base, { borderRadius: radius }]} />
      <Animated.View style={[animatedStyle, { position: "absolute" }]}>
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.1)", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ width: 300, height: height }}
        />
      </Animated.View>
    </View>
  );
}

/**
 * Shimmer Card — Skeleton card with shimmer effect.
 */
export function ShimmerSkeletonCard({
  height = 80,
  style,
}: {
  height?: number;
  style?: ViewStyle;
}) {
  return <ShimmerSkeleton height={height} radius={16} style={style} />;
}

/**
 * Loading Hero — Placeholder for hero section (revenue card).
 */
export function LoadingHero() {
  return (
    <View style={styles.heroContainer}>
      <View style={styles.heroContent}>
        <ShimmerSkeleton width="60%" height={14} radius={4} />
        <View style={{ height: 8 }} />
        <ShimmerSkeleton width="80%" height={40} radius={8} />
        <View style={{ height: 12 }} />
        <ShimmerSkeleton width="40%" height={12} radius={4} />
      </View>
    </View>
  );
}

/**
 * Loading KPI Row — Placeholder for KPI metrics.
 */
export function LoadingKpiRow() {
  return (
    <View style={styles.kpiRowContainer}>
      <View style={styles.kpiCell}>
        <ShimmerSkeleton width="24" height={24} radius={4} />
        <View style={{ height: 8 }} />
        <ShimmerSkeleton width="80%" height={16} radius={3} />
        <View style={{ height: 4 }} />
        <ShimmerSkeleton width="60%" height={11} radius={2} />
      </View>
      <View style={styles.kpiCell}>
        <ShimmerSkeleton width="24" height={24} radius={4} />
        <View style={{ height: 8 }} />
        <ShimmerSkeleton width="70%" height={16} radius={3} />
        <View style={{ height: 4 }} />
        <ShimmerSkeleton width="50%" height={11} radius={2} />
      </View>
      <View style={styles.kpiCell}>
        <ShimmerSkeleton width="24" height={24} radius={4} />
        <View style={{ height: 8 }} />
        <ShimmerSkeleton width="75%" height={16} radius={3} />
        <View style={{ height: 4 }} />
        <ShimmerSkeleton width="55%" height={11} radius={2} />
      </View>
    </View>
  );
}

/**
 * Loading Statement — Placeholder for statement card.
 */
export function LoadingStatement() {
  return (
    <View style={styles.statementContainer}>
      <View style={styles.statementRow}>
        <ShimmerSkeleton width="40%" height={12} radius={3} />
        <ShimmerSkeleton width="30%" height={12} radius={3} />
      </View>
      <View style={{ height: 12 }} />
      <View style={styles.statementRow}>
        <ShimmerSkeleton width="50%" height={16} radius={4} />
        <ShimmerSkeleton width="35%" height={16} radius={4} />
      </View>
      <View style={{ height: 16 }} />
      <View style={styles.statementRow}>
        <ShimmerSkeleton width="45%" height={12} radius={3} />
        <ShimmerSkeleton width="28%" height={12} radius={3} />
      </View>
      <View style={{ height: 8 }} />
      <View style={styles.statementRow}>
        <ShimmerSkeleton width="40%" height={12} radius={3} />
        <ShimmerSkeleton width="32%" height={12} radius={3} />
      </View>
      <View style={{ height: 8 }} />
      <View style={styles.statementRow}>
        <ShimmerSkeleton width="35%" height={12} radius={3} />
        <ShimmerSkeleton width="25%" height={12} radius={3} />
      </View>
      <View style={{ height: 16 }} />
      <View style={styles.statementRow}>
        <ShimmerSkeleton width="55%" height={14} radius={3} />
        <ShimmerSkeleton width="30%" height={14} radius={3} />
      </View>
    </View>
  );
}

/**
 * Loading Module Breakdown — Placeholder for module revenue breakdown.
 */
export function LoadingModuleBreakdown() {
  return (
    <View style={styles.moduleBreakdownContainer}>
      <ShimmerSkeleton width="40%" height={12} radius={3} />
      <View style={{ height: 16 }} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.moduleBreakdownRow}>
          <ShimmerSkeleton width="8" height={8} radius={4} />
          <ShimmerSkeleton width="30%" height={12} radius={3} />
          <ShimmerSkeleton width="25%" height={12} radius={3} />
        </View>
      ))}
    </View>
  );
}

/**
 * Loading Transaction List — Placeholder for transaction items.
 */
export function LoadingTransactionList() {
  return (
    <View style={styles.transactionListContainer}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.transactionItemLoader}>
          <View style={styles.transactionLoaderLeft}>
            <ShimmerSkeleton width="25%" height={12} radius={3} />
            <View style={{ height: 4 }} />
            <ShimmerSkeleton width="40%" height={10} radius={2} />
          </View>
          <ShimmerSkeleton width="20%" height={12} radius={3} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: CARD,
    position: "relative",
  },
  base: {
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    width: "100%",
    height: "100%",
  },
  heroContainer: {
    backgroundColor: CARD,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 20,
    gap: 12,
  },
  heroContent: {
    gap: 8,
  },
  kpiRowContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 16,
  },
  kpiCell: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  statementContainer: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 16,
    gap: 4,
  },
  statementRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  moduleBreakdownContainer: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 16,
    gap: 8,
  },
  moduleBreakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  transactionListContainer: {
    gap: 8,
    paddingTop: 12,
  },
  transactionItemLoader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 12,
  },
  transactionLoaderLeft: {
    flex: 1,
    gap: 4,
  },
});
