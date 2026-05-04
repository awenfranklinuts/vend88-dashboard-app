import { useEffect } from "react";
import { ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

type Props = {
  fading: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
};

/**
 * FadingContent — Subtly dims content (60% opacity) while data is being fetched.
 * Keeps existing data visible so users have context, but signals that an update
 * is in progress. Used together with TopProgressBar.
 */
export function FadingContent({ fading, children, style }: Props) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withTiming(fading ? 0.5 : 1, {
      duration: 200,
      easing: Easing.inOut(Easing.ease),
    });
  }, [fading, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
