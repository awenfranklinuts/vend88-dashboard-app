import { api } from "./api";
import * as SecureStore from "expo-secure-store";

const AUTH_TOKEN_KEY = "vend88-auth-token";
const AUTH_EMAIL_KEY = "vend88-auth-email";

export type DashboardSummary = {
  today_sales: string;
  week_revenue?: string;
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
  total: string;
  status: string;
  time: string;
};

type AuthOverride = {
  email?: string | null;
  token?: string | null;
};

export type OfficialSaleRecord = {
  id: string | number;
  date: string;
  order_id: string;
  items: number;
  module: string;
  payment: string;
  total: string;
  status: string;
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

function getTodayRange(now = new Date()) {
  const start = new Date(now);
  const end = new Date(now);
  return {
    startDate: formatBusinessDate(start, false),
    endDate: formatBusinessDate(end, true),
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
      try {
        const response = await api.post<OrderSearchResponse>(
          "/search/order_search",
          payload
        );
        if (Array.isArray(response.data?.orders) && response.data.orders.length > 0) {
          return response.data.orders;
        }
      } catch {
        // Try the next scoped query variation.
      }
    }
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

  return {
    ordersTotal: toNumber(data.operational_summary?.total_orders),
    revenueTotal: toNumber(data.financial_summary?.total_revenue),
    hourlySales: data.breakdowns?.hourly_sales ?? {},
    financial: data.financial_summary ?? {},
    operational: data.operational_summary ?? {},
    breakdowns: data.breakdowns ?? {},
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

  const snapshot = await fetchStoreStatisticsSnapshot(
    shopId,
    token,
    formatBusinessDate(start, false),
    useExactEnd ? formatBusinessDateExact(end) : formatBusinessDate(end, true)
  );

  const f = snapshot.financial;
  const o = snapshot.operational;
  const b = snapshot.breakdowns;

  return {
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
  };
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

  const response = await api.post<BusinessSalesResponse>(
    "/dashboard/business_sales",
    {
      business_id: businessId,
      start_date: formatBusinessDate(start, false),
      end_date: useExactEnd ? formatBusinessDateExact(end) : formatBusinessDate(end, true),
      token,
    }
  );

  const data = response.data;
  if (data?.status_code !== 200) {
    throw new Error("Business sales request failed.");
  }

  return Math.round(toNumber(data.total_orders?.num_products));
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

  return Promise.all(
    allDays.map(async ({ dateKey, isToday, isFuture }) => {
      const dayStart = new Date(`${dateKey}T00:00:00`);
      const label = dayStart.toLocaleDateString(undefined, { weekday: "short" });
      if (isFuture) {
        return { day: label, revenue: 0 };
      }
      const dayEnd = isToday ? new Date(now) : new Date(`${dateKey}T23:59:59`);
      const revenue = await fetchPosDashboardSalesTotal(
        shopId,
        token,
        formatBusinessDate(dayStart, false),
        isToday ? formatBusinessDateExact(dayEnd) : formatBusinessDate(dayEnd, true)
      );
      return { day: label, revenue };
    })
  );
}

async function fetchOfficialMonthRevenueSeries(
  shopId: string,
  token: string,
  now: Date
): Promise<DashboardChartPoint[]> {
  const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const totalDaysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  return Promise.all(
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

      const revenue = await fetchPosDashboardSalesTotal(
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

  if (period === "week") {
    return fetchOfficialWeekRevenueSeries(shopId, token, now);
  }
  if (period === "month") {
    return fetchOfficialMonthRevenueSeries(shopId, token, now);
  }
  return fetchOfficialTodayRevenueSeries(token, businessId, now);
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
): Promise<Record<string, { name: string; image?: string }>> {
  if (ids.length === 0) return {};
  void shopId;
  void businessId;
  const details: Record<string, { name: string; image?: string }> = {};

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
        details[productId] = { name, image: pickImage(product) };
      }
    }
  } catch (err) {
    console.log("[top-items] batch_details error:", err);
  }

  return details;
}

export async function fetchOfficialTopSellingItems(
  limit = 10,
  period: TopItemsPeriod = "month",
  auth?: AuthOverride
): Promise<DashboardTopItem[]> {
  const { token, businessId, shopId } = await resolveOfficialShopContext(auth);

  const { startDate, endDate } = getRangeForPeriod(period);

  const response = await api.post<PosDashboardResponse>("/pos/dashboard", {
    shop_id: shopId,
    start_date: startDate,
    end_date: endDate,
    status: "paid",
    token,
  });

  const data = response.data;
  console.log(
    "[top-items] pos/dashboard status:",
    data?.status_code,
    "items:",
    data?.sales_by_item ? Object.keys(data.sales_by_item).length : 0,
    "keys:",
    Object.keys(data ?? {})
  );
  if (data?.status_code !== 200 || !data.sales_by_item) {
    throw new Error("POS dashboard request failed.");
  }

  const entries = Object.entries(data.sales_by_item)
    .map(([id, amount]) => ({ id, revenue: toNumber(amount) }))
    .filter((row) => row.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);

  const detailMap = await resolveProductDetails(
    entries.map((row) => row.id),
    shopId,
    businessId,
    token
  );

  return entries.map((row) => {
    const detail = detailMap[row.id];
    const name = detail?.name ?? `Item ${row.id.slice(-6).toUpperCase()}`;
    return {
      id: row.id,
      name,
      units: Math.round(row.revenue),
      revenue: row.revenue.toFixed(2),
      image: detail?.image,
    };
  });
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
  const todayRange = getTodayRange();
  const rawOrders = await requestScopedOrders(
    token,
    { time: [startDate, endDate] },
    businessId,
    storeId
  );

  const detailedOrders = rawOrders.filter(
    (order): order is OrderSearchItem => typeof order === "object" && order !== null
  );

  const revenueByDay = new Map<string, number>();
  const [
    monthSnapshot,
    weekSnapshot,
    todaySnapshot,
    monthBusinessSales,
    weekBusinessSales,
    todayBusinessSales,
    monthStats,
    weekStats,
    todayStats,
    previousMonthStats,
  ] = await Promise.all([
    fetchPosDashboardSnapshot(storeId, token, startDate, endDate),
    fetchPosDashboardSnapshot(
      storeId,
      token,
      weekRange.startDate,
      weekRange.endDate
    ),
    fetchPosDashboardSnapshot(
      storeId,
      token,
      todayRange.startDate,
      todayRange.endDate
    ),
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
      todayRange.startDate,
      todayRange.endDate
    ),
    fetchStoreStatisticsSnapshot(
      storeId,
      token,
      previousMonthRange.startDate,
      previousMonthRange.endDate
    ),
  ]);

  let totalProductsFromOrders = 0;
  for (const order of detailedOrders) {
    if (Array.isArray(order.qtys)) {
      totalProductsFromOrders += order.qtys.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
    }
    if (order.time) {
      const parsedDate = parseApiDateToLocal(order.time);
      if (!parsedDate) continue;
      const dayKey = toLocalDateKey(parsedDate);
      revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + toNumber(order.price));
    }
  }

  const weekToDateKeys = buildWeekToDateKeys(now);
  const chart: DashboardChartPoint[] = weekToDateKeys.map((dateKey) => {
    const d = new Date(`${dateKey}T00:00:00`);
    return {
      day: d.toLocaleDateString(undefined, { weekday: "short" }),
      revenue: revenueByDay.get(dateKey) ?? 0,
    };
  });

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
  const ordersChangePct =
    previousMonthOrders > 0
      ? ((monthOrders - previousMonthOrders) / previousMonthOrders) * 100
      : 0;
  const avgOrder = monthOrders > 0 ? monthRevenue / monthOrders : 0;
  void totalProductsFromOrders;

  return {
    summary: {
      today_sales: todaySnapshot.revenueTotal.toFixed(2),
      week_revenue: weekSnapshot.revenueTotal.toFixed(2),
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
      total: toNumber(order.price).toFixed(2),
      status: mapOrderStatus(order.status),
      time: toRelativeTime(order.time),
    };
  });
}

export async function fetchOfficialWeeklyRevenueChart(
  auth?: AuthOverride
): Promise<DashboardChartPoint[]> {
  const series = await fetchOfficialHeroRevenueSeries(auth);
  return series.week;
}

export async function fetchOfficialSalesHistory(
  start: Date,
  end: Date,
  auth?: AuthOverride,
  signal?: AbortSignal
): Promise<OfficialSaleRecord[]> {
  const { token, businessId, shopId } = await resolveOfficialShopContext(auth);

  const baseQuery: Record<string, unknown> = {
    time: [formatBusinessDate(start, false), formatBusinessDate(end, true)],
  };

  const requestOrders = async (query: Record<string, unknown>) => {
    const MAX_PAGES_HARD = 80;
    const PAGE_SIZE_GUESS = 10;
    const PAGE_CONCURRENCY = 3;

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
        declaredPages ?? (firstPage.rows.length >= PAGE_SIZE_GUESS ? 2 : 1),
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
        for (const result of results) {
          if (result.rows.length > 0) {
            pageRows.push(...result.rows);
          }
        }
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

  let resolvedById: OrderSearchItem[] = [];
  if (orderIds.length > 0) {
    const byIdResults = await Promise.allSettled(
      orderIds.map(async (id) => {
        const response = await api.get<OrderByIdResponse>(`/order/${id}`, {
          signal,
        });
        if (response.data?.status_code === 200 && response.data.data) {
          return response.data.data;
        }
        return null;
      })
    );

    resolvedById = byIdResults
      .filter(
        (r): r is PromiseFulfilledResult<OrderSearchItem | null> => r.status === "fulfilled"
      )
      .map((r) => r.value)
      .filter((v): v is OrderSearchItem => v !== null);
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

  return mergedOrders.map((order, index) => {
    const items = Array.isArray(order.qtys)
      ? order.qtys.reduce((sum, qty) => sum + (Number.isFinite(qty) ? qty : 0), 0)
      : 0;
    const payment = mapPayment(order.transactions?.[0]?.platform);
    const resolvedDate = resolveOrderTime(order) ?? start.toISOString();
    return {
      id: order.order_num ?? order.order_id ?? index,
      date: resolvedDate,
      order_id: order.order_num ? `#${order.order_num}` : order.order_id ?? `#${index}`,
      items: items || 1,
      module: mapOrderModule(order.source),
      payment,
      total: toNumber(order.price).toFixed(2),
      status: mapOrderStatus(order.status),
    };
  });
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

  let startDate: string, endDate: string;
  const now = new Date();

  if (period === "month") {
    const range = getMonthRange(now);
    startDate = range.startDate;
    endDate = range.endDate;
  } else if (period === "week") {
    const range = getWeeklyRange(now);
    startDate = range.startDate;
    endDate = range.endDate;
  } else {
    const range = getTodayRange(now);
    startDate = range.startDate;
    endDate = range.endDate;
  }

  const response = await api.post<PosDashboardResponse>("/pos/dashboard", {
    shop_id: storeId,
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
    sales_by_dine_option: data?.sales_by_dine_option ?? {},
    sales_by_method: data?.sales_by_method ?? {},
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
  top_products?: Array<{ name: string; qty: number; total: number }>;
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
