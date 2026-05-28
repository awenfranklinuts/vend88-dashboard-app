import { api, isDemoMode } from "./api";
import * as SecureStore from "expo-secure-store";

const AUTH_TOKEN_KEY = "vend88-auth-token";
const AUTH_EMAIL_KEY = "vend88-auth-email";

export type DashboardSummary = {
  today_sales: string;
  today_revenue_change_pct?: number;
  week_revenue?: string;
  week_revenue_change_pct?: number;
  today_items?: number;
  week_items?: number;
  today_orders?: number;
  week_orders?: number;
  total_orders: number;
  total_products: number;
  avg_order_value: string;
  total_revenue_month: string;
  revenue_change_pct: number;
  orders_change_pct: number;
};

export type DashboardChartPoint = { day: string; revenue: number };

export type OfficialHeroRevenueSeries = {
  week: DashboardChartPoint[];
  month: DashboardChartPoint[];
  today: DashboardChartPoint[];
};

export type DashboardRecentOrder = {
  id: string;
  item: string;
  module: string;
  payment?: string;
  total: string;
  status: string;
  rawStatus?: string;
  time: string;
  rawId?: string;
  rawTime?: string;
};

type AuthOverride = {
  email?: string | null;
  token?: string | null;
};

export type OfficialSaleRecord = {
  id: string | number;
  rawId?: string;
  date: string;
  order_id: string;
  items: number;
  module: string;
  payment: string;
  total: string;
  rawStatus?: string;
  status: string;
};

export type OfficialSalesHistoryProgress = {
  loaded: number;
  total: number;
  rows: OfficialSaleRecord[];
};

/**
 * Loose detail shape for a single order, used by the order-detail modal.
 * The Vend88 backend response contains many optional / undocumented fields,
 * so we keep this permissive and let the UI pick out what it needs.
 */
export type OfficialOrderDetail = Record<string, unknown> & {
  order_id?: string;
  order_num?: number | string;
  status?: string;
  source?: string;
  pick_method?: string;
  price?: number;
  discount?: number;
  rounding?: number;
  tax?: number;
  holiday_surcharge?: number;
  guest_count?: number;
  time?: string;
  qtys?: number[];
  products?: unknown;
  items?: unknown;
  transactions?: unknown;
};

type BusinessSalesDay = {
  sales?: number;
  num_sales?: number;
  num_products?: number;
};

type BusinessSalesResponse = {
  status_code?: number;
  total_order_count?: number;
  total_orders?: {
    sales?: number;
    num_sales?: number;
    num_products?: number;
  };
  daily_statistics?: Record<string, BusinessSalesDay>;
};

type BusinessSearchResponse = {
  status_code?: number;
  business?: Array<Record<string, unknown>>;
};

type MetaResponse = {
  status_code?: number;
  meta?: {
    BUSINESS_SELECTION?: unknown;
    STORE_SELECTION?: unknown;
  };
};

type AdminProfileResponse = {
  status_code?: number;
  email?: string;
};

type OrderSearchItem = {
  order_id?: string;
  order_num?: number;
  source?: string;
  status?: string;
  time?: string;
  price?: number;
  qtys?: number[];
  pick_method?: string;
  transactions?: Array<{ platform?: string }>;
};

type OrderSearchResponse = {
  status_code?: number;
  max_page?: number;
  orders?: OrderSearchItem[] | string[];
};

type OrderByIdResponse = {
  status_code?: number;
  data?: OrderSearchItem;
};

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatOffsetCurrentLocal(): string {
  // Use current local offset consistently for request payload timestamps.
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}${mm}`;
}

function formatBusinessDate(date: Date, endOfDay: boolean): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const time = endOfDay ? "23:59:59" : "00:00:00";
  return `${y}-${m}-${d} ${time} ${formatOffsetCurrentLocal()}`;
}

function formatBusinessDateExact(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss} ${formatOffsetCurrentLocal()}`;
}

function parseApiDateToLocal(value?: string): Date | null {
  if (!value) return null;
  // Accept API shapes like "YYYY-MM-DD HH:mm:ss +1000" or ISO.
  const normalized = value.includes(" ")
    ? value.replace(" ", "T").replace(" +", "+")
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getMonthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: formatBusinessDate(start, false),
    endDate: formatBusinessDateExact(now),
  };
}

function getPreviousMonthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  end.setHours(23, 59, 59, 0);
  return {
    startDate: formatBusinessDate(start, false),
    endDate: formatBusinessDate(end, true),
  };
}

function getRecentRange(now = new Date()) {
  const end = now;
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  return {
    startDate: formatBusinessDate(start, false),
    endDate: formatBusinessDate(end, true),
  };
}

function getWeekStartMonday(now = new Date()): Date {
  const start = new Date(now);
  const dow = start.getDay() || 7; // Mon=1 ... Sun=7
  start.setDate(start.getDate() - (dow - 1));
  start.setHours(0, 0, 0, 0);
  return start;
}

function getWeeklyRange(now = new Date()) {
  const start = getWeekStartMonday(now);
  return {
    startDate: formatBusinessDate(start, false),
    endDate: formatBusinessDateExact(now),
  };
}

function getPreviousWeeklyRange(now = new Date()) {
  // Compare against the FULL previous calendar week (Mon–Sun), not a
  // same-elapsed-time shift. This keeps the dashboard's week % consistent
  // with the previous-week total the user sees, and avoids the surprising
  // case where a partial week-to-date can show a positive change vs a
  // smaller same-elapsed-time slice of the previous week even though the
  // full previous week was higher.
  const thisWeekStart = getWeekStartMonday(now);
  const prevWeekStart = new Date(thisWeekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEnd = new Date(thisWeekStart.getTime() - 1); // Sun 23:59:59.999
  return {
    startDate: formatBusinessDate(prevWeekStart, false),
    endDate: formatBusinessDateExact(prevWeekEnd),
  };
}

function getTodayRange(now = new Date()) {
  const start = new Date(now);
  return {
    startDate: formatBusinessDate(start, false),
    endDate: formatBusinessDateExact(now),
  };
}

function getPreviousDayRange(now = new Date()) {
  const prevStart = new Date(now);
  prevStart.setDate(prevStart.getDate() - 1);
  const prevNow = new Date(now);
  prevNow.setDate(prevNow.getDate() - 1);
  return {
    startDate: formatBusinessDate(prevStart, false),
    endDate: formatBusinessDateExact(prevNow),
  };
}

export type TopItemsPeriod = "today" | "week" | "month";

function getRangeForPeriod(period: TopItemsPeriod) {
  if (period === "today") return getTodayRange();
  if (period === "week") return getWeeklyRange();
  return getMonthRange();
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildWeekToDateKeys(now = new Date()): string[] {
  const start = getWeekStartMonday(now);
  const keys: string[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  while (cursor <= today) {
    keys.push(toLocalDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

function toRelativeTime(value?: string): string {
  if (!value) return "-";
  const date = parseApiDateToLocal(value);
  if (!date) {
    return value;
  }

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day ago`;
}

function mapOrderStatus(status?: string): string {
  const raw = (status ?? "").toLowerCase();
  if (/refund/.test(raw)) return "refunded";
  if (/cancel|void/.test(raw)) return "cancelled";
  if (/unpaid/.test(raw)) return "unpaid";
  return raw === "paid" || raw === "completed" || raw === "complete"
    ? "completed"
    : "in_progress";
}

function mapOrderModule(source?: string): string {
  if (!source) return "POS";
  const key = source.toLowerCase();
  if (key === "pos") return "POS";
  if (key === "table") return "POS";
  if (key === "kiosk") return "Kiosk";
  if (key === "vending") return "Vending";
  return source.toUpperCase();
}

function mapPayment(platform?: string): string {
  const key = (platform ?? "").toLowerCase();
  if (key === "cash") return "Cash";
  if (key === "card" || key === "eftpos") return "Card";
  if (key === "qr") return "QR";
  if (key === "wallet") return "Wallet";
  if (key === "mobile") return "Mobile";
  return platform ?? "Card";
}

function resolveOrderTime(order: OrderSearchItem): string | null {
  const candidate = order as Record<string, unknown>;
  const keys = [
    "time",
    "created_at",
    "createdAt",
    "updated_at",
    "updatedAt",
    "paid_at",
    "payment_time",
    "completed_at",
    "completedAt",
  ];

  for (const key of keys) {
    const raw = candidate[key];
    if (typeof raw !== "string" || raw.trim().length === 0) continue;
    const parsed = parseApiDateToLocal(raw);
    if (parsed) {
      return parsed.toISOString();
    }
  }

  return null;
}

function extractBusinessId(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const keys = ["business_id", "_id", "id", "store_id", "merchant_id"];
  for (const key of keys) {
    const raw = candidate[key];
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw;
    }
  }

  return null;
}

async function discoverBusinessId(
  email: string,
  token: string
): Promise<string | null> {
  const fromMeta = await discoverBusinessIdFromMeta(email, token);
  if (fromMeta) {
    return fromMeta;
  }

  const payloads = [
    {
      query: { key: "email", value: email },
      detail: true,
      token,
    },
    {
      query: { key: "email", value: email },
      detail: false,
      token,
    },
    {
      query: { key: "name", value: email },
      detail: true,
      token,
    },
  ];

  for (const body of payloads) {
    try {
      const response = await api.post<BusinessSearchResponse>(
        "/search/business_search",
        body
      );

      if (response.data?.status_code !== 200 || !Array.isArray(response.data.business)) {
        continue;
      }

      for (const item of response.data.business) {
        const id = extractBusinessId(item);
        if (id) {
          return id;
        }
      }
    } catch {
      // Keep trying alternative payload shapes.
    }
  }

  return null;
}

async function discoverBusinessIdFromMeta(
  email: string,
  token: string
): Promise<string | null> {
  const selections = await discoverSelectionsFromMeta(email, token);
  return selections.businessId;
}

function extractSelectionId(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    for (const key of ["_id", "id", "business_id", "store_id", "shop_id", "value"]) {
      const raw = candidate[key];
      if (typeof raw === "string" && raw.trim().length > 0) {
        return raw;
      }
    }
  }
  return null;
}

async function discoverSelectionsFromMeta(
  email: string,
  token: string
): Promise<{ businessId: string | null; storeId: string | null }> {
  const payloads = [
    { id: email, token },
    { id: email },
  ];

  for (const body of payloads) {
    try {
      const response = await api.post<MetaResponse>("/meta/get_meta", body);
      if (response.data?.status_code !== 200) {
        continue;
      }

      const businessSelection = response.data.meta?.BUSINESS_SELECTION;
      const storeSelection = response.data.meta?.STORE_SELECTION;
      return {
        businessId: extractSelectionId(businessSelection),
        storeId: extractSelectionId(storeSelection),
      };
    } catch {
      // Try the next payload variation.
    }
  }

  return { businessId: null, storeId: null };
}

async function resolveOfficialAuth(auth?: AuthOverride): Promise<{
  email: string | null;
  token: string | null;
}> {
  const [storedEmail, storedToken] = await Promise.all([
    SecureStore.getItemAsync(AUTH_EMAIL_KEY),
    SecureStore.getItemAsync(AUTH_TOKEN_KEY),
  ]);

  const token = auth?.token ?? storedToken ?? process.env.EXPO_PUBLIC_OFFICIAL_TOKEN ?? null;
  let email = auth?.email ?? storedEmail ?? process.env.EXPO_PUBLIC_OFFICIAL_EMAIL ?? null;

  if (token) {
    try {
      const response = await api.post<AdminProfileResponse>("/admin/profile", { token });
      const profileEmail = response.data?.email?.trim();
      if (response.data?.status_code === 200 && profileEmail) {
        email = profileEmail;
      }
    } catch {
      // Fall back to passed or stored email if profile lookup fails.
    }
  }

  return { email, token };
}

async function discoverShopIdFromBusiness(
  businessId: string,
  token: string
): Promise<string | null> {
  const payloads: Array<Record<string, unknown>> = [
    // Variant A: query object with business_id
    {
      query: { key: "business_id", value: businessId },
      detail: true,
      ignore_pagination: true,
      token,
    },
    // Variant B: top-level business_id
    { business_id: businessId, detail: true, ignore_pagination: true, token },
    // Variant C: filter object
    { filter: { business_id: businessId }, detail: true, token },
    // Variant D: no filter — list all, then filter client-side
    { detail: true, ignore_pagination: true, token },
  ];

  for (const body of payloads) {
    try {
      const response = await api.post<Record<string, unknown>>(
        "/search/shop_search",
        body
      );
      const data = response.data ?? {};
      const statusCode = data.status_code;
      const candidates: Array<Record<string, unknown>> = [];
      for (const key of ["shops", "shop", "data", "stores", "results"]) {
        const value = data[key];
        if (Array.isArray(value)) {
          for (const entry of value) {
            if (entry && typeof entry === "object") {
              candidates.push(entry as Record<string, unknown>);
            }
          }
        }
      }
      console.log(
        "[top-items] shop_search status:",
        statusCode,
        "payloadKeys:",
        Object.keys(data),
        "candidates:",
        candidates.length,
        "sample:",
        candidates[0] ? Object.keys(candidates[0]).slice(0, 10) : null
      );

      if (statusCode !== 200 || candidates.length === 0) continue;

      const idKeys = ["_id", "id", "shop_id", "store_id"];
      const biz = businessId;
      const matches = candidates.filter((shop) => {
        for (const bKey of ["business_id", "business", "biz_id"]) {
          const v = shop[bKey];
          if (typeof v === "string" && v === biz) return true;
        }
        return false;
      });

      const pool = matches.length > 0 ? matches : candidates;
      for (const shop of pool) {
        for (const key of idKeys) {
          const raw = shop[key];
          if (typeof raw === "string" && raw.trim().length > 0) {
            return raw;
          }
        }
      }
    } catch (err) {
      console.log("[top-items] shop_search error:", err);
    }
  }

  return null;
}

function buildScopedQueries(
  baseQuery: Record<string, unknown>,
  businessId: string | null,
  storeId: string | null
): Array<Record<string, unknown>> {
  const queries: Array<Record<string, unknown>> = [];

  if (storeId && businessId) {
    queries.push({ ...baseQuery, business_id: businessId, shop_id: storeId });
    queries.push({ ...baseQuery, business_id: businessId, store_id: storeId });
  }
  if (storeId) {
    queries.push({ ...baseQuery, shop_id: storeId });
    queries.push({ ...baseQuery, store_id: storeId });
  }
  if (businessId) {
    queries.push({ ...baseQuery, business_id: businessId });
  }

  return queries;
}

async function requestScopedOrders(
  token: string,
  baseQuery: Record<string, unknown>,
  businessId: string | null,
  storeId: string | null
): Promise<Array<OrderSearchItem | string>> {
  let attempts = 0;
  let anyResponse = false;
  let lastError: unknown = null;

  for (const query of buildScopedQueries(baseQuery, businessId, storeId)) {
    const payloads: Array<Record<string, unknown>> = [
      {
        detail: true,
        ignore_pagination: false,
        page: 0,
        query,
        token,
      },
      {
        detail: true,
        ignore_pagination: true,
        query,
        token,
      },
    ];

    for (const payload of payloads) {
      attempts++;
      try {
        const response = await api.post<OrderSearchResponse>(
          "/search/order_search",
          payload
        );
        anyResponse = true;
        if (Array.isArray(response.data?.orders) && response.data.orders.length > 0) {
          return response.data.orders;
        }
      } catch (err) {
        lastError = err;
        // Try the next scoped query variation.
      }
    }
  }

  // If every attempt threw (e.g. device offline / DNS down), propagate the
  // error so callers can preserve any cached UI state instead of mistakenly
  // showing an "empty" response.
  if (attempts > 0 && !anyResponse) {
    throw lastError instanceof Error ? lastError : new Error("Network unreachable");
  }

  return [];
}

export type DashboardTopItem = {
  id: string;
  name: string;
  units: number;
  revenue: string;
  image?: string;
};

type PosDashboardResponse = {
  status_code?: number;
  sales_by_method?: Record<string, number>;
  sales_by_item?: Record<string, number>;
  sales_by_category?: Record<string, number>;
  sales_by_dine_option?: Record<string, number>;
};

type StoreStatisticsResponse = {
  status_code?: number;
  financial_summary?: {
    average_order_value?: number;
    gross_sales?: number;
    net_sales?: number;
    total_credit_added?: number;
    total_credit_usage?: number;
    total_discount?: number;
    total_extra_charge?: number;
    total_item_sale?: number;
    total_refunds?: number;
    total_revenue?: number;
    total_rounding?: number;
    total_surcharge?: number;
    total_tax?: number;
  };
  operational_summary?: {
    guest_sales?: number;
    member_sales?: number;
    refund_count?: number;
    total_orders?: number;
  };
  breakdowns?: {
    category?: Record<string, number>;
    channel?: Record<string, number>;
    dining_mode?: Record<string, number>;
    hourly_sales?: Record<string, number>;
    payment_method?: Record<string, number>;
    staff_performance?: Record<string, number>;
  };
  abnormal_transactions?: {
    cancelled?: { amount?: number; count?: number };
    coupons?: { amount?: number; count?: number };
    credit_paid?: { amount?: number; count?: number };
    discounts?: { amount?: number; count?: number };
    refunds?: { amount?: number; count?: number };
    voided?: { amount?: number; count?: number };
  };
};

function sumSalesByMethod(data?: PosDashboardResponse): number {
  if (!data?.sales_by_method) return 0;
  return Object.values(data.sales_by_method).reduce(
    (sum, value) => sum + toNumber(value),
    0
  );
}

function sumSalesByItem(data?: PosDashboardResponse): number {
  if (!data?.sales_by_item) return 0;
  return Object.values(data.sales_by_item).reduce(
    (sum, value) => sum + toNumber(value),
    0
  );
}

type PosDashboardSnapshot = {
  revenueTotal: number;
  itemsTotal: number;
};

type BusinessSalesSnapshot = {
  numProductsTotal: number;
};

type StoreStatisticsSnapshot = {
  ordersTotal: number;
  revenueTotal: number;
  hourlySales: Record<string, number>;
  financial: NonNullable<StoreStatisticsResponse["financial_summary"]>;
  operational: NonNullable<StoreStatisticsResponse["operational_summary"]>;
  breakdowns: NonNullable<StoreStatisticsResponse["breakdowns"]>;
  abnormal: NonNullable<StoreStatisticsResponse["abnormal_transactions"]>;
  topProducts: Array<{ id?: string; name: string; qty: number; total: number }>;
};

async function fetchStoreStatisticsSnapshot(
  shopId: string,
  token: string,
  startDate: string,
  endDate: string
): Promise<StoreStatisticsSnapshot> {
  const response = await api.post<StoreStatisticsResponse>(
    "/dashboard/storeStatistics",
    {
      shop_id: shopId,
      start_date: startDate,
      end_date: endDate,
      token,
    }
  );

  const data = response.data;
  if (data?.status_code !== 200) {
    throw new Error("Store statistics request failed.");
  }

  const topProducts = Array.isArray(data.top_products)
    ? data.top_products
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const rec = row as Record<string, unknown>;
          const nameRaw =
            pickString(rec, ["name", "product_name", "title", "item_name"]) ?? "";
          const name = nameRaw.trim();
          if (!name) return null;
          const idRaw = pickString(rec, ["id", "product_id", "_id", "product"]);
          const id = typeof idRaw === "string" ? idRaw.trim() : "";
          return {
            id: id || undefined,
            name,
            qty: toNumber(rec.qty ?? rec.quantity ?? rec.count),
            total: toNumber(rec.total ?? rec.amount ?? rec.price),
          };
        })
        .filter(
          (row): row is { id?: string; name: string; qty: number; total: number } =>
            row !== null
        )
    : [];

  return {
    ordersTotal: toNumber(data.operational_summary?.total_orders),
    revenueTotal: toNumber(data.financial_summary?.total_revenue),
    hourlySales: data.breakdowns?.hourly_sales ?? {},
    financial: data.financial_summary ?? {},
    operational: data.operational_summary ?? {},
    breakdowns: data.breakdowns ?? {},
    abnormal: data.abnormal_transactions ?? {},
    topProducts,
  };
}

export type OfficialStoreStatisticsRange = {
  orders: number;
  revenue: number;
  hourlySales: Record<string, number>;
  financial: {
    averageOrderValue: number;
    grossSales: number;
    netSales: number;
    totalCreditAdded: number;
    totalCreditUsage: number;
    totalDiscount: number;
    totalExtraCharge: number;
    totalItemSale: number;
    totalRefunds: number;
    totalRevenue: number;
    totalRounding: number;
    totalSurcharge: number;
    totalTax: number;
  };
  operational: {
    guestSales: number;
    memberSales: number;
    refundCount: number;
    totalOrders: number;
  };
  diningMode: Record<string, number>;
  paymentMethod: Record<string, number>;
  category: Record<string, number>;
  channel: Record<string, number>;
  staffPerformance: Record<string, number>;
  abnormal: {
    cancelled: { amount: number; count: number };
    coupons: { amount: number; count: number };
    creditPaid: { amount: number; count: number };
    discounts: { amount: number; count: number };
    refunds: { amount: number; count: number };
    voided: { amount: number; count: number };
  };
  topProducts: Array<{ id?: string; name: string; qty: number; total: number }>;
};

export async function fetchOfficialStoreStatisticsRange(
  start: Date,
  end: Date,
  auth?: AuthOverride
): Promise<OfficialStoreStatisticsRange> {
  const { token, shopId } = await resolveOfficialShopContext(auth);

  const useExactEnd =
    end.getHours() !== 23 ||
    end.getMinutes() !== 59 ||
    end.getSeconds() !== 59;

  const startKey = formatBusinessDate(start, false);
  const endKey = useExactEnd ? formatBusinessDateExact(end) : formatBusinessDate(end, true);
  const cacheKey = `${shopId}|${startKey}|${endKey}`;

  const cached = storeStatsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SALES_TTL_MS) {
    return cached.data;
  }
  const inFlight = storeStatsInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const snapshot = await fetchStoreStatisticsSnapshot(shopId, token, startKey, endKey);

    const f = snapshot.financial;
    const o = snapshot.operational;
    const b = snapshot.breakdowns;
    const a = snapshot.abnormal;
    const abn = (
      entry?: { amount?: number; count?: number }
    ): { amount: number; count: number } => ({
      amount: toNumber(entry?.amount),
      count: Math.round(toNumber(entry?.count)),
    });

    const result: OfficialStoreStatisticsRange = {
      orders: Math.round(snapshot.ordersTotal),
      revenue: snapshot.revenueTotal,
      hourlySales: snapshot.hourlySales,
      financial: {
        averageOrderValue: toNumber(f.average_order_value),
        grossSales: toNumber(f.gross_sales),
        netSales: toNumber(f.net_sales),
        totalCreditAdded: toNumber(f.total_credit_added),
        totalCreditUsage: toNumber(f.total_credit_usage),
        totalDiscount: toNumber(f.total_discount),
        totalExtraCharge: toNumber(f.total_extra_charge),
        totalItemSale: toNumber(f.total_item_sale),
        totalRefunds: toNumber(f.total_refunds),
        totalRevenue: toNumber(f.total_revenue),
        totalRounding: toNumber(f.total_rounding),
        totalSurcharge: toNumber(f.total_surcharge),
        totalTax: toNumber(f.total_tax),
      },
      operational: {
        guestSales: toNumber(o.guest_sales),
        memberSales: toNumber(o.member_sales),
        refundCount: Math.round(toNumber(o.refund_count)),
        totalOrders: Math.round(toNumber(o.total_orders)),
      },
      diningMode: b.dining_mode ?? {},
      paymentMethod: b.payment_method ?? {},
      category: b.category ?? {},
      channel: b.channel ?? {},
      staffPerformance: b.staff_performance ?? {},
      abnormal: {
        cancelled: abn(a.cancelled),
        coupons: abn(a.coupons),
        creditPaid: abn(a.credit_paid),
        discounts: abn(a.discounts),
        refunds: abn(a.refunds),
        voided: abn(a.voided),
      },
      topProducts: snapshot.topProducts,
    };

    storeStatsCache.set(cacheKey, { ts: Date.now(), data: result });
    return result;
  })().finally(() => {
    storeStatsInFlight.delete(cacheKey);
  });

  storeStatsInFlight.set(cacheKey, promise);
  return promise;
}

export async function fetchOfficialBusinessItemsSoldRange(
  start: Date,
  end: Date,
  auth?: AuthOverride
): Promise<number> {
  const { token, businessId } = await resolveOfficialShopContext(auth);

  const useExactEnd =
    end.getHours() !== 23 ||
    end.getMinutes() !== 59 ||
    end.getSeconds() !== 59;

  const startKey = formatBusinessDate(start, false);
  const endKey = useExactEnd ? formatBusinessDateExact(end) : formatBusinessDate(end, true);
  const cacheKey = `${businessId}|${startKey}|${endKey}`;

  const cached = businessItemsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SALES_TTL_MS) {
    return cached.data;
  }
  const inFlight = businessItemsInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const response = await api.post<BusinessSalesResponse>(
      "/dashboard/business_sales",
      {
        business_id: businessId,
        start_date: startKey,
        end_date: endKey,
        token,
      }
    );

    const data = response.data;
    if (data?.status_code !== 200) {
      throw new Error("Business sales request failed.");
    }

    const value = Math.round(toNumber(data.total_orders?.num_products));
    businessItemsCache.set(cacheKey, { ts: Date.now(), data: value });
    return value;
  })().finally(() => {
    businessItemsInFlight.delete(cacheKey);
  });

  businessItemsInFlight.set(cacheKey, promise);
  return promise;
}

export async function fetchOfficialPosItemsSoldRange(
  start: Date,
  end: Date,
  auth?: AuthOverride
): Promise<number> {
  const { token, shopId } = await resolveOfficialShopContext(auth);

  const useExactEnd =
    end.getHours() !== 23 ||
    end.getMinutes() !== 59 ||
    end.getSeconds() !== 59;

  const snapshot = await fetchPosDashboardSnapshot(
    shopId,
    token,
    formatBusinessDate(start, false),
    useExactEnd ? formatBusinessDateExact(end) : formatBusinessDate(end, true)
  );

  return Math.round(snapshot.itemsTotal);
}

async function fetchPosDashboardSnapshot(
  shopId: string,
  token: string,
  startDate: string,
  endDate: string
): Promise<PosDashboardSnapshot> {
  const response = await api.post<PosDashboardResponse>("/pos/dashboard", {
    shop_id: shopId,
    start_date: startDate,
    end_date: endDate,
    status: "paid",
    token,
  });

  const data = response.data;
  if (data?.status_code !== 200) {
    throw new Error("POS dashboard request failed.");
  }

  return {
    revenueTotal: sumSalesByMethod(data),
    itemsTotal: sumSalesByItem(data),
  };
}

async function fetchBusinessSalesSnapshot(
  businessId: string,
  token: string,
  startDate: string,
  endDate: string
): Promise<BusinessSalesSnapshot> {
  const response = await api.post<BusinessSalesResponse>(
    "/dashboard/business_sales",
    {
      business_id: businessId,
      start_date: startDate,
      end_date: endDate,
      token,
    }
  );

  const data = response.data;
  if (data?.status_code !== 200) {
    throw new Error("Business sales request failed.");
  }

  return {
    numProductsTotal: toNumber(data.total_orders?.num_products),
  };
}

async function fetchPosDashboardSalesTotal(
  shopId: string,
  token: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const snapshot = await fetchPosDashboardSnapshot(shopId, token, startDate, endDate);
  return snapshot.revenueTotal;
}

async function fetchStoreStatisticsRevenueTotal(
  shopId: string,
  token: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const snapshot = await fetchStoreStatisticsSnapshot(shopId, token, startDate, endDate);
  return snapshot.revenueTotal;
}

type OfficialShopContext = {
  email: string;
  token: string;
  businessId: string;
  shopId: string;
};

const OFFICIAL_CONTEXT_TTL_MS = 60_000;
const officialContextCache = new Map<
  string,
  { expiresAt: number; value: OfficialShopContext }
>();
const officialContextInFlight = new Map<string, Promise<OfficialShopContext>>();

function officialContextKey(auth?: AuthOverride): string {
  const tokenKey = auth?.token
    ? `${auth.token.slice(0, 8)}:${auth.token.slice(-8)}`
    : "<stored-token>";
  return `${auth?.email ?? "<stored-email>"}|${tokenKey}`;
}

async function resolveOfficialShopContextUncached(
  auth?: AuthOverride
): Promise<OfficialShopContext> {
  // In demo mode return a synthetic context immediately. All downstream API
  // calls will be intercepted by the demo adapter and return zero/empty data.
  if (isDemoMode()) {
    return {
      email: auth?.email ?? "demo@vend88.com",
      token: auth?.token ?? "demo-token",
      businessId: "demo-business",
      shopId: "demo-shop",
    };
  }
  const { email, token } = await resolveOfficialAuth(auth);
  if (!email || !token) {
    throw new Error("Official dashboard config missing.");
  }

  const preferAccountScope = Boolean(auth?.email || auth?.token);
  const envBusinessId = preferAccountScope
    ? undefined
    : process.env.EXPO_PUBLIC_OFFICIAL_BUSINESS_ID;
  const envShopId = preferAccountScope
    ? undefined
    : process.env.EXPO_PUBLIC_OFFICIAL_SHOP_ID;

  const metaSelections = await discoverSelectionsFromMeta(email, token);
  const businessId =
    envBusinessId ?? metaSelections.businessId ?? (await discoverBusinessId(email, token));
  if (!businessId) {
    throw new Error("Unable to resolve business_id for this account.");
  }

  const shopId =
    envShopId ??
    metaSelections.storeId ??
    (await discoverShopIdFromBusiness(businessId, token));
  if (!shopId) {
    throw new Error("Unable to resolve shop_id for this business.");
  }

  return { email, token, businessId, shopId };
}

async function resolveOfficialShopContext(auth?: AuthOverride): Promise<OfficialShopContext> {
  const key = officialContextKey(auth);
  const now = Date.now();

  const cached = officialContextCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inFlight = officialContextInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const promise = resolveOfficialShopContextUncached(auth)
    .then((value) => {
      officialContextCache.set(key, {
        expiresAt: Date.now() + OFFICIAL_CONTEXT_TTL_MS,
        value,
      });
      return value;
    })
    .finally(() => {
      officialContextInFlight.delete(key);
    });

  officialContextInFlight.set(key, promise);
  return promise;
}

function formatHourLabel(hour24: number): string {
  return `${String(hour24).padStart(2, "0")}:00`;
}

// ── Today hourly cache ──────────────────────────────────────────────────────
// Per-id order detail is immutable once fetched; we keep a session-wide map so
// that opening the chart twice doesn't re-fetch the same orders. The buckets
// themselves are also memoised with a short TTL so a second open within 60s
// is instant. A lightweight 5s burst-throttle prevents back-to-back refreshes
// from re-running the network at all.
const TODAY_HOURLY_TTL_MS = 60_000;
const orderDetailCache = new Map<string, OrderSearchItem>();
type TodayCacheEntry = {
  ts: number;
  data: DashboardChartPoint[];
  knownIds: Set<string>;
};
const todayHourlyCache = new Map<string, TodayCacheEntry>();
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ── Shared /pos/dashboard cache ─────────────────────────────────────────────
// The dashboard's "Top selling items" and "Dining options / Sales methods"
// charts each call /pos/dashboard with identical params per period. Without
// memoisation each period switch fires two redundant POSTs. We share the
// single response across consumers and dedupe in-flight requests so a rapid
// chip toggle (today → week → month → today) never re-hits the network for
// the same period within the TTL.
const POS_DASHBOARD_TTL_MS = 60_000;
type PosDashboardCacheEntry = { ts: number; data: PosDashboardResponse };
const posDashboardCache = new Map<string, PosDashboardCacheEntry>();
const posDashboardInFlight = new Map<string, Promise<PosDashboardResponse>>();

async function fetchPosDashboardCached(
  shopId: string,
  token: string,
  period: TopItemsPeriod
): Promise<PosDashboardResponse> {
  const { startDate, endDate } = getRangeForPeriod(period);
  const key = `${shopId}|${period}|${startDate}|${endDate}`;

  const cached = posDashboardCache.get(key);
  if (cached && Date.now() - cached.ts < POS_DASHBOARD_TTL_MS) {
    return cached.data;
  }

  const inFlight = posDashboardInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const response = await api.post<PosDashboardResponse>("/pos/dashboard", {
      shop_id: shopId,
      start_date: startDate,
      end_date: endDate,
      status: "paid",
      token,
    });
    const data = response.data ?? {};
    if (data.status_code === 200) {
      posDashboardCache.set(key, { ts: Date.now(), data });
    }
    return data;
  })()
    .finally(() => {
      posDashboardInFlight.delete(key);
    });

  posDashboardInFlight.set(key, promise);
  return promise;
}

// ── Top items result cache ─────────────────────────────────────────────────
// Caches the fully-resolved top items (including product detail names/images)
// per shop+period+limit so repeat clicks on the same chip are instant.
const TOP_ITEMS_TTL_MS = 60_000;
type TopItemsCacheEntry = { ts: number; data: DashboardTopItem[] };
const topItemsCache = new Map<string, TopItemsCacheEntry>();

// ── Hero series cache ──────────────────────────────────────────────────────
// Week/month hero series make 4–7 parallel /pos/dashboard sales-total calls.
// A short module-level TTL cache keeps tab/period flips snappy across remounts.
const HERO_SERIES_TTL_MS = 60_000;
type HeroSeriesCacheEntry = { ts: number; data: DashboardChartPoint[] };
const heroSeriesCache = new Map<string, HeroSeriesCacheEntry>();
const heroSeriesInFlight = new Map<string, Promise<DashboardChartPoint[]>>();

// ── Sales-page (Reports) caches ─────────────────────────────────────────────
// The Reports/Sales tab fires three independent network calls per period
// switch (sales history pagination, store statistics current+previous, and
// business items-sold). Caching each by absolute start/end timestamps means
// flipping between Today/Week/Month/Custom is instant once each period has
// been visited, and the previous-period comparison reuses any prior visit
// to that same range.
const SALES_TTL_MS = 60_000;

type StoreStatsCacheEntry = { ts: number; data: OfficialStoreStatisticsRange };
const storeStatsCache = new Map<string, StoreStatsCacheEntry>();
const storeStatsInFlight = new Map<string, Promise<OfficialStoreStatisticsRange>>();

type BusinessItemsCacheEntry = { ts: number; data: number };
const businessItemsCache = new Map<string, BusinessItemsCacheEntry>();
const businessItemsInFlight = new Map<string, Promise<number>>();

type SalesHistoryCacheEntry = { ts: number; data: OfficialSaleRecord[] };
const salesHistoryCache = new Map<string, SalesHistoryCacheEntry>();

// Allow the UI (pull-to-refresh) to force-bypass dashboard caches.
export function invalidateOfficialDashboardCaches(): void {
  posDashboardCache.clear();
  topItemsCache.clear();
  heroSeriesCache.clear();
  todayHourlyCache.clear();
  storeStatsCache.clear();
  businessItemsCache.clear();
  salesHistoryCache.clear();
}

export type OfficialHeroPeriod = "week" | "month" | "today";

async function fetchOfficialWeekRevenueSeries(
  shopId: string,
  token: string,
  now: Date
): Promise<DashboardChartPoint[]> {
  const weekKeys = buildWeekToDateKeys(now);
  // Always render the full Mon→Sun axis. Days that haven't occurred yet are
  // padded with revenue=0 so the chart's x-axis shows every day of the week
  // even when the line/area only covers up to "today".
  const weekStart = getWeekStartMonday(now);
  const allDays: { dateKey: string; isFuture: boolean; isToday: boolean }[] = Array.from(
    { length: 7 },
    (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      d.setHours(0, 0, 0, 0);
      const dateKey = toLocalDateKey(d);
      return {
        dateKey,
        isToday: dateKey === weekKeys[weekKeys.length - 1],
        isFuture: !weekKeys.includes(dateKey),
      };
    }
  );

  // allSettled (not all) so a single flaky day-revenue request can't blank
  // the entire week chart — failed days fall back to revenue=0 and the axis
  // still renders all 7 days.
  const results = await Promise.allSettled(
    allDays.map(async ({ dateKey, isToday, isFuture }) => {
      const dayStart = new Date(`${dateKey}T00:00:00`);
      const label = dayStart.toLocaleDateString(undefined, { weekday: "short" });
      if (isFuture) {
        return { day: label, revenue: 0 };
      }
      const dayEnd = isToday ? new Date(now) : new Date(`${dateKey}T23:59:59`);
      const revenue = await fetchStoreStatisticsRevenueTotal(
        shopId,
        token,
        formatBusinessDate(dayStart, false),
        isToday ? formatBusinessDateExact(dayEnd) : formatBusinessDate(dayEnd, true)
      );
      return { day: label, revenue };
    })
  );
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const dateKey = allDays[i].dateKey;
    const label = new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
    });
    console.log(`[hero-week] day ${dateKey} fetch failed, using 0:`, r.reason);
    return { day: label, revenue: 0 };
  });
}

async function fetchOfficialMonthRevenueSeries(
  shopId: string,
  token: string,
  now: Date
): Promise<DashboardChartPoint[]> {
  const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const totalDaysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // allSettled so a single failing weekly bucket doesn't blank the whole month.
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, async (_, i) => {
      const startDay = Math.floor((daysInMonth * i) / 4) + 1;
      const endDay = Math.floor((daysInMonth * (i + 1)) / 4);

      if (startDay > totalDaysElapsed) {
        return {
          day: `W${i + 1}`,
          revenue: 0,
        };
      }

      const bucketStart = new Date(monthStartDate);
      bucketStart.setDate(startDay);
      bucketStart.setHours(0, 0, 0, 0);

      const cappedEndDay = Math.min(endDay, totalDaysElapsed);
      const bucketEnd = new Date(monthStartDate);
      bucketEnd.setDate(cappedEndDay);
      bucketEnd.setHours(23, 59, 59, 0);
      const isCurrentPartialBucket = totalDaysElapsed < endDay;

      const revenue = await fetchStoreStatisticsRevenueTotal(
        shopId,
        token,
        formatBusinessDate(bucketStart, false),
        isCurrentPartialBucket ? formatBusinessDateExact(now) : formatBusinessDate(bucketEnd, true)
      );

      return {
        day: `W${i + 1}`,
        revenue,
      };
    })
  );
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.log(`[hero-month] bucket W${i + 1} fetch failed, using 0:`, r.reason);
    return { day: `W${i + 1}`, revenue: 0 };
  });
}

async function fetchOfficialTodayRevenueSeries(
  token: string,
  businessId: string,
  now: Date
): Promise<DashboardChartPoint[]> {
  const localDayStart = new Date(now);
  localDayStart.setHours(0, 0, 0, 0);
  const localDayEnd = new Date(now);
  localDayEnd.setHours(23, 59, 59, 0);

  const cacheKey = `${businessId}:${dayKey(now)}`;
  const cached = todayHourlyCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TODAY_HOURLY_TTL_MS) {
    console.log("[hero-today] cache hit, age=", Date.now() - cached.ts, "ms");
    return cached.data;
  }

  const hourlyByHour = new Map<number, number>();
  try {
    const listPayload = {
      ignore_pagination: true,
      query: {
        time: [
          formatBusinessDate(localDayStart, false),
          formatBusinessDate(localDayEnd, true),
        ],
        business_id: businessId,
      },
      token,
    };
    const listResp = await api.post<OrderSearchResponse>(
      "/search/order_search",
      listPayload
    );
    const rawIds = Array.isArray(listResp.data?.orders)
      ? listResp.data!.orders!.filter(
          (v): v is string => typeof v === "string" && v.trim().length > 0
        )
      : [];

    const newIds = rawIds.filter((id) => !orderDetailCache.has(id));
    console.log(
      `[hero-today] ids total=${rawIds.length} new=${newIds.length} cached=${rawIds.length - newIds.length}`
    );

    const BATCH = 10;
    for (let i = 0; i < newIds.length; i += BATCH) {
      const slice = newIds.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        slice.map(async (id) => {
          const resp = await api.post<OrderSearchResponse>(
            "/search/order_search",
            { detail: true, query: { _id: id }, token }
          );
          const orders = resp.data?.orders;
          if (Array.isArray(orders) && orders.length > 0) {
            const first = orders[0];
            if (typeof first === "object" && first !== null) {
              return { id, item: first as OrderSearchItem };
            }
          }
          return null;
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          orderDetailCache.set(r.value.id, r.value.item);
        }
      }
    }

    for (const id of rawIds) {
      const order = orderDetailCache.get(id);
      if (!order) continue;
      const parsed = parseApiDateToLocal(order.time);
      if (!parsed) continue;
      if (parsed < localDayStart || parsed > localDayEnd) continue;
      const hour = parsed.getHours();
      hourlyByHour.set(hour, (hourlyByHour.get(hour) ?? 0) + toNumber(order.price));
    }
  } catch (err) {
    console.log("[hero-today] order_search error:", err);
  }

  const today = Array.from({ length: 24 }, (_, hour) => ({
    day: formatHourLabel(hour),
    revenue: hourlyByHour.get(hour) ?? 0,
  }));

  todayHourlyCache.set(cacheKey, {
    ts: Date.now(),
    data: today,
    knownIds: new Set(orderDetailCache.keys()),
  });

  return today;
}

export async function fetchOfficialHeroRevenuePeriod(
  period: OfficialHeroPeriod,
  auth?: AuthOverride
): Promise<DashboardChartPoint[]> {
  const { token, businessId, shopId } = await resolveOfficialShopContext(auth);
  const now = new Date();

  // "today" already has its own per-hour cache inside the today series fetcher,
  // so we only memoise week/month at this layer to keep "today" fresh-ish.
  if (period === "today") {
    return fetchOfficialTodayRevenueSeries(token, businessId, now);
  }

  const key = `${shopId}|${period}|${dayKey(now)}`;
  const cached = heroSeriesCache.get(key);
  if (cached && Date.now() - cached.ts < HERO_SERIES_TTL_MS) {
    return cached.data;
  }
  const inFlight = heroSeriesInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const series =
      period === "week"
        ? await fetchOfficialWeekRevenueSeries(shopId, token, now)
        : await fetchOfficialMonthRevenueSeries(shopId, token, now);
    heroSeriesCache.set(key, { ts: Date.now(), data: series });
    return series;
  })().finally(() => {
    heroSeriesInFlight.delete(key);
  });

  heroSeriesInFlight.set(key, promise);
  return promise;
}

export async function fetchOfficialHeroRevenueSeries(
  auth?: AuthOverride
): Promise<OfficialHeroRevenueSeries> {
  const { token, businessId, shopId } = await resolveOfficialShopContext(auth);
  const now = new Date();
  const [week, month, today] = await Promise.all([
    fetchOfficialWeekRevenueSeries(shopId, token, now),
    fetchOfficialMonthRevenueSeries(shopId, token, now),
    fetchOfficialTodayRevenueSeries(token, businessId, now),
  ]);

  return { week, month, today };
}

type ProductRecord = Record<string, unknown>;

type ProductSearchResponse = {
  status_code?: number;
  products?: ProductRecord[];
  product?: ProductRecord[];
  data?: ProductRecord[];
  results?: ProductRecord[];
};

function pickString(obj: ProductRecord, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return undefined;
}

function pickImage(obj: ProductRecord): string | undefined {
  const direct = pickString(obj, ["image", "image_url", "imageUrl", "photo", "cover"]);
  if (direct) return direct;
  for (const k of ["image_urls", "images", "photos", "pictures"]) {
    const v = obj[k];
    if (Array.isArray(v) && v.length > 0) {
      const first = v[0];
      if (typeof first === "string" && first.trim()) return first;
      if (first && typeof first === "object") {
        const inner = pickString(first as ProductRecord, ["url", "src", "image", "path"]);
        if (inner) return inner;
      }
    }
  }
  return undefined;
}

async function resolveProductDetails(
  ids: string[],
  shopId: string,
  businessId: string,
  token: string
): Promise<Record<string, { name: string; image?: string; price?: number }>> {
  if (ids.length === 0) return {};
  void shopId;
  void businessId;
  const details: Record<string, { name: string; image?: string; price?: number }> = {};

  try {
    const response = await api.post<ProductSearchResponse>(
      "/product/batch_details",
      { product_ids: ids, token }
    );
    const data = response.data ?? {};
    const products: ProductRecord[] =
      data.products ?? data.product ?? data.data ?? data.results ?? [];
    console.log(
      "[top-items] batch_details status:",
      data.status_code,
      "products:",
      Array.isArray(products) ? products.length : 0
    );
    if (Array.isArray(products)) {
      for (const product of products) {
        const productId = pickString(product, ["_id", "id", "product_id"]);
        if (!productId) continue;
        const name = pickString(product, [
          "name",
          "title",
          "product_name",
          "display_name",
        ]);
        if (!name) continue;
        let price: number | undefined;
        for (const k of ["price", "cost", "default_price", "unit_price", "amount"]) {
          const v = product[k];
          if (typeof v === "number" && Number.isFinite(v)) {
            price = v;
            break;
          }
          if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
            price = Number(v);
            break;
          }
        }
        details[productId] = { name, image: pickImage(product), price };
      }
    }
  } catch (err) {
    console.log("[top-items] batch_details error:", err);
  }

  return details;
}

// ── product image batch lookup ────────────────────────────────────────────
/**
 * Fetches image URLs for a list of product IDs in a single
 * POST /search/product_search request using a MongoDB $in query.
 * Returns a Record<productId, firstImageUrl>.
 */
async function fetchProductImagesBatch(
  productIds: string[],
  token: string
): Promise<Record<string, string>> {
  if (productIds.length === 0) return {};
  try {
    const payload: Record<string, unknown> = {
      query: { _id: { $in: productIds } },
      detail: true,
      page_size: productIds.length,
      page_idx: 0,
    };
    if (token) payload.token = token;

    const resp = await api.post<CatalogProductSearchResponse>(
      "/search/product_search",
      payload
    );
    const products = resp.data?.products ?? [];
    const map: Record<string, string> = {};
    for (const p of products) {
      const id = p.product_id ?? (p as unknown as { _id?: string })._id;
      if (!id) continue;
      const url = Array.isArray(p.image_urls) ? p.image_urls[0] : undefined;
      if (url) map[id] = url;
    }
    return map;
  } catch {
    return {};
  }
}

// ── productStatistics ──────────────────────────────────────────────────────
// Response shape for POST /dashboard/productStatistics
type ProductStatisticsResponse = {
  status_code?: number;
  product_id?: string;
  product_name?: string;
  sales_by_day?: Array<{ date: string; qty: number; revenue: number }>;
  statistics?: {
    actual_revenue: number;
    appearing_in_orders: number;
    options_revenue: number;
    total_gross_revenue: number;
    total_qty_sold: number;
  };
  time_range?: { start?: string; end?: string };
};

type ProductStatDetail = { name: string; revenue: number; qty: number };

/**
 * Fetches per-product statistics (name, revenue, qty sold) from
 * POST /dashboard/productStatistics for each product ID in parallel.
 * Uses allSettled so a single failing request does not cancel the others.
 */
async function fetchProductStatisticsBatch(
  productIds: string[],
  shopId: string,
  token: string,
  startDate: string,
  endDate: string
): Promise<Record<string, ProductStatDetail>> {
  if (productIds.length === 0) return {};

  const results = await Promise.allSettled(
    productIds.map((productId) =>
      api
        .post<ProductStatisticsResponse>("/dashboard/productStatistics", {
          shop_id: shopId,
          product_id: productId,
          start_date: startDate,
          end_date: endDate,
          token,
        })
        .then((resp) => {
          const d = resp.data;
          if (d?.status_code !== 200 || !d.product_name) return null;
          return {
            id: productId,
            name: d.product_name,
            revenue: d.statistics?.actual_revenue ?? 0,
            qty: d.statistics?.total_qty_sold ?? 0,
          };
        })
    )
  );

  const map: Record<string, ProductStatDetail> = {};
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      const { id, ...detail } = r.value;
      map[id] = detail;
    }
  }
  return map;
}

export async function fetchOfficialTopSellingItems(
  limit = 10,
  period: TopItemsPeriod = "month",
  auth?: AuthOverride
): Promise<DashboardTopItem[]> {
  const { token, shopId } = await resolveOfficialShopContext(auth);

  const cacheKey = `${shopId}|${period}|${limit}`;
  const cached = topItemsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TOP_ITEMS_TTL_MS) {
    return cached.data;
  }

  // Step 1 — get ranked product IDs from the aggregated POS dashboard.
  const dashData = await fetchPosDashboardCached(shopId, token, period);
  console.log(
    "[top-items] pos/dashboard status:",
    dashData?.status_code,
    "items:",
    dashData?.sales_by_item ? Object.keys(dashData.sales_by_item).length : 0
  );
  if (dashData?.status_code !== 200 || !dashData.sales_by_item) {
    throw new Error("POS dashboard request failed.");
  }

  const topIds = Object.entries(dashData.sales_by_item)
    .map(([id, amount]) => ({ id, fallbackRevenue: toNumber(amount) }))
    .filter((row) => row.fallbackRevenue > 0)
    .sort((a, b) => b.fallbackRevenue - a.fallbackRevenue)
    .slice(0, limit);

  // Step 2 — fetch detailed stats for each product from productStatistics.
  // This gives us the accurate product name, qty sold, and actual revenue.
  const { startDate, endDate } = getRangeForPeriod(period);
  const [statsMap, imageMap] = await Promise.all([
    fetchProductStatisticsBatch(
      topIds.map((r) => r.id),
      shopId,
      token,
      startDate,
      endDate
    ),
    fetchProductImagesBatch(topIds.map((r) => r.id), token),
  ]);

  const result: DashboardTopItem[] = topIds.map(({ id, fallbackRevenue }) => {
    const stats = statsMap[id];
    return {
      id,
      name: stats?.name ?? `Item ${id.slice(-6).toUpperCase()}`,
      units: stats?.qty ?? 0,
      revenue: (stats?.revenue ?? fallbackRevenue).toFixed(2),
      image: imageMap[id],
    };
  });

  topItemsCache.set(cacheKey, { ts: Date.now(), data: result });
  return result;
}


export async function fetchOfficialMonthRevenueData(
  auth?: AuthOverride
): Promise<{
  summary: DashboardSummary;
  chart: DashboardChartPoint[];
}> {
  return fetchOfficialMonthRevenueDataForAuth(auth);
}

export async function fetchOfficialMonthRevenueDataForAuth(
  auth?: AuthOverride
): Promise<{
  summary: DashboardSummary;
  chart: DashboardChartPoint[];
}> {
  const { token, businessId, shopId: storeId } = await resolveOfficialShopContext(auth);

  const now = new Date();
  const { startDate, endDate } = getMonthRange(now);
  const previousMonthRange = getPreviousMonthRange(now);
  const weekRange = getWeeklyRange();
  const previousWeekRange = getPreviousWeeklyRange(now);
  const todayRange = getTodayRange();
  const previousDayRange = getPreviousDayRange(now);
  const [
    monthBusinessSales,
    weekBusinessSales,
    todayBusinessSales,
    monthStats,
    weekStats,
    previousWeekStats,
    todayStats,
    previousDayStats,
    previousMonthStats,
  ] = await Promise.all([
    fetchBusinessSalesSnapshot(businessId, token, startDate, endDate),
    fetchBusinessSalesSnapshot(
      businessId,
      token,
      weekRange.startDate,
      weekRange.endDate
    ),
    fetchBusinessSalesSnapshot(
      businessId,
      token,
      todayRange.startDate,
      todayRange.endDate
    ),
    fetchStoreStatisticsSnapshot(storeId, token, startDate, endDate),
    fetchStoreStatisticsSnapshot(
      storeId,
      token,
      weekRange.startDate,
      weekRange.endDate
    ),
    fetchStoreStatisticsSnapshot(
      storeId,
      token,
      previousWeekRange.startDate,
      previousWeekRange.endDate
    ),
    fetchStoreStatisticsSnapshot(
      storeId,
      token,
      todayRange.startDate,
      todayRange.endDate
    ),
    fetchStoreStatisticsSnapshot(
      storeId,
      token,
      previousDayRange.startDate,
      previousDayRange.endDate
    ),
    fetchStoreStatisticsSnapshot(
      storeId,
      token,
      previousMonthRange.startDate,
      previousMonthRange.endDate
    ),
  ]);
  // Keep the summary request focused on KPI data only; week/month/today chart
  // series are loaded lazily by the dashboard screen for the active period.
  const chart: DashboardChartPoint[] = [];

  const monthOrders = Math.round(monthStats.ordersTotal);
  const weekOrders = Math.round(weekStats.ordersTotal);
  const todayOrders = Math.round(todayStats.ordersTotal);
  const monthRevenue = monthStats.revenueTotal;
  const previousMonthRevenue = previousMonthStats.revenueTotal;
  const previousMonthOrders = previousMonthStats.ordersTotal;
  const revenueChangePct =
    previousMonthRevenue > 0
      ? ((monthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100
      : 0;
  const todayRevenue = todayStats.revenueTotal;
  const previousDayRevenue = previousDayStats.revenueTotal;
  const todayRevenueChangePct =
    previousDayRevenue > 0
      ? ((todayRevenue - previousDayRevenue) / previousDayRevenue) * 100
      : todayRevenue > 0
      ? 100
      : 0;
  const weekRevenue = weekStats.revenueTotal;
  const previousWeekRevenue = previousWeekStats.revenueTotal;
  const weekRevenueChangePct =
    previousWeekRevenue > 0
      ? ((weekRevenue - previousWeekRevenue) / previousWeekRevenue) * 100
      : weekRevenue > 0
      ? 100
      : 0;
  const ordersChangePct =
    previousMonthOrders > 0
      ? ((monthOrders - previousMonthOrders) / previousMonthOrders) * 100
      : 0;
  const avgOrder = monthOrders > 0 ? monthRevenue / monthOrders : 0;
  return {
    summary: {
      today_sales: todayRevenue.toFixed(2),
      today_revenue_change_pct: todayRevenueChangePct,
      week_revenue: weekRevenue.toFixed(2),
      week_revenue_change_pct: weekRevenueChangePct,
      today_items: Math.round(todayBusinessSales.numProductsTotal),
      week_items: Math.round(weekBusinessSales.numProductsTotal),
      today_orders: todayOrders,
      week_orders: weekOrders,
      total_orders: monthOrders,
      total_products: Math.round(monthBusinessSales.numProductsTotal),
      avg_order_value: avgOrder.toFixed(2),
      total_revenue_month: monthRevenue.toFixed(2),
      revenue_change_pct: revenueChangePct,
      orders_change_pct: ordersChangePct,
    },
    chart,
  };
}

export async function fetchOfficialRecentOrders(
  auth?: AuthOverride
): Promise<DashboardRecentOrder[]> {
  return fetchOfficialRecentOrdersForAuth(auth);
}

export async function fetchOfficialRecentOrdersForAuth(
  auth?: AuthOverride
): Promise<DashboardRecentOrder[]> {
  const { token, businessId, shopId: storeId } = await resolveOfficialShopContext(auth);
  const { startDate, endDate } = getRecentRange();

  const baseQuery: Record<string, unknown> = {
    time: [startDate, endDate],
  };
  const rawOrders = await requestScopedOrders(token, baseQuery, businessId, storeId);

  const detailedOrders = rawOrders.filter(
    (order): order is OrderSearchItem => typeof order === "object" && order !== null
  );

  const orderIds = rawOrders.filter(
    (order): order is string => typeof order === "string" && order.trim().length > 0
  );

  let resolvedOrders: OrderSearchItem[] = detailedOrders;
  if (resolvedOrders.length === 0 && orderIds.length > 0) {
    const byIdResults = await Promise.allSettled(
      orderIds.slice(0, 6).map(async (id) => {
        const response = await api.get<OrderByIdResponse>(`/order/${id}`);
        if (response.data?.status_code === 200 && response.data.data) {
          return response.data.data;
        }
        return null;
      })
    );

    resolvedOrders = byIdResults
      .filter((r): r is PromiseFulfilledResult<OrderSearchItem | null> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((v): v is OrderSearchItem => v !== null);
  }

  return resolvedOrders.slice(0, 6).map((order) => {
    const qty = Array.isArray(order.qtys)
      ? order.qtys.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0)
      : 0;

    return {
      id: order.order_num ? `#${order.order_num}` : order.order_id ?? "-",
      item: `${qty || 1} item${qty === 1 ? "" : "s"}${order.pick_method ? ` • ${order.pick_method}` : ""}`,
      module: mapOrderModule(order.source),
      payment: mapPayment(order.transactions?.[0]?.platform),
      total: toNumber(order.price).toFixed(2),
      status: mapOrderStatus(order.status),
      rawStatus: typeof order.status === "string" ? order.status : undefined,
      time: toRelativeTime(order.time),
      rawId: typeof order.order_id === "string" ? order.order_id : undefined,
      rawTime: typeof order.time === "string" ? order.time : undefined,
    };
  });
}

export async function fetchOfficialWeeklyRevenueChart(
  auth?: AuthOverride
): Promise<DashboardChartPoint[]> {
  const series = await fetchOfficialHeroRevenueSeries(auth);
  return series.week;
}

/**
 * Fetch the full detail payload for a single order. Used by the
 * order-detail sheet on the Reports/Sales page. Looks up by Mongo `_id`
 * (the same string returned in the `orders` array of `/search/order_search`).
 */
export async function fetchOfficialOrderDetail(
  rawId: string,
  auth?: AuthOverride,
  signal?: AbortSignal
): Promise<OfficialOrderDetail | null> {
  if (!rawId || typeof rawId !== "string") return null;
  const { token } = await resolveOfficialShopContext(auth);
  const payload: Record<string, unknown> = {
    detail: true,
    query: { _id: rawId },
  };
  if (token) payload.token = token;
  try {
    const resp = await api.post<OrderSearchResponse>(
      "/search/order_search",
      payload,
      { signal }
    );
    const orders = resp.data?.orders;
    if (Array.isArray(orders) && orders.length > 0) {
      const first = orders[0];
      if (typeof first === "object" && first !== null) {
        return first as OfficialOrderDetail;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function fetchOfficialProductDetails(
  ids: string[],
  auth?: AuthOverride
): Promise<Record<string, { name: string; image?: string; price?: number }>> {
  const cleaned = Array.from(
    new Set(
      (ids ?? []).filter(
        (id): id is string => typeof id === "string" && id.length > 0
      )
    )
  );
  if (cleaned.length === 0) return {};
  const { token, businessId, shopId } = await resolveOfficialShopContext(auth);
  return resolveProductDetails(cleaned, shopId, businessId, token);
}

export async function fetchOfficialSalesHistory(
  start: Date,
  end: Date,
  auth?: AuthOverride,
  signal?: AbortSignal,
  onProgress?: (progress: OfficialSalesHistoryProgress) => void
): Promise<OfficialSaleRecord[]> {
  const { token, businessId, shopId } = await resolveOfficialShopContext(auth);

  const startKey = formatBusinessDate(start, false);
  const endKey = formatBusinessDate(end, true);
  const cacheKey = `${shopId}|${businessId}|${startKey}|${endKey}`;

  if (!signal?.aborted) {
    const cached = salesHistoryCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < SALES_TTL_MS) {
      return cached.data;
    }
  }

  const baseQuery: Record<string, unknown> = {
    time: [startKey, endKey],
  };

  const requestOrders = async (query: Record<string, unknown>) => {
    const MAX_PAGES_HARD = 200;
    const PAGE_SIZE_GUESS = 10;
    const PAGE_CONCURRENCY = 6;

    const dedupeRows = (rows: Array<OrderSearchItem | string>) => {
      const seen = new Set<string>();
      const merged: Array<OrderSearchItem | string> = [];
      for (const row of rows) {
        const key =
          typeof row === "string"
            ? row
            : String((row.order_id ?? row.order_num ?? "")).trim();
        const unique = key.length > 0 ? key : JSON.stringify(row);
        if (seen.has(unique)) continue;
        seen.add(unique);
        merged.push(row);
      }
      return merged;
    };

    // Fast path: ask for the full ID list in one request (no `detail`).
    // The Vend88 backend honours `ignore_pagination: true` only when the
    // response is the lightweight string-ID list — when `detail: true` is
    // also set the server still caps the response at one page (10 rows),
    // which is why fetching with detail+ignore_pagination only returned 10
    // orders even for 269-order weeks. We fetch IDs here, then fan out to
    // /order/{id} for the per-row details below.
    try {
      const idsPayload: Record<string, unknown> = {
        ignore_pagination: true,
        query,
      };
      if (token) idsPayload.token = token;

      const idsResp = await api.post<OrderSearchResponse>(
        "/search/order_search",
        idsPayload,
        { signal }
      );
      const rows = Array.isArray(idsResp.data?.orders)
        ? idsResp.data!.orders!
        : [];
      // Heuristic: if the server returned more than one page worth of rows
      // (or any non-string row, meaning detail mode kicked in for some
      // reason), treat it as the canonical list. Otherwise fall back to
      // paginated detail fetching below.
      if (rows.length > PAGE_SIZE_GUESS) {
        return dedupeRows(rows);
      }
      // If we got <= one page of string IDs, the server may simply have
      // that few orders for the range — return them.
      if (
        rows.length > 0 &&
        rows.every((r) => typeof r === "string")
      ) {
        return dedupeRows(rows);
      }
    } catch {
      // fall through to paginated path
    }

    const fetchPage = async (
      page: number,
      ignorePagination: boolean
    ): Promise<{ rows: Array<OrderSearchItem | string>; maxPage: number | null }> => {
      const payload: Record<string, unknown> = {
        detail: true,
        ignore_pagination: ignorePagination,
        query,
      };
      if (!ignorePagination) payload.page = page;
      if (token) payload.token = token;

      const response = await api.post<OrderSearchResponse>(
        "/search/order_search",
        payload,
        { signal }
      );
      const rows = Array.isArray(response.data?.orders) ? response.data.orders : [];
      const rawMax = response.data?.max_page;
      const maxPage =
        typeof rawMax === "number" && Number.isFinite(rawMax) && rawMax > 0
          ? Math.floor(rawMax)
          : null;
      return { rows, maxPage };
    };

    // Always paginate. The server's `ignore_pagination: true` flag is not
    // honoured for /search/order_search (it still caps at one page), so we
    // crawl pages until either `max_page` is reached or a batch returns no
    // rows. Pages are fetched in parallel batches for speed.
    let firstPage: { rows: Array<OrderSearchItem | string>; maxPage: number | null };
    try {
      firstPage = await fetchPage(0, false);
    } catch {
      return [];
    }

    if (firstPage.rows.length === 0) {
      return [];
    }

    const declaredMax = firstPage.maxPage;
    const declaredPages = declaredMax != null ? declaredMax + 1 : null;
    const totalPages = Math.max(
      1,
      Math.min(
        declaredPages ?? (firstPage.rows.length >= PAGE_SIZE_GUESS ? MAX_PAGES_HARD : 1),
        MAX_PAGES_HARD
      )
    );

    const pageRows: Array<OrderSearchItem | string> = [...firstPage.rows];
    if (totalPages > 1) {
      const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 1);
      for (let i = 0; i < pages.length; i += PAGE_CONCURRENCY) {
        const batch = pages.slice(i, i + PAGE_CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (page) => {
            try {
              return await fetchPage(page, false);
            } catch {
              return { rows: [], maxPage: null };
            }
          })
        );
        let batchHadRows = false;
        for (const result of results) {
          if (result.rows.length > 0) {
            pageRows.push(...result.rows);
            batchHadRows = true;
          }
        }
        // If the whole batch returned nothing, we're past the last page.
        if (!batchHadRows) break;
      }
    }

    return dedupeRows(pageRows);
  };

  let rawOrders: Array<OrderSearchItem | string> = [];
  const scopedQueries = buildScopedQueries(baseQuery, businessId, shopId);
  const queries = scopedQueries.length > 0 ? scopedQueries : [baseQuery];
  for (const query of queries) {
    rawOrders = await requestOrders(query);
    if (rawOrders.length > 0) break;
  }

  const detailedOrders = rawOrders.filter(
    (order): order is OrderSearchItem => typeof order === "object" && order !== null
  );

  const orderIds = rawOrders.filter(
    (order): order is string => typeof order === "string" && order.trim().length > 0
  );

  const toSaleRecord = (order: OrderSearchItem, index: number): OfficialSaleRecord => {
    const items = Array.isArray(order.qtys)
      ? order.qtys.reduce((sum, qty) => sum + (Number.isFinite(qty) ? qty : 0), 0)
      : 0;
    const payment = mapPayment(order.transactions?.[0]?.platform);
    const resolvedDate = resolveOrderTime(order) ?? start.toISOString();
    return {
      id: order.order_num ?? order.order_id ?? index,
      rawId: typeof order.order_id === "string" ? order.order_id : undefined,
      date: resolvedDate,
      order_id: order.order_num ? `#${order.order_num}` : order.order_id ?? `#${index}`,
      items: items || 1,
      module: mapOrderModule(order.source),
      payment,
      total: toNumber(order.price).toFixed(2),
      rawStatus: typeof order.status === "string" ? order.status : undefined,
      status: mapOrderStatus(order.status),
    };
  };

  const mergeOrders = (...buckets: OrderSearchItem[][]): OrderSearchItem[] => {
    const seen = new Set<string>();
    const list: OrderSearchItem[] = [];
    for (const bucket of buckets) {
      for (const order of bucket) {
        const key = String(order.order_id ?? order.order_num ?? "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        list.push(order);
      }
    }
    return list;
  };

  const emitProgress = (rows: OrderSearchItem[], totalHint: number) => {
    if (!onProgress || signal?.aborted) return;
    const records = rows.map((order, index) => toSaleRecord(order, index));
    onProgress({
      loaded: records.length,
      total: Math.max(totalHint, records.length),
      rows: records,
    });
  };

  let resolvedById: OrderSearchItem[] = [];
  if (orderIds.length > 0) {
    // Throttle the per-id fan-out so we don't open hundreds of sockets at
    // once on slow mobile networks. 8 in flight is a healthy compromise
    // between throughput and connection pressure.
    //
    // We use POST /search/order_search with `_id` + `detail: true` (the
    // same path used by hero-today) rather than GET /order/{id}, because
    // the REST endpoint omits fields like `price` and `qtys` from its
    // response payload — which previously caused all rows to render as
    // $0.00 in the transactions list.
    const ID_CONCURRENCY = 8;
    const fetchOne = async (id: string) => {
      const payload: Record<string, unknown> = {
        detail: true,
        query: { _id: id },
      };
      if (token) payload.token = token;
      const resp = await api.post<OrderSearchResponse>(
        "/search/order_search",
        payload,
        { signal }
      );
      const orders = resp.data?.orders;
      if (Array.isArray(orders) && orders.length > 0) {
        const first = orders[0];
        if (typeof first === "object" && first !== null) {
          return first as OrderSearchItem;
        }
      }
      return null;
    };

    const collected: OrderSearchItem[] = [];
    const totalHint = detailedOrders.length + orderIds.length;
    if (detailedOrders.length > 0) {
      emitProgress(mergeOrders(detailedOrders), totalHint);
    }
    for (let i = 0; i < orderIds.length; i += ID_CONCURRENCY) {
      if (signal?.aborted) break;
      const batch = orderIds.slice(i, i + ID_CONCURRENCY);
      const results = await Promise.allSettled(batch.map(fetchOne));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) collected.push(r.value);
      }
      emitProgress(mergeOrders(detailedOrders, collected), totalHint);
    }
    resolvedById = collected;
  }

  const mergedOrders: OrderSearchItem[] = (() => {
    const seen = new Set<string>();
    const list: OrderSearchItem[] = [];
    for (const order of [...detailedOrders, ...resolvedById]) {
      const key = String(order.order_id ?? order.order_num ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push(order);
    }
    return list;
  })();

  const result: OfficialSaleRecord[] = mergedOrders.map((order, index) =>
    toSaleRecord(order, index)
  );

  if (!signal?.aborted) {
    salesHistoryCache.set(cacheKey, { ts: Date.now(), data: result });
  }
  return result;
}

export async function fetchOfficialDiningOptions(
  period: "month" | "week" | "today",
  auth?: AuthOverride
): Promise<Record<string, number>> {
  const breakdown = await fetchOfficialPosBreakdown(period, auth);
  return breakdown.sales_by_dine_option;
}

export async function fetchOfficialPosBreakdown(
  period: "month" | "week" | "today",
  auth?: AuthOverride
): Promise<{
  sales_by_dine_option: Record<string, number>;
  sales_by_method: Record<string, number>;
}> {
  const { token, shopId: storeId } = await resolveOfficialShopContext(auth);

  const data = await fetchPosDashboardCached(storeId, token, period);
  if (data?.status_code !== 200) {
    throw new Error("POS dashboard request failed.");
  }

  let dineOptions: Record<string, number> = data?.sales_by_dine_option ?? {};
  let methods: Record<string, number> = data?.sales_by_method ?? {};

  // /pos/dashboard occasionally returns empty `sales_by_dine_option` /
  // `sales_by_method` even when there are paid orders for the period
  // (e.g. orders with no recorded dine option). The same period's
  // /dashboard/storeStatistics response carries the authoritative
  // `breakdowns.dining_mode` / `breakdowns.payment_method` (also used by
  // the Reports/Sales page), so fall back to it when the POS payload is
  // empty. The storeStatistics call is cached per range, so this is
  // typically a no-op once the Reports tab has been opened.
  const dineEmpty = Object.keys(dineOptions).length === 0;
  const methodsEmpty = Object.keys(methods).length === 0;
  if (dineEmpty || methodsEmpty) {
    try {
      const now = new Date();
      const range =
        period === "month"
          ? getMonthRange(now)
          : period === "week"
          ? getWeeklyRange(now)
          : getTodayRange(now);
      // Convert the formatted range strings back to Date for the cached API.
      const startDate = new Date(range.startDate.replace(" ", "T").replace(" +", "+"));
      const endDate = new Date(range.endDate.replace(" ", "T").replace(" +", "+"));
      const stats = await fetchOfficialStoreStatisticsRange(
        Number.isNaN(startDate.getTime()) ? now : startDate,
        Number.isNaN(endDate.getTime()) ? now : endDate,
        auth
      );
      if (dineEmpty && Object.keys(stats.diningMode).length > 0) {
        dineOptions = stats.diningMode;
      }
      if (methodsEmpty && Object.keys(stats.paymentMethod).length > 0) {
        methods = stats.paymentMethod;
      }
    } catch (err) {
      console.log("[pos-breakdown] storeStatistics fallback failed:", err);
    }
  }

  return {
    sales_by_dine_option: dineOptions,
    sales_by_method: methods,
  };
}

// ─── Close history (handover / EOD reports) ─────────────────────────────────

export type OfficialCloseHistoryItem = {
  _id: string;
  type: string; // "EOD" | "SHIFT" | "KIOSK" | etc.
  shop_id: string;
  staff_id: string;
  staff_name: string;
  start_time: string;
  end_time: string;
  business_info: {
    shop_id: string;
    shop_name: string;
    staff_id: string;
    staff_name: string;
    start_time: string;
    end_time: string;
  };
  financial_summary: {
    average_order_value: number;
    gross_sales: number;
    net_sales: number;
    total_credit_added: number;
    total_discount: number;
    total_extra_charge: number;
    total_item_sale: number;
    total_refunds: number;
    total_revenue: number;
    total_surcharge: number;
    total_tax: number;
  };
  operational_summary: {
    guest_sales: number;
    member_sales: number;
    refund_count: number;
    total_orders: number;
  };
  breakdowns: {
    categories?: Record<string, number>;
    channel?: Record<string, number>;
    dining_mode?: Record<string, number>;
    hourly_sales?: Record<string, number>;
    payment_method?: Record<string, number>;
    staff_performance?: Record<string, number>;
  };
  ServiceTax?: Record<string, number>;
  top_products?: Array<{
    id?: string;
    _id?: string;
    product_id?: string;
    product?: string;
    name?: string;
    product_name?: string;
    title?: string;
    item_name?: string;
    qty?: number;
    quantity?: number;
    count?: number;
    total?: number;
    amount?: number;
    price?: number;
  }>;
};

type CloseHistoryResponse = {
  status_code?: number;
  daily_closes?: OfficialCloseHistoryItem[];
};

export async function fetchOfficialCloseHistory(
  start: Date,
  end: Date,
  auth?: AuthOverride
): Promise<OfficialCloseHistoryItem[]> {
  const { token, shopId } = await resolveOfficialShopContext(auth);

  const payload: Record<string, unknown> = {
    shop_id: shopId,
    start_time: formatBusinessDate(start, false),
    end_time: formatBusinessDate(end, true),
  };
  if (token) payload.token = token;

  const response = await api.post<CloseHistoryResponse>(
    "/pos/close_history",
    payload
  );

  const data = response.data;
  if (data?.status_code !== 200) {
    throw new Error("Close history request failed.");
  }

  return Array.isArray(data.daily_closes) ? data.daily_closes : [];
}

// ─── Catalog: categories + products ─────────────────────────────────────────

export type OfficialProduct = {
  product_id: string;
  name: string;
  category: string[];
  price: number;
  description?: string;
  image_urls: string[];
  sku?: string;
  active: boolean;
  pricing_unit?: string;
  prepare_time?: number;
  calorie?: number;
};

type AllCategoryResponse = {
  status_code?: number;
  categorys?: string[];
};

type CatalogProductSearchResponse = {
  status_code?: number;
  max_page?: number | string;
  maxPage?: number | string;
  total_pages?: number | string;
  total_page?: number | string;
  pages?: number | string;
  products?: OfficialProduct[];
};

const PRODUCT_CATEGORIES_TTL_MS = 60_000;
const productCategoriesCache = new Map<
  string,
  { ts: number; data: string[] }
>();

export async function fetchOfficialProductCategories(
  auth?: AuthOverride
): Promise<string[]> {
  const { token, businessId } = await resolveOfficialShopContext(auth);

  const cacheKey = businessId;
  const cached = productCategoriesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PRODUCT_CATEGORIES_TTL_MS) {
    return cached.data;
  }

  const payload: Record<string, unknown> = { business_id: businessId };
  if (token) payload.token = token;

  const response = await api.post<AllCategoryResponse>(
    "/product/all_category",
    payload
  );

  const data = response.data;
  if (data?.status_code !== 200) {
    throw new Error("Categories request failed.");
  }

  const categories = Array.isArray(data.categorys) ? data.categorys : [];
  productCategoriesCache.set(cacheKey, { ts: Date.now(), data: categories });
  return categories;
}

export async function fetchOfficialProductPage(
  pageIdx: number,
  pageSize: number,
  auth?: AuthOverride
): Promise<{ products: OfficialProduct[]; maxPageIndex: number | null }> {
  const { token, businessId } = await resolveOfficialShopContext(auth);

  const payload: Record<string, unknown> = {
    query: { business_id: businessId },
    detail: true,
    page_size: pageSize,
    page_idx: pageIdx,
  };
  if (token) payload.token = token;

  const response = await api.post<CatalogProductSearchResponse>(
    "/search/product_search",
    payload
  );

  const data = response.data;
  if (data?.status_code !== 200) {
    throw new Error("Product search failed.");
  }

  const rawMaxPage =
    data.max_page ?? data.maxPage ?? data.total_pages ?? data.total_page ?? data.pages;
  const parsedMaxPage = Number(rawMaxPage);
  const maxPageIndex =
    Number.isFinite(parsedMaxPage) && parsedMaxPage >= 0
      ? Math.floor(parsedMaxPage)
      : null;

  return {
    products: Array.isArray(data.products) ? data.products : [],
    maxPageIndex,
  };
}

export async function fetchAllOfficialProducts(
  auth?: AuthOverride,
  pageSize = 100
): Promise<OfficialProduct[]> {
  const MAX_PAGES_HARD = 200;
  const PAGE_CONCURRENCY = 6;

  const first = await fetchOfficialProductPage(0, pageSize, auth);
  if (first.products.length === 0) return [];

  const declaredUpperBoundPages =
    first.maxPageIndex != null
      ? Math.min(Math.max(first.maxPageIndex + 1, 1), MAX_PAGES_HARD)
      : null;
  const totalPages =
    declaredUpperBoundPages ??
    (first.products.length >= pageSize ? MAX_PAGES_HARD : 1);

  const remaining: OfficialProduct[][] = [];
  if (totalPages > 1) {
    const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 1);
    for (let i = 0; i < pages.length; i += PAGE_CONCURRENCY) {
      const batch = pages.slice(i, i + PAGE_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (page) => {
          try {
            const res = await fetchOfficialProductPage(page, pageSize, auth);
            return res.products;
          } catch {
            return [] as OfficialProduct[];
          }
        })
      );
      let batchHadRows = false;
      for (const rows of results) {
        if (rows.length > 0) {
          remaining.push(rows);
          batchHadRows = true;
        }
      }
      if (!batchHadRows) break;
    }
  }

  const seen = new Set<string>();
  const merged: OfficialProduct[] = [];
  for (const list of [first.products, ...remaining]) {
    for (const p of list) {
      const key = p.product_id || p.name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(p);
    }
  }
  return merged;
}

export type OfficialProductDetail = OfficialProduct & {
  business_id?: string;
  options?: unknown[];
  suffix?: unknown[];
  tax_required?: boolean;
};

type ProductDetailResponse = OfficialProductDetail & {
  status_code?: number;
  _id?: string;
};

export async function fetchOfficialProductDetail(
  productId: string,
  auth?: AuthOverride
): Promise<OfficialProductDetail> {
  const { token } = await resolveOfficialShopContext(auth);

  const payload: Record<string, unknown> = { product_id: productId };
  if (token) payload.token = token;

  const response = await api.post<ProductDetailResponse>(
    "/product/detail",
    payload
  );

  const data = response.data;
  if (!data || data.status_code !== 200) {
    throw new Error("Product detail request failed.");
  }

  return data;
}

// ─── Shop / store detail ────────────────────────────────────────────────────

export type OpenHourSlot = { start_time: string; end_time: string };

export type OfficialShopOpenHours = {
  monday: OpenHourSlot[];
  tuesday: OpenHourSlot[];
  wednesday: OpenHourSlot[];
  thursday: OpenHourSlot[];
  friday: OpenHourSlot[];
  saturday: OpenHourSlot[];
  sunday: OpenHourSlot[];
};

export type OfficialNamedSurcharge = {
  name: string;
  date: string;
  enabled: boolean;
  percentage: number;
};

export type OfficialShopStaff = {
  _id: string;
  name: string;
  code?: string;
  permission?: string[];
  shop_id?: string;
};

export type OfficialShopDetail = {
  _id: string;
  business_id?: string;
  shop_key?: string;
  name?: string;
  store_name?: string;
  location?: string;
  phone?: string;
  description?: string;
  warehouse_id?: string;
  max_perorderday?: number;
  logo?: string;
  banner?: string;
  open_hour: OfficialShopOpenHours;
  named_surcharges: Record<string, OfficialNamedSurcharge>;
  surcharge: Record<string, number>;
  staff: OfficialShopStaff[];
  raw: Record<string, unknown>;
};

type ShopSearchResponse = {
  status_code?: number;
  shop?: Array<Record<string, unknown>>;
};

const EMPTY_HOURS: OfficialShopOpenHours = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

function normalizeOpenHours(value: unknown): OfficialShopOpenHours {
  const out: OfficialShopOpenHours = { ...EMPTY_HOURS };
  if (!value || typeof value !== "object") return out;
  const src = value as Record<string, unknown>;
  for (const day of Object.keys(EMPTY_HOURS) as (keyof OfficialShopOpenHours)[]) {
    const raw = src[day];
    if (Array.isArray(raw)) {
      out[day] = raw
        .map((slot) => {
          if (!slot || typeof slot !== "object") return null;
          const s = slot as Record<string, unknown>;
          const start = typeof s.start_time === "string" ? s.start_time : "";
          const end = typeof s.end_time === "string" ? s.end_time : "";
          if (!start || !end) return null;
          return { start_time: start, end_time: end } as OpenHourSlot;
        })
        .filter((x): x is OpenHourSlot => x !== null);
    }
  }
  return out;
}

function normalizeNamedSurcharges(
  value: unknown
): Record<string, OfficialNamedSurcharge> {
  const out: Record<string, OfficialNamedSurcharge> = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    out[key] = {
      name: typeof r.name === "string" ? r.name : key,
      date: typeof r.date === "string" ? r.date : "",
      enabled: Boolean(r.enabled),
      percentage: typeof r.percentage === "number" ? r.percentage : 0,
    };
  }
  return out;
}

function normalizeSurcharge(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

function normalizeStaff(value: unknown): OfficialShopStaff[] {  if (!Array.isArray(value)) return [];
  return value
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const r = s as Record<string, unknown>;
      const id = typeof r._id === "string" ? r._id : "";
      const name = typeof r.name === "string" ? r.name : "";
      if (!id && !name) return null;
      return {
        _id: id,
        name,
        code: typeof r.code === "string" ? r.code : undefined,
        permission: Array.isArray(r.permission)
          ? (r.permission.filter((p) => typeof p === "string") as string[])
          : undefined,
        shop_id: typeof r.shop_id === "string" ? r.shop_id : undefined,
      } as OfficialShopStaff;
    })
    .filter((x): x is OfficialShopStaff => x !== null);
}

function normalizeShopDetail(raw: Record<string, unknown>): OfficialShopDetail {
  const meta =
    raw.meta && typeof raw.meta === "object"
      ? (raw.meta as Record<string, unknown>)
      : {};
  const logo = typeof meta.logo === "string" ? meta.logo : undefined;
  const banner = typeof meta.banner === "string" ? meta.banner : undefined;

  return {
    _id: typeof raw._id === "string" ? raw._id : "",
    business_id:
      typeof raw.business_id === "string" ? raw.business_id : undefined,
    shop_key: typeof raw.shop_key === "string" ? raw.shop_key : undefined,
    name: typeof raw.name === "string" ? raw.name : undefined,
    store_name: typeof raw.store_name === "string" ? raw.store_name : undefined,
    location: typeof raw.location === "string" ? raw.location : undefined,
    phone: typeof raw.phone === "string" ? raw.phone : undefined,
    description:
      typeof raw.description === "string" ? raw.description : undefined,
    warehouse_id:
      typeof raw.warehouse_id === "string" ? raw.warehouse_id : undefined,
    max_perorderday:
      typeof raw.max_perorderday === "number" ? raw.max_perorderday : undefined,
    logo,
    banner,
    open_hour: normalizeOpenHours(raw.open_hour),
    named_surcharges: normalizeNamedSurcharges(raw.named_surcharges),
    surcharge: normalizeSurcharge(raw.surcharge),
    staff: normalizeStaff(raw.staff),
    raw,
  };
}

/**
 * Fetches the current store's detail from `/search/shop_search`.
 *
 * If `shopId` is omitted, falls back to the active shop discovered via
 * the user's meta selections (same resolution used by other dashboard calls).
 */
export async function fetchOfficialShopDetail(
  shopId?: string,
  auth?: AuthOverride
): Promise<OfficialShopDetail> {
  const ctx = await resolveOfficialShopContext(auth);
  const targetId = shopId ?? ctx.shopId;

  const payload: Record<string, unknown> = {
    query: { _id: targetId },
    detail: true,
    token: ctx.token,
  };

  const response = await api.post<ShopSearchResponse>(
    "/search/shop_search",
    payload
  );
  const data = response.data;
  if (!data || data.status_code !== 200 || !Array.isArray(data.shop)) {
    throw new Error("Shop detail request failed.");
  }

  const match =
    data.shop.find((s) => (s as Record<string, unknown>)._id === targetId) ??
    data.shop[0];
  if (!match) {
    throw new Error("Shop not found.");
  }

  return normalizeShopDetail(match as Record<string, unknown>);
}

export type UpdateShopPatch = {
  open_hour?: OfficialShopOpenHours;
  named_surcharges?: Record<string, OfficialNamedSurcharge>;
  surcharge?: Record<string, number>;
  name?: string;
  description?: string;
  location?: string;
  phone?: string;
};

type UpdateShopResponse = { status_code?: number; message?: string };

/**
 * Persist edits to a shop record via `/shop/update_shop`.
 *
 * Only fields included in `patch` are sent. Required identifiers (`shop_id`,
 * `token`) are appended automatically based on the active shop context.
 */
export async function updateOfficialShop(
  patch: UpdateShopPatch,
  auth?: AuthOverride
): Promise<void> {
  const ctx = await resolveOfficialShopContext(auth);
  const payload: Record<string, unknown> = {
    ...patch,
    shop_id: ctx.shopId,
    token: ctx.token,
  };

  const response = await api.post<UpdateShopResponse>(
    "/shop/update_shop",
    payload
  );
  const data = response.data;
  if (!data || data.status_code !== 200) {
    throw new Error(data?.message ?? "Failed to update store.");
  }
}

