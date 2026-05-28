import axios from "axios";
import Constants from "expo-constants";

const DEFAULT_OFFICIAL_API_BASE_URL = "https://prod.vend88.com";
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

// ─── Demo mode ───────────────────────────────────────────────────────────────
// When enabled, all outbound API requests are short-circuited with canned
// empty/zero-shaped responses so the app can be explored without a backend.
let demoModeEnabled = false;

export function setDemoMode(enabled: boolean) {
  demoModeEnabled = !!enabled;
}

export function isDemoMode(): boolean {
  return demoModeEnabled;
}

// Build a permissive zero/empty payload tailored to the request URL so that
// the various screens get a shape they can render without runtime errors.
function buildDemoPayload(url: string): unknown {
  const u = url.toLowerCase();

  // ─── Demo sample data ──────────────────────────────────────────────────────
  const demoShop = {
    _id: "demo-shop",
    business_id: "demo-business",
    // shop_key intentionally omitted in demo mode so the storefront link
    // renders as "N/A" instead of pointing at a non-existent demo URL.
    name: "Demo Cafe",
    store_name: "Demo Cafe",
    location: "123 Sample Street, Sydney NSW 2000",
    phone: "+61 2 0000 0000",
    description: "Demo store used for previewing the dashboard.",
    warehouse_id: "demo-warehouse",
    max_perorderday: 100,
    open_hour: {
      monday: [["09:00", "17:00"]],
      tuesday: [["09:00", "17:00"]],
      wednesday: [["09:00", "17:00"]],
      thursday: [["09:00", "17:00"]],
      friday: [["09:00", "17:00"]],
      saturday: [["10:00", "16:00"]],
      sunday: [],
    },
    named_surcharges: {},
    surcharge: {},
    staff: [],
  };

  const demoBusiness = {
    _id: "demo-business",
    business_key: "DEMOBIZ",
    name: "Demo Business",
    shops: ["demo-shop"],
  };

  const demoProducts = [
    { _id: "demo-prod-1", name: "Flat White", category: "Coffee", price: 5.5, stock: 120 },
    { _id: "demo-prod-2", name: "Latte", category: "Coffee", price: 5.5, stock: 90 },
    { _id: "demo-prod-3", name: "Croissant", category: "Bakery", price: 6.0, stock: 40 },
    { _id: "demo-prod-4", name: "Sandwich", category: "Food", price: 12.0, stock: 25 },
    { _id: "demo-prod-5", name: "Iced Tea", category: "Drinks", price: 6.5, stock: 60 },
  ];

  const demoOrders = Array.from({ length: 5 }).map((_, i) => ({
    order_id: `demo-order-${i + 1}`,
    order_num: 1000 + i,
    source: "POS",
    status: "COMPLETED",
    time: new Date(Date.now() - i * 3600_000).toISOString(),
    price: 10 + i * 5,
    qtys: [1 + i],
    pick_method: "IN_STORE",
    transactions: [{ platform: "CASH" }],
  }));

  // Auth / profile
  if (u.includes("/admin/profile")) {
    return {
      status_code: 200,
      email: "demo@vend88.com",
      first_name: "Demo",
      last_name: "User",
    };
  }
  if (u.includes("/admin/login")) {
    return { status_code: 200, token: "demo-token" };
  }

  // Meta — selections used by dashboard discovery (we bypass discovery, but
  // some callers still hit this directly).
  if (u.includes("/meta/get_meta")) {
    return {
      status_code: 200,
      meta: {
        BUSINESS_SELECTION: "demo-business",
        STORE_SELECTION: "demo-shop",
      },
    };
  }
  if (u.includes("/meta")) return { status_code: 200, meta: {} };

  // Search endpoints
  if (u.includes("/search/shop_search")) {
    return { status_code: 200, shop: [demoShop] };
  }
  if (u.includes("/search/business_search")) {
    return { status_code: 200, business: [demoBusiness] };
  }
  if (u.includes("/search/order_search")) {
    return { status_code: 200, max_page: 1, orders: demoOrders };
  }
  if (u.includes("/search/product_search")) {
    return { status_code: 200, product: demoProducts, products: demoProducts, total: demoProducts.length };
  }

  // Dashboard
  if (u.includes("/dashboard/storestatistics")) {
    return {
      status_code: 200,
      financial_summary: {
        total_revenue: 1234.5,
        total_tax: 112.0,
        total_discount: 25.0,
        total_refund: 0,
        net_revenue: 1097.5,
      },
      operational_summary: {
        total_orders: 42,
        total_items: 87,
        avg_order_value: 29.39,
      },
      breakdowns: {
        hourly_sales: {},
        daily_statistics: [],
        sales_by_method: [
          { method: "CASH", total: 500 },
          { method: "CARD", total: 734.5 },
        ],
        sales_by_item: demoProducts.map((p) => ({
          name: p.name,
          qty: Math.floor(Math.random() * 20) + 1,
          total: p.price * (Math.floor(Math.random() * 20) + 1),
        })),
        sales_by_dine_option: [
          { option: "IN_STORE", total: 800 },
          { option: "TAKEAWAY", total: 434.5 },
        ],
      },
      abnormal_transactions: {},
      top_products: demoProducts.map((p) => ({
        id: p._id,
        name: p.name,
        qty: Math.floor(Math.random() * 30) + 5,
        total: p.price * (Math.floor(Math.random() * 30) + 5),
      })),
    };
  }
  if (u.includes("/dashboard/business_sales")) {
    return {
      status_code: 200,
      total_order_count: 42,
      total_orders: { sales: 1234.5, num_sales: 42, num_products: 87 },
      daily_statistics: {},
      total_sales: 1234.5,
      total_items: 87,
      sales_by_item: [],
      sales_by_method: [],
      sales_by_dine_option: [],
      hourly_sales: [],
    };
  }
  if (u.includes("/dashboard/summary")) {
    return {
      today_sales: "320",
      today_revenue_change_pct: 12,
      week_revenue: "2150",
      week_revenue_change_pct: 8,
      today_orders: 14,
      week_orders: 96,
      total_orders: 42,
      total_products: 5,
      avg_order_value: "29.39",
      total_revenue_month: "1234.5",
      today_items: 22,
      week_items: 154,
      revenue_change_pct: 5,
      orders_change_pct: 7,
    };
  }
  if (u.includes("/dashboard/recent-orders")) return demoOrders;
  if (u.includes("/dashboard/top-products")) return demoProducts;
  if (u.includes("/dashboard")) return { status_code: 200 };

  // POS
  if (u.includes("/pos/close_history") || u.includes("/pos/close-history")) {
    return { status_code: 200, close_history: [], list: [], total: 0 };
  }
  if (u.includes("/pos/dashboard")) {
    return {
      status_code: 200,
      total_sales: 1234.5,
      total_orders: 42,
      total_items: 87,
      sales_by_item: [],
      sales_by_method: [],
      sales_by_dine_option: [],
      daily_statistics: [],
      hourly_sales: [],
    };
  }

  // Products / catalog
  if (u.includes("/product/batch_details") || u.includes("/product/detail")) {
    return { status_code: 200, products: demoProducts, product: demoProducts[0], data: demoProducts[0] };
  }
  if (u.includes("/product/all_category")) {
    return {
      status_code: 200,
      categories: [
        { _id: "cat-1", name: "Coffee" },
        { _id: "cat-2", name: "Bakery" },
        { _id: "cat-3", name: "Food" },
        { _id: "cat-4", name: "Drinks" },
      ],
    };
  }
  if (u.includes("/product") || u.includes("/catalog")) {
    return { status_code: 200, products: demoProducts, list: demoProducts, total: demoProducts.length };
  }

  // Orders by id
  if (/\/order\/[^/]+$/.test(u)) {
    return { status_code: 200, data: demoOrders[0], order: demoOrders[0] };
  }
  if (u.includes("/order/search")) {
    return { status_code: 200, orders: demoOrders, list: demoOrders, total: demoOrders.length };
  }

  // Shop / business / store
  if (u.includes("/shop/update_shop")) return { status_code: 200, message: "" };
  if (u.includes("/shop")) return { status_code: 200, shop: [demoShop] };
  if (u.includes("/business")) return { status_code: 200, business: [demoBusiness] };
  if (u.includes("/store")) return { status_code: 200, stores: [demoShop], statistics: {} };

  // Generic fallback — permissive empty payload.
  return {
    status_code: 200,
    data: [],
    items: [],
    results: [],
    list: [],
    total: 0,
    message: "",
  };
}

// Request interceptor that intercepts all requests when demo mode is on and
// returns a canned response instead of hitting the network.
api.interceptors.request.use((config) => {
  if (!demoModeEnabled) return config;
  const url = `${config.baseURL ?? ""}${config.url ?? ""}`;
  // Override the adapter for this request to return synthetic data.
  config.adapter = async () => {
    const data = buildDemoPayload(url);
    return {
      data,
      status: 200,
      statusText: "OK (demo)",
      headers: {},
      config,
      request: {},
    };
  };
  return config;
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

function isRequestCancellation(error: unknown): boolean {
  const e = error as
    | { code?: string; name?: string; message?: string; __CANCEL__?: boolean }
    | undefined;
  if (!e) return false;
  if (e.__CANCEL__) return true;
  if (e.code === "ERR_CANCELED") return true;
  if (e.name === "CanceledError") return true;
  if (typeof e.message === "string" && /aborted|canceled/i.test(e.message)) {
    return true;
  }
  return false;
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
    // Ignore explicit request cancellations (AbortController / axios cancel)
    // so period-switch aborts don't briefly flip the app into offline state.
    if (!error?.response && !isRequestCancellation(error)) {
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
