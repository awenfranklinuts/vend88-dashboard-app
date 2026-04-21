import React from "react";
import { View, Text, StyleSheet } from "react-native";
import {
  EYEBROW,
  SCREEN_TITLE,
  SCREEN_SUBTITLE,
  SPACE_XS,
  SPACE_SM,
  SPACE_LG,
} from "@/src/theme/tokens";

interface ScreenHeaderProps {
  /** Uppercase eyebrow text shown above the title (e.g. "CATALOG"). */
  eyebrow?: string;
  /** Main screen title. */
  title: string;
  /** Optional secondary line beneath the title. */
  subtitle?: string;
  /** Element rendered on the right side (action buttons, badges). */
  right?: React.ReactNode;
}

/**
 * Standardized screen header for all dashboard tabs.
 * Structure: [eyebrow] → [title (+ right)] → [subtitle]
 */
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: ScreenHeaderProps) {
  return (
    <View style={styles.wrap}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SPACE_LG,
  },
  eyebrow: {
    ...EYEBROW,
    marginBottom: SPACE_XS,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACE_SM,
  },
  title: {
    ...SCREEN_TITLE,
    flex: 1,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE_SM,
  },
  subtitle: {
    ...SCREEN_SUBTITLE,
    marginTop: 4,
  },
});
