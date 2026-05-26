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
import { useThemeTokens } from "../context/ThemeContext";
import { ThemeTokens } from "../theme/tokens";

type Props = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width = "100%", height = 16, radius = 8, style }: Props) {
  const progress = useSharedValue(0);
  const tokens = useThemeTokens();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0.35, 0.65, 0.35]),
  }));

  return (
    <Animated.View
      style={[
        styles.base,
        { width: width as any, height, borderRadius: radius },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function SkeletonCard({ height = 80, style }: { height?: number; style?: ViewStyle }) {
  return <Skeleton height={height} radius={16} style={style} />;
}

export function SkeletonRow({ gap = 8, children }: { gap?: number; children?: React.ReactNode }) {
  return <View style={[{ flexDirection: "row" }, { gap }]}>{children}</View>;
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    base: {
      backgroundColor: t.CARD_HOVER,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.CARD_BORDER,
    },
    row: { flexDirection: "row" },
  });
