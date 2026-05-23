import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "./AuthContext";

// expo-local-authentication is a native module; load it lazily so JS still
// evaluates if the dev client hasn't been rebuilt yet.
type LocalAuthModule = typeof import("expo-local-authentication");
let LocalAuth: LocalAuthModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LocalAuth = require("expo-local-authentication");
} catch {
  LocalAuth = null;
}

const BIOMETRIC_KEY = "vend88-biometric-enabled";
const GRACE_KEY = "vend88-lock-grace-ms";

export const LOCK_GRACE_DEFAULT_MS = 30_000;

export const LOCK_GRACE_OPTIONS: { value: number; key: string }[] = [
  { value: 0, key: "lock_grace_immediately" },
  { value: 30_000, key: "lock_grace_30s" },
  { value: 60_000, key: "lock_grace_1m" },
  { value: 300_000, key: "lock_grace_5m" },
];

type AppLockContextType = {
  /** True when the lock screen overlay should be shown. */
  locked: boolean;
  /** True when the user has enabled biometric lock in settings. */
  enabled: boolean;
  /** True when device hardware + enrollment are present. */
  supported: boolean;
  /** Milliseconds the app may be backgrounded before re-locking. */
  graceMs: number;
  /** Attempt to unlock with biometrics. Resolves to true on success. */
  unlock: (promptMessage?: string) => Promise<boolean>;
  /** Enable biometric lock (requires successful biometric prompt). */
  enable: (promptMessage?: string) => Promise<boolean>;
  /** Disable biometric lock (requires successful biometric prompt). */
  disable: (promptMessage?: string) => Promise<boolean>;
  /** Force-lock the app immediately. No-op if not enabled. */
  lockNow: () => void;
  /** Update the background grace period (persists). */
  setGraceMs: (value: number) => Promise<void>;
};

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { token, signOut } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [graceMs, setGraceMsState] = useState<number>(LOCK_GRACE_DEFAULT_MS);
  const [locked, setLocked] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const backgroundedAtRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const prevTokenRef = useRef<string | null>(null);

  // Hydrate persisted state on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [compat, enrolled, bioFlag, graceRaw] = await Promise.all([
          LocalAuth ? LocalAuth.hasHardwareAsync() : Promise.resolve(false),
          LocalAuth ? LocalAuth.isEnrolledAsync() : Promise.resolve(false),
          SecureStore.getItemAsync(BIOMETRIC_KEY),
          SecureStore.getItemAsync(GRACE_KEY),
        ]);
        if (cancelled) return;
        const hwOk = Boolean(compat && enrolled);
        const userOn = bioFlag === "1";
        const parsedGrace = graceRaw == null ? LOCK_GRACE_DEFAULT_MS : Number(graceRaw);
        setSupported(hwOk);
        setEnabled(userOn);
        setGraceMsState(
          Number.isFinite(parsedGrace) && parsedGrace >= 0
            ? parsedGrace
            : LOCK_GRACE_DEFAULT_MS
        );
        // If user has biometric lock on and a session, start locked on cold start.
        if (hwOk && userOn) {
          setLocked(true);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Track AppState transitions to re-lock after the grace window.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (next === "background" || next === "inactive") {
        // Only mark the moment we leave the foreground.
        if (prev === "active") {
          backgroundedAtRef.current = Date.now();
        }
        return;
      }

      if (next === "active") {
        const leftAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (!enabled || !supported || !token) return;
        if (locked) return;
        if (leftAt == null) return;
        const elapsed = Date.now() - leftAt;
        if (elapsed >= graceMs) {
          setLocked(true);
        }
      }
    });
    return () => subscription.remove();
  }, [enabled, supported, token, graceMs, locked]);

  // If a previously authenticated session is cleared, reset lock state in-memory
  // so next sign-in starts fresh and must opt-in again.
  useEffect(() => {
    const wasLoggedIn = Boolean(prevTokenRef.current);
    prevTokenRef.current = token;

    if (!token) {
      setLocked(false);
      backgroundedAtRef.current = null;
      if (wasLoggedIn) {
        setEnabled(false);
      }
    }
  }, [token]);

  // If user disables biometric, clear any active lock.
  useEffect(() => {
    if (!enabled || !supported) {
      setLocked(false);
    }
  }, [enabled, supported]);

  // If hardware/enrollment disappears (e.g. user removed Face ID),
  // automatically turn the setting off so we don't strand them.
  useEffect(() => {
    if (!hydrated) return;
    if (enabled && !supported) {
      setEnabled(false);
      void SecureStore.setItemAsync(BIOMETRIC_KEY, "0");
    }
  }, [hydrated, enabled, supported]);

  const unlock = useCallback(
    async (promptMessage?: string): Promise<boolean> => {
      if (!LocalAuth) return false;
      try {
        const result = await LocalAuth.authenticateAsync({
          promptMessage: promptMessage ?? "Unlock VEND88",
          disableDeviceFallback: false,
          cancelLabel: "Cancel",
          fallbackLabel: "Use Passcode",
        });
        if (result.success) {
          setLocked(false);
          backgroundedAtRef.current = null;
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    []
  );

  const enable = useCallback(
    async (promptMessage?: string): Promise<boolean> => {
      if (!LocalAuth || !supported) return false;
      try {
        const result = await LocalAuth.authenticateAsync({
          promptMessage: promptMessage ?? "Enable biometric lock",
          disableDeviceFallback: false,
        });
        if (!result.success) return false;
        await SecureStore.setItemAsync(BIOMETRIC_KEY, "1");
        setEnabled(true);
        return true;
      } catch {
        return false;
      }
    },
    [supported]
  );

  const disable = useCallback(
    async (promptMessage?: string): Promise<boolean> => {
      if (!LocalAuth) {
        // No native module — just clear the flag.
        await SecureStore.setItemAsync(BIOMETRIC_KEY, "0");
        setEnabled(false);
        setLocked(false);
        return true;
      }
      try {
        const result = await LocalAuth.authenticateAsync({
          promptMessage: promptMessage ?? "Disable biometric lock",
          disableDeviceFallback: false,
        });
        if (!result.success) return false;
        await SecureStore.setItemAsync(BIOMETRIC_KEY, "0");
        setEnabled(false);
        setLocked(false);
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const lockNow = useCallback(() => {
    if (!enabled || !supported) return;
    setLocked(true);
  }, [enabled, supported]);

  const setGraceMs = useCallback(async (value: number) => {
    const safe = Number.isFinite(value) && value >= 0 ? value : LOCK_GRACE_DEFAULT_MS;
    setGraceMsState(safe);
    await SecureStore.setItemAsync(GRACE_KEY, String(safe));
  }, []);

  // Wire sign-out from the lock screen (consumer escape hatch).
  const value = useMemo<AppLockContextType>(
    () => ({
      locked,
      enabled,
      supported,
      graceMs,
      unlock,
      enable,
      disable,
      lockNow,
      setGraceMs,
    }),
    [locked, enabled, supported, graceMs, unlock, enable, disable, lockNow, setGraceMs]
  );

  // Keep sign-out available for the LockScreen via ref-free closure.
  // (LockScreen calls useAuth().signOut() directly; no need to expose here.)
  void signOut;

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) {
    throw new Error("useAppLock must be used inside AppLockProvider");
  }
  return ctx;
}
