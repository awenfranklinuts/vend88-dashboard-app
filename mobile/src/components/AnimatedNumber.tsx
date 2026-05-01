import { useEffect, useState } from "react";
import { Text, TextStyle } from "react-native";

type Props = {
  value: number;
  duration?: number;
  style?: TextStyle | TextStyle[];
  prefix?: string;
  suffix?: string;
  decimals?: number;
  maxDecimals?: number;
  separator?: boolean;
};

// Lightweight count-up animation using setInterval on the JS thread.
// Avoids running Reanimated worklets for a text node (which can't be animated directly).
export function AnimatedNumber({
  value,
  duration = 900,
  style,
  prefix = "",
  suffix = "",
  decimals = 0,
  maxDecimals,
  separator = true,
}: Props) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const start = display;
    const end = value;
    const startTime = Date.now();
    let frame: ReturnType<typeof setInterval>;

    frame = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setDisplay(current);
      if (progress >= 1) clearInterval(frame);
    }, 16);

    return () => clearInterval(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const formatted = (() => {
    let fixed: string;
    if (maxDecimals !== undefined) {
      fixed = display.toFixed(maxDecimals).replace(/\.?0+$/, "");
    } else {
      fixed = display.toFixed(decimals);
    }
    if (!separator) return fixed;
    const [int, dec] = fixed.split(".");
    const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return dec ? `${withSep}.${dec}` : withSep;
  })();

  return <Text style={style}>{`${prefix}${formatted}${suffix}`}</Text>;
}
