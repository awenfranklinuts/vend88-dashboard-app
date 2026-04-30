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

api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
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

function safeStringify(value: unknown, maxLen = 800): string {
  try {
    const s = JSON.stringify(redact(value));
    if (!s) return String(value);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…[+${s.length - maxLen}]` : s;
  } catch {
    return String(value);
  }
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
    const body = config.data ? ` body=${safeStringify(config.data)}` : "";
    const params = config.params ? ` params=${safeStringify(config.params)}` : "";
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
        `[api ◀ ${id}] ${response.status} ${url} ${ms}ms data=${safeStringify(response.data)}`
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
          (data ? ` data=${safeStringify(data)}` : "")
      );
      return Promise.reject(error);
    }
  );
}
