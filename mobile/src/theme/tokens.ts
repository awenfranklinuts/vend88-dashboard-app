// Shared design tokens for the VEND 88 dashboard.
// Two palettes (dark + light) are available. Legacy named exports below
// stay pointed at the dark palette so files that have not been migrated
// to `useThemeTokens()` remain visually consistent until they are.

export type ThemeTokens = {
  BG: string;
  BG_ELEVATED: string;
  CARD: string;
  CARD_BORDER: string;
  CARD_HOVER: string;

  GOLD: string;
  GOLD_DIM: string;
  ACCENT: string;
  ACCENT_DIM: string;

  TEXT: string;
  TEXT_DIM: string;
  TEXT_FAINT: string;
  TEXT_INVERSE: string;

  SUCCESS: string;
  SUCCESS_DIM: string;
  WARNING: string;
  WARNING_DIM: string;
  DANGER: string;
  DANGER_DIM: string;

  /** Shimmer highlight overlay color (used by ShimmerSkeleton gradient). */
  SHIMMER: string;

  /** Status bar style hint, e.g. "light" or "dark". */
  STATUS_BAR: "light" | "dark";

  /** Soft drop‑shadow values for elevated cards. In dark mode these are
   *  effectively no-ops (opacity 0); in light mode they give cards real lift. */
  SHADOW_COLOR: string;
  SHADOW_OPACITY: number;
  SHADOW_RADIUS: number;
  SHADOW_OFFSET_Y: number;
  SHADOW_ELEVATION: number;
};

export const darkTokens: ThemeTokens = {
  BG: "#0F1427",
  BG_ELEVATED: "#161b33",
  CARD: "rgba(255,255,255,0.035)",
  CARD_BORDER: "rgba(255,255,255,0.07)",
  CARD_HOVER: "rgba(255,255,255,0.06)",

  GOLD: "#d4af37",
  GOLD_DIM: "rgba(212,175,55,0.15)",
  ACCENT: "#4064dc",
  ACCENT_DIM: "rgba(64,100,220,0.15)",

  TEXT: "rgba(255,255,255,0.92)",
  TEXT_DIM: "rgba(255,255,255,0.45)",
  TEXT_FAINT: "rgba(255,255,255,0.25)",
  TEXT_INVERSE: "#11131c",

  SUCCESS: "#10b981",
  SUCCESS_DIM: "rgba(16,185,129,0.12)",
  WARNING: "#f59e0b",
  WARNING_DIM: "rgba(245,158,11,0.12)",
  DANGER: "#ef4444",
  DANGER_DIM: "rgba(239,68,68,0.15)",

  SHIMMER: "rgba(255,255,255,0.1)",

  STATUS_BAR: "light",

  // Dark mode relies on borders + translucent cards — no shadow needed.
  SHADOW_COLOR: "#000000",
  SHADOW_OPACITY: 0,
  SHADOW_RADIUS: 0,
  SHADOW_OFFSET_Y: 0,
  SHADOW_ELEVATION: 0,
};

export const lightTokens: ThemeTokens = {
  // Warm iOS‑style grouped background — noticeably grey so white cards lift.
  BG: "#F2F2F7",
  BG_ELEVATED: "#FFFFFF",
  CARD: "#FFFFFF",
  // Warm hairline (iOS separator hue) at a soft opacity — visible but not drawn-on.
  CARD_BORDER: "rgba(60,60,67,0.10)",
  CARD_HOVER: "rgba(60,60,67,0.04)",

  GOLD: "#a8801f",
  GOLD_DIM: "rgba(168,128,31,0.14)",
  ACCENT: "#3650b8",
  ACCENT_DIM: "rgba(54,80,184,0.12)",

  TEXT: "rgba(17,19,28,0.92)",
  TEXT_DIM: "rgba(60,60,67,0.62)",
  TEXT_FAINT: "rgba(60,60,67,0.42)",
  TEXT_INVERSE: "#ffffff",

  SUCCESS: "#0f9d6c",
  SUCCESS_DIM: "rgba(15,157,108,0.12)",
  WARNING: "#c97a05",
  WARNING_DIM: "rgba(201,122,5,0.14)",
  DANGER: "#d23636",
  DANGER_DIM: "rgba(210,54,54,0.12)",

  SHIMMER: "rgba(60,60,67,0.06)",

  STATUS_BAR: "dark",

  // Soft, low‑contrast lift for white cards on a grey background.
  SHADOW_COLOR: "#0B0F1A",
  SHADOW_OPACITY: 0.08,
  SHADOW_RADIUS: 14,
  SHADOW_OFFSET_Y: 4,
  SHADOW_ELEVATION: 3,
};

/**
 * Returns the RN style fragment that gives cards real elevation in light
 * mode (and is a no‑op in dark mode). Spread into any "card" StyleSheet entry:
 *
 *   card: { ...cardShadow(t), backgroundColor: t.CARD, ... }
 */
export function cardShadow(t: ThemeTokens) {
  return {
    shadowColor: t.SHADOW_COLOR,
    shadowOpacity: t.SHADOW_OPACITY,
    shadowRadius: t.SHADOW_RADIUS,
    shadowOffset: { width: 0, height: t.SHADOW_OFFSET_Y },
    elevation: t.SHADOW_ELEVATION,
  };
}

// Legacy named exports (dark palette). New code should prefer the
// `useThemeTokens()` hook from `src/context/ThemeContext`.
export const BG = darkTokens.BG;
export const BG_ELEVATED = darkTokens.BG_ELEVATED;
export const CARD = darkTokens.CARD;
export const CARD_BORDER = darkTokens.CARD_BORDER;
export const CARD_HOVER = darkTokens.CARD_HOVER;

export const GOLD = darkTokens.GOLD;
export const GOLD_DIM = darkTokens.GOLD_DIM;
export const ACCENT = darkTokens.ACCENT;
export const ACCENT_DIM = darkTokens.ACCENT_DIM;

export const TEXT = darkTokens.TEXT;
export const TEXT_DIM = darkTokens.TEXT_DIM;
export const TEXT_FAINT = darkTokens.TEXT_FAINT;

export const SUCCESS = darkTokens.SUCCESS;
export const SUCCESS_DIM = darkTokens.SUCCESS_DIM;
export const WARNING = darkTokens.WARNING;
export const WARNING_DIM = darkTokens.WARNING_DIM;
export const DANGER = darkTokens.DANGER;
export const DANGER_DIM = darkTokens.DANGER_DIM;

export const RADIUS_SM = 10;
export const RADIUS_MD = 14;
export const RADIUS_LG = 18;
export const RADIUS_XL = 22;

// Spacing scale (8px rhythm)
export const SPACE_XS = 4;
export const SPACE_SM = 8;
export const SPACE_MD = 16;
export const SPACE_LG = 24;
export const SPACE_XL = 32;
export const SPACE_2XL = 48;

// Typography presets for consistent hierarchy
export const EYEBROW = {
  fontSize: 10,
  fontWeight: "700" as const,
  letterSpacing: 2,
  color: TEXT_DIM,
  textTransform: "uppercase" as const,
};

export const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: "700" as const,
  letterSpacing: 1.5,
  color: TEXT_DIM,
  textTransform: "uppercase" as const,
};

export const SCREEN_TITLE = {
  fontSize: 26,
  fontWeight: "800" as const,
  color: TEXT,
  letterSpacing: -0.2,
};

export const SCREEN_SUBTITLE = {
  fontSize: 13,
  fontWeight: "500" as const,
  color: TEXT_DIM,
};

// Screen horizontal padding (consistent gutter)
export const SCREEN_PADDING = 20;
