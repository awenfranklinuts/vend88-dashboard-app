import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { SECTION_LABEL, SPACE_SM, SPACE_MD } from "../theme/tokens";
import { useThemeTokens } from "../context/ThemeContext";

interface SectionLabelProps {
  label: string;
  /** Optional element rendered on the right (count, action link). */
  right?: React.ReactNode;
  /** Optional dot/indicator rendered to the left of the label. */
  leading?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Standardized uppercase section label for grouping content blocks.
 * e.g. "ACTIVE", "OFFLINE", "SECURITY", "PREFERENCES"
 */
export function SectionLabel({
  label,
  right,
  leading,
  style,
}: SectionLabelProps) {
  const tokens = useThemeTokens();
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.left}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <Text style={[styles.label, { color: tokens.TEXT_DIM }]}>{label}</Text>
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACE_SM,
    marginTop: SPACE_MD,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE_SM,
  },
  leading: {
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    ...SECTION_LABEL,
  },
});
