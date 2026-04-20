import { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

type Props = {
  color?: string;
  size?: number;
  active?: boolean;
  style?: ViewStyle;
};

export function PulsingDot({ color = "#10b981", size = 8, active = true, style }: Props) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    if (active) {
      scale.value = withRepeat(
        withTiming(2.2, { duration: 1400, easing: Easing.out(Easing.ease) }),
        -1,
        false
      );
      opacity.value = withRepeat(
        withTiming(0, { duration: 1400, easing: Easing.out(Easing.ease) }),
        -1,
        false
      );
    } else {
      scale.value = 1;
      opacity.value = 0;
    }
  }, [active, scale, opacity]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      {active && (
        <Animated.View
          style={[
            styles.ring,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
            ringStyle,
          ]}
        />
      )}
      <View
        style={[
          styles.core,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute" },
  core: {},
});
