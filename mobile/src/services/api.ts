import axios from "axios";
import Constants from "expo-constants";

const DEFAULT_OFFICIAL_API_BASE_URL = "https://dev.vend88.com";
const FALLBACK_API_BASE_URL = "http://127.0.0.1:8000/api/v1";
export const API_TARGET = (process.env.EXPO_PUBLIC_API_TARGET ?? "custom").toLowerCase();

function getExpoHostUri(): string | undefined {
  const configHostUri = Constants.expoConfig?.hostUri;

  const manifest2HostUri =
    (
      Constants as unknown as {
        manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
      }
    ).manifest2?.extra?.expoClient?.hostUri;

  const debuggerHostUri =
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } })
      .expoGoConfig?.debuggerHost;

  return configHostUri ?? manifest2HostUri ?? debuggerHostUri;
}

function getAutoDetectedApiBaseUrl(): string | undefined {
  const hostUri = getExpoHostUri();
  if (!hostUri) {
    return undefined;
  }

  const host = hostUri.split(":")[0];
  if (!host) {
    return undefined;
  }

  return `http://${host}:8000/api/v1`;
}

function getCustomApiBaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_CUSTOM_API_BASE_URL ??
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    getAutoDetectedApiBaseUrl() ??
    FALLBACK_API_BASE_URL
  );
}

export const API_BASE_URL =
  API_TARGET === "official"
    ? process.env.EXPO_PUBLIC_OFFICIAL_API_BASE_URL ??
      DEFAULT_OFFICIAL_API_BASE_URL
    : getCustomApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

type AuthFailureHandler = (reason: string) => void | Promise<void>;

let authFailureHandler: AuthFailureHandler | null = null;
let lastAuthFailureAt = 0;

export function setAuthFailureHandler(handler: AuthFailureHandler | null) {
  authFailureHandler = handler;
}

// ─── Network failure handler (used by NetworkContext) ────────────────────────
// Fired whenever axios cannot reach the server at all (no response received).
type NetworkFailureHandler = () => void;
let networkFailureHandler: NetworkFailureHandler | null = null;

export function setNetworkFailureHandler(handler: NetworkFailureHandler | null) {
  networkFailureHandler = handler;
}

function notifyNetworkFailure() {
  if (!networkFailureHandler) return;
  try {
    networkFailureHandler();
  } catch {
    // Never break request chains because the offline notifier failed.
  }
}

function isAuthFailurePayload(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const body = value as { status_code?: unknown; message?: unknown; detail?: unknown };
  if (body.status_code === 401 || body.status_code === 403) return true;

  const message =
    typeof body.message === "string"
      ? body.message
      : typeof body.detail === "string"
        ? body.detail
        : "";
  if (!message) return false;

  return /unauthor|forbidden|invalid token|token expired|expired token|session expired|login again/i.test(
    message
  );
}

function notifyAuthFailure(reason: string) {
  if (!authFailureHandler) return;

  // Avoid repeated sign-out cascades when many requests fail at once.
  const now = Date.now();
  if (now - lastAuthFailureAt < 2000) return;
  lastAuthFailureAt = now;

  Promise.resolve(authFailureHandler(reason)).catch(() => {
    // Never break request chains because sign-out handling failed.
  });
}

api.interceptors.response.use(
  (response) => {
    if (isAuthFailurePayload(response.data)) {
      notifyAuthFailure("response-payload-auth-failure");
    }
    return response;
  },
  (error) => {
    const status = error?.response?.status;
    if (status === 401 || status === 403 || isAuthFailurePayload(error?.response?.data)) {
      notifyAuthFailure("http-auth-failure");
    }
    // No response at all → most likely a network/DNS/timeout failure.
    if (!error?.response) {
      notifyNetworkFailure();
    }
    return Promise.reject(error);
  }
);

// ─── API call/response logging ────────────────────────────────────────────────
// Toggle with EXPO_PUBLIC_API_LOG=0 to silence; defaults to enabled.
const API_LOG_ENABLED =
  (process.env.EXPO_PUBLIC_API_LOG ?? "1") !== "0";

function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/token|password|secret|authorization/i.test(k) && typeof v === "string") {
      out[k] = v.length > 8 ? `${v.slice(0, 4)}…${v.slice(-4)}` : "***";
    } else {
      out[k] = redact(v);
    }
  }
  return out;
}

function summarizePayload(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string") {
    return value.length > 120 ? `string(len=${value.length})` : `string(${value})`;
  }
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `array(len=${value.length})`;

  const obj = redact(value) as Record<string, unknown>;
  const keys = Object.keys(obj);
  const out: Record<string, unknown> = { keys };

  for (const key of [
    "shop_id",
    "business_id",
    "store_id",
    "status",
    "start_date",
    "end_date",
    "page",
    "detail",
    "ignore_pagination",
    "status_code",
  ]) {
    if (key in obj) out[key] = obj[key];
  }

  const query = obj.query;
  if (query && typeof query === "object" && !Array.isArray(query)) {
    out.query_keys = Object.keys(query as Record<string, unknown>);
  }

  for (const key of [
    "orders",
    "sales_by_item",
    "sales_by_method",
    "sales_by_dine_option",
    "daily_statistics",
    "hourly_sales",
  ]) {
    const v = obj[key];
    if (Array.isArray(v)) {
      out[`${key}_count`] = v.length;
    } else if (v && typeof v === "object") {
      out[`${key}_count`] = Object.keys(v as Record<string, unknown>).length;
    }
  }

  return JSON.stringify(out);
}

if (API_LOG_ENABLED) {
  api.interceptors.request.use((config) => {
    const id = Math.random().toString(36).slice(2, 8);
    (config as { metadata?: { id: string; start: number } }).metadata = {
      id,
      start: Date.now(),
    };
    const method = (config.method ?? "get").toUpperCase();
    const url = `${config.baseURL ?? ""}${config.url ?? ""}`;
    const body = config.data ? ` body=${summarizePayload(config.data)}` : "";
    const params = config.params ? ` params=${summarizePayload(config.params)}` : "";
    console.log(`[api ▶ ${id}] ${method} ${url}${params}${body}`);
    return config;
  });

  api.interceptors.response.use(
    (response) => {
      const meta = (response.config as { metadata?: { id: string; start: number } })
        .metadata;
      const id = meta?.id ?? "?";
      const ms = meta ? Date.now() - meta.start : -1;
      const url = `${response.config.baseURL ?? ""}${response.config.url ?? ""}`;
      console.log(
        `[api ◀ ${id}] ${response.status} ${url} ${ms}ms data=${summarizePayload(response.data)}`
      );
      return response;
    },
    (error) => {
      const cfg = error?.config as
        | { metadata?: { id: string; start: number }; baseURL?: string; url?: string; method?: string }
        | undefined;
      const id = cfg?.metadata?.id ?? "?";
      const ms = cfg?.metadata ? Date.now() - cfg.metadata.start : -1;
      const url = `${cfg?.baseURL ?? ""}${cfg?.url ?? ""}`;
      const status = error?.response?.status ?? "ERR";
      const data = error?.response?.data;
      console.log(
        `[api ✖ ${id}] ${status} ${url} ${ms}ms message=${error?.message ?? ""}` +
          (data ? ` data=${summarizePayload(data)}` : "")
      );
      return Promise.reject(error);
    }
  );
}
