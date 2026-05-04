import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
  cancelAnimation,
} from "react-native-reanimated";
import { GOLD } from "../theme/tokens";

type Props = {
  visible: boolean;
};

/**
 * TopProgressBar — Thin animated bar at the top of the screen, similar to
 * YouTube, GitHub, and Linear. Provides clear "something is loading" feedback
 * without disrupting the layout or hiding existing data.
 */
export function TopProgressBar({ visible }: Props) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 150 });
      progress.value = 0;
      progress.value = withRepeat(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.cubic) }),
        -1,
        false
      );
    } else {
      // Quick finish animation, then fade out
      cancelAnimation(progress);
      progress.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
      opacity.value = withSequence(
        withTiming(1, { duration: 200 }),
        withTiming(0, { duration: 250 })
      );
    }
  }, [visible, progress, opacity]);

  const barStyle = useAnimatedStyle(() => {
    // Indeterminate sliding bar: a 30% wide segment that moves left → right
    const translateX = interpolate(progress.value, [0, 1], [-30, 100]);
    return {
      transform: [{ translateX: `${translateX}%` as any }],
      opacity: opacity.value,
    };
  });

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.track, containerStyle]} pointerEvents="none">
      <Animated.View style={[styles.bar, barStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    overflow: "hidden",
    zIndex: 1000,
  },
  bar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "30%",
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
});
