import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// Thin wrapper so haptics silently no-op on web and unsupported platforms.
const enabled = Platform.OS === "ios" || Platform.OS === "android";

export const haptic = {
  selection() {
    if (!enabled) return;
    Haptics.selectionAsync().catch(() => {});
  },
  light() {
    if (!enabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium() {
    if (!enabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  success() {
    if (!enabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning() {
    if (!enabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  error() {
    if (!enabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
