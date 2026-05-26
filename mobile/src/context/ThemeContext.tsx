import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";

import {
  ThemeTokens,
  darkTokens,
  lightTokens,
} from "../theme/tokens";

const THEME_KEY = "vend88-theme-mode";

export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  mode: ThemeMode;
  /** Resolved scheme actually in use ("light" | "dark"). */
  scheme: "light" | "dark";
  tokens: ThemeTokens;
  ready: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [ready, setReady] = useState(false);

  // Load persisted preference once. Default = dark.
  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(THEME_KEY);
        if (stored === "light" || stored === "dark") {
          setModeState(stored);
        } else if (stored === "system") {
          // Migrate legacy "system" preference to dark default.
          setModeState("dark");
          try {
            await SecureStore.setItemAsync(THEME_KEY, "dark");
          } catch {
            // Ignore persistence errors.
          }
        }
      } catch {
        // Ignore — fall back to default.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    try {
      await SecureStore.setItemAsync(THEME_KEY, next);
    } catch {
      // Ignore persistence errors.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const tokens = mode === "light" ? lightTokens : darkTokens;
    return { mode, scheme: mode, tokens, ready, setMode };
  }, [mode, ready, setMode]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

/** Convenience: just the resolved colour tokens. */
export function useThemeTokens(): ThemeTokens {
  return useTheme().tokens;
}
