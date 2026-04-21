// Shared design tokens for the VEND 88 dashboard.
// Keep in sync with the login page's dark/gold aesthetic.

export const BG = "#0F1427";
export const BG_ELEVATED = "#161b33";
export const CARD = "rgba(255,255,255,0.035)";
export const CARD_BORDER = "rgba(255,255,255,0.07)";
export const CARD_HOVER = "rgba(255,255,255,0.06)";

export const GOLD = "#d4af37";
export const GOLD_DIM = "rgba(212,175,55,0.15)";
export const ACCENT = "#4064dc";
export const ACCENT_DIM = "rgba(64,100,220,0.15)";

export const TEXT = "rgba(255,255,255,0.92)";
export const TEXT_DIM = "rgba(255,255,255,0.45)";
export const TEXT_FAINT = "rgba(255,255,255,0.25)";

export const SUCCESS = "#10b981";
export const SUCCESS_DIM = "rgba(16,185,129,0.12)";
export const WARNING = "#f59e0b";
export const WARNING_DIM = "rgba(245,158,11,0.12)";
export const DANGER = "#ef4444";
export const DANGER_DIM = "rgba(239,68,68,0.15)";

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
