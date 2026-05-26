import { useEffect, useMemo } from "react";
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
import { useThemeTokens } from "../context/ThemeContext";
import { ThemeTokens } from "../theme/tokens";

function useShimmerStyles() {
  const tokens = useThemeTokens();
  return useMemo(() => ({ tokens, styles: makeStyles(tokens) }), [tokens]);
}

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
  const { tokens, styles } = useShimmerStyles();
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
          colors={["transparent", tokens.SHIMMER, "transparent"]}
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
 * Loading Hero — Flat placeholder for the hero revenue block.
 * Matches the dashboard's `bootHero` look: eyebrow + period dots row,
 * a tall value bar, then a small badge + hint meta row. No card chrome.
 */
export function LoadingHero() {
  const { styles } = useShimmerStyles();
  return (
    <View style={styles.heroContainer}>
      <View style={styles.heroHeadRow}>
        <ShimmerSkeleton width={140} height={10} radius={3} />
        <View style={styles.heroDots}>
          <ShimmerSkeleton width={6} height={6} radius={3} />
          <ShimmerSkeleton width={14} height={6} radius={3} />
          <ShimmerSkeleton width={6} height={6} radius={3} />
          <ShimmerSkeleton width={6} height={6} radius={3} />
        </View>
      </View>
      <ShimmerSkeleton width="62%" height={40} radius={6} style={styles.heroValue} />
      <View style={styles.heroMetaRow}>
        <ShimmerSkeleton width={56} height={14} radius={7} />
        <ShimmerSkeleton width={140} height={10} radius={3} />
      </View>
    </View>
  );
}

/**
 * Loading KPI Row — Flat 3-cell row with hairline dividers, mirroring the
 * real KPI row layout: small icon, large value, small caption per cell.
 */
export function LoadingKpiRow() {
  const { styles } = useShimmerStyles();
  return (
    <View style={styles.kpiRowContainer}>
      <View style={styles.kpiCell}>
        <ShimmerSkeleton width={16} height={16} radius={4} />
        <ShimmerSkeleton width="60%" height={20} radius={5} style={styles.kpiValue} />
        <ShimmerSkeleton width="75%" height={9} radius={3} />
      </View>
      <View style={styles.kpiDivider} />
      <View style={styles.kpiCell}>
        <ShimmerSkeleton width={16} height={16} radius={4} />
        <ShimmerSkeleton width="55%" height={20} radius={5} style={styles.kpiValue} />
        <ShimmerSkeleton width="70%" height={9} radius={3} />
      </View>
      <View style={styles.kpiDivider} />
      <View style={styles.kpiCell}>
        <ShimmerSkeleton width={16} height={16} radius={4} />
        <ShimmerSkeleton width="65%" height={20} radius={5} style={styles.kpiValue} />
        <ShimmerSkeleton width="70%" height={9} radius={3} />
      </View>
    </View>
  );
}

/**
 * Loading Statement — Flat itemised list of hairline-divided rows that
 * mirrors the real Statement table (label on the left, value on the right).
 */
export function LoadingStatement() {
  const rows: Array<{ l: `${number}%`; r: `${number}%`; bold?: boolean }> = [
    { l: "40%", r: "22%" },
    { l: "55%", r: "30%", bold: true },
    { l: "38%", r: "24%" },
    { l: "45%", r: "20%" },
    { l: "34%", r: "22%" },
    { l: "42%", r: "26%" },
    { l: "50%", r: "28%" },
  ];
  const { styles } = useShimmerStyles();
  return (
    <View style={styles.statementContainer}>
      <View style={styles.statementHeadRow}>
        <ShimmerSkeleton width={110} height={10} radius={3} />
        <ShimmerSkeleton width={70} height={10} radius={3} />
      </View>
      {rows.map((row, i) => (
        <View key={i} style={styles.statementRow}>
          <ShimmerSkeleton width={row.l} height={row.bold ? 14 : 12} radius={3} />
          <ShimmerSkeleton width={row.r} height={row.bold ? 14 : 12} radius={3} />
        </View>
      ))}
    </View>
  );
}

/**
 * Loading Module Breakdown — Flat list rows: color dot, label, mini bar,
 * value. Hairline divider between rows; no card background.
 */
export function LoadingModuleBreakdown() {
  const { styles } = useShimmerStyles();
  return (
    <View style={styles.moduleBreakdownContainer}>
      <View style={styles.statementHeadRow}>
        <ShimmerSkeleton width={140} height={10} radius={3} />
        <ShimmerSkeleton width={48} height={10} radius={3} />
      </View>
      {[0, 1, 2].map((i) => {
        const nameWidth = (`${52 - i * 6}%`) as `${number}%`;
        const barWidth = (`${30 + i * 6}%`) as `${number}%`;
        return (
          <View key={i} style={styles.moduleBreakdownRow}>
            <ShimmerSkeleton width={10} height={10} radius={5} />
            <View style={styles.moduleBreakdownLabel}>
              <ShimmerSkeleton width={nameWidth} height={12} radius={3} />
            </View>
            <View style={styles.moduleBreakdownBar}>
              <ShimmerSkeleton width={barWidth} height={4} radius={2} />
            </View>
            <ShimmerSkeleton width={54} height={12} radius={3} />
          </View>
        );
      })}
    </View>
  );
}

/**
 * Loading Transaction List — Flat hairline-divided rows mirroring the real
 * transaction items (avatar + id/sub + amount).
 */
export function LoadingTransactionList() {
  const { styles } = useShimmerStyles();
  return (
    <View style={styles.transactionListContainer}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.transactionItemLoader}>
          <ShimmerSkeleton width={36} height={36} radius={18} />
          <View style={styles.transactionLoaderLeft}>
            <ShimmerSkeleton width="38%" height={12} radius={3} />
            <ShimmerSkeleton width="58%" height={10} radius={3} />
          </View>
          <ShimmerSkeleton width={56} height={14} radius={3} />
        </View>
      ))}
    </View>
  );
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      backgroundColor: t.CARD,
      position: "relative",
    },
    base: {
      backgroundColor: t.CARD,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.CARD_BORDER,
      width: "100%",
      height: "100%",
    },
    heroContainer: {
      paddingVertical: 4,
      gap: 14,
    },
    heroHeadRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    heroDots: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    heroValue: {
      marginTop: 2,
    },
    heroMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    kpiRowContainer: {
      flexDirection: "row",
      alignItems: "stretch",
      marginTop: 8,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.CARD_BORDER,
    },
    kpiCell: {
      flex: 1,
      gap: 6,
      paddingHorizontal: 4,
      alignItems: "flex-start",
    },
    kpiDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: t.CARD_BORDER,
      marginVertical: 4,
    },
    kpiValue: {
      marginTop: 2,
    },
    statementContainer: {
      marginTop: 24,
      gap: 0,
    },
    statementHeadRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    statementRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.CARD_BORDER,
    },
    moduleBreakdownContainer: {
      marginTop: 24,
    },
    moduleBreakdownRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.CARD_BORDER,
    },
    moduleBreakdownLabel: {
      flexShrink: 0,
    },
    moduleBreakdownBar: {
      flex: 1,
    },
    transactionListContainer: {
      paddingTop: 4,
    },
    transactionItemLoader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.CARD_BORDER,
    },
    transactionLoaderLeft: {
      flex: 1,
      gap: 6,
    },
  });
