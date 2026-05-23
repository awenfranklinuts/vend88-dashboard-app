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

import { API_BASE_URL, setNetworkFailureHandler } from "../services/api";

type NetworkContextType = {
  /** True when the device appears to have working internet to the API. */
  online: boolean;
  /** True while a manual reachability check is in flight. */
  checking: boolean;
  /**
   * True once the device has successfully reached the API at least once in
   * this session. Used to decide whether we likely have cached data to show
   * instead of forcing a full offline screen.
   */
  hasBeenOnline: boolean;
  /** Force a reachability check immediately. Resolves to the new online state. */
  recheck: () => Promise<boolean>;
};

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

const POLL_INTERVAL_MS = 8000;
const PROBE_TIMEOUT_MS = 4500;

// Lightweight reachability probe. We hit the configured API base URL with a
// short timeout — any HTTP response (even 404) means the device has network.
async function probeNetwork(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const response = await fetch(API_BASE_URL, {
      method: "GET",
      signal: controller.signal,
      // Bust caches so we never get a stale "200" from a service worker.
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
    });
    clearTimeout(timer);
    // Any HTTP status is fine — it proves the request reached a server.
    return response.status >= 100 && response.status < 600;
  } catch {
    return false;
  }
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  const [hasBeenOnline, setHasBeenOnline] = useState(false);
  const onlineRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyOnline = useCallback((next: boolean) => {
    onlineRef.current = next;
    setOnline((prev) => (prev === next ? prev : next));
    if (next) {
      setHasBeenOnline((prev) => (prev ? prev : true));
    }
  }, []);

  const runProbe = useCallback(async (): Promise<boolean> => {
    setChecking(true);
    const ok = await probeNetwork();
    applyOnline(ok);
    setChecking(false);
    return ok;
  }, [applyOnline]);

  const recheck = useCallback(async () => {
    return runProbe();
  }, [runProbe]);

  // Periodic polling + initial probe.
  useEffect(() => {
    void runProbe();
    intervalRef.current = setInterval(() => {
      void runProbe();
    }, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [runProbe]);

  // Re-probe immediately when app returns to foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        void runProbe();
      }
    });
    return () => sub.remove();
  }, [runProbe]);

  // Listen to axios network failures so we flip offline instantly without
  // waiting for the next polling tick.
  useEffect(() => {
    setNetworkFailureHandler(() => {
      if (!onlineRef.current) return;
      applyOnline(false);
      // Verify after a short delay — connection might already be back.
      setTimeout(() => {
        void runProbe();
      }, 1200);
    });
    return () => setNetworkFailureHandler(null);
  }, [applyOnline, runProbe]);

  const value = useMemo<NetworkContextType>(
    () => ({ online, checking, hasBeenOnline, recheck }),
    [online, checking, hasBeenOnline, recheck]
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) {
    throw new Error("useNetwork must be used inside NetworkProvider");
  }
  return ctx;
}
