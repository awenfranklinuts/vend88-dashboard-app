import { api } from "./api";
import * as SecureStore from "expo-secure-store";

const AUTH_TOKEN_KEY = "vend88-auth-token";
const AUTH_EMAIL_KEY = "vend88-auth-email";

export type DashboardSummary = {
  today_sales: string;
  total_orders: number;
  total_products: number;
  avg_order_value: string;
  total_revenue_month: string;
  revenue_change_pct: number;
  orders_change_pct: number;
};

export type DashboardChartPoint = { day: string; revenue: number };

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
  orders?: OrderSearchItem[] | string[];
};

type OrderByIdResponse = {
  status_code?: number;
  data?: OrderSearchItem;
};

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
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
  return `${y}-${m}-${d} ${time} ${formatOffset(date)}`;
}

function formatBusinessDateExact(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss} ${formatOffset(date)}`;
}

function getMonthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: formatBusinessDate(start, false),
    endDate: formatBusinessDateExact(now),
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

function getWeeklyRange(now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  return {
    startDate: formatBusinessDate(start, false),
    endDate: formatBusinessDate(end, true),
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

function buildLastSevenDayKeys(now = new Date()): string[] {
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - index));
    return toLocalDateKey(d);
  });
}

function toRelativeTime(value?: string): string {
  if (!value) return "-";
  const normalized = value.includes(" ")
    ? value.replace(" ", "T").replace(" +", "+")
    : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
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
  sales_by_item?: Record<string, number>;
  sales_by_category?: Record<string, number>;
};

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
  const { email, token } = await resolveOfficialAuth(auth);
  if (!email || !token) {
    throw new Error("Official dashboard config missing.");
  }

  const preferAccountScope = Boolean(auth?.email || auth?.token);
  const envBusinessId = preferAccountScope
    ? undefined
    : process.env.EXPO_PUBLIC_OFFICIAL_BUSINESS_ID;
  const metaSelections = await discoverSelectionsFromMeta(email, token);
  const businessId = envBusinessId ?? metaSelections.businessId ?? (await discoverBusinessId(email, token));
  if (!businessId) {
    throw new Error("Unable to resolve business_id for this account.");
  }
  console.log("[top-items] businessId:", businessId);

  const envShopId = preferAccountScope
    ? undefined
    : process.env.EXPO_PUBLIC_OFFICIAL_SHOP_ID;
  const shopId =
    envShopId ?? metaSelections.storeId ?? (await discoverShopIdFromBusiness(businessId, token));
  if (!shopId) {
    throw new Error("Unable to resolve shop_id for this business.");
  }
  console.log("[top-items] shopId:", shopId, "period:", period);

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
  const preferAccountScope = Boolean(auth?.email || auth?.token);
  let businessId = preferAccountScope
    ? undefined
    : process.env.EXPO_PUBLIC_OFFICIAL_BUSINESS_ID;
  const { email, token } = await resolveOfficialAuth(auth);

  if (!email || !token) {
    throw new Error("Official business sales config missing.");
  }

  const metaSelections = await discoverSelectionsFromMeta(email, token);
  const storeId = metaSelections.storeId;

  if (!businessId) {
     businessId = metaSelections.businessId ?? (await discoverBusinessId(email, token)) ?? undefined;
  }

  if (!businessId || !storeId) {
    throw new Error("Unable to resolve business/store for this account.");
  }

  const { startDate, endDate } = getMonthRange();
  const rawOrders = await requestScopedOrders(
    token,
    { time: [startDate, endDate] },
    businessId,
    storeId
  );

  const detailedOrders = rawOrders.filter(
    (order): order is OrderSearchItem => typeof order === "object" && order !== null
  );
  if (detailedOrders.length === 0) {
    throw new Error("No month revenue found for this store.");
  }

  const revenueByDay = new Map<string, number>();
  let totalSales = 0;
  let totalProducts = 0;
  for (const order of detailedOrders) {
    totalSales += toNumber(order.price);
    if (Array.isArray(order.qtys)) {
      totalProducts += order.qtys.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
    }
    if (order.time) {
      const dayKey = toLocalDateKey(
        new Date(order.time.replace(" ", "T").replace(" +", "+"))
      );
      revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + toNumber(order.price));
    }
  }

  const lastSevenDays = buildLastSevenDayKeys();
  const chart: DashboardChartPoint[] = lastSevenDays.map((dateKey) => {
    const d = new Date(`${dateKey}T00:00:00`);
    return {
      day: d.toLocaleDateString(undefined, { weekday: "short" }),
      revenue: revenueByDay.get(dateKey) ?? 0,
    };
  });

  const todayKey = toLocalDateKey(new Date());
  const todaySales = revenueByDay.get(todayKey) ?? 0;
  const totalOrderCount = detailedOrders.length;
  const avgOrder = totalOrderCount > 0 ? totalSales / totalOrderCount : 0;

  return {
    summary: {
      today_sales: todaySales.toFixed(2),
      total_orders: totalOrderCount,
      total_products: totalProducts,
      avg_order_value: avgOrder.toFixed(2),
      total_revenue_month: totalSales.toFixed(2),
      revenue_change_pct: 0,
      orders_change_pct: 0,
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
  const { email, token } = await resolveOfficialAuth(auth);

  const preferAccountScope = Boolean(auth?.email || auth?.token);
  const envBusinessId = preferAccountScope
    ? undefined
    : process.env.EXPO_PUBLIC_OFFICIAL_BUSINESS_ID;
  const metaSelections =
    email && token
      ? await discoverSelectionsFromMeta(email, token)
      : { businessId: null, storeId: null };
  const businessId =
    envBusinessId ?? metaSelections.businessId ?? (email && token ? await discoverBusinessId(email, token) : null);
  const storeId = metaSelections.storeId;
  const { startDate, endDate } = getRecentRange();

  const baseQuery: Record<string, unknown> = {
    time: [startDate, endDate],
  };
  if (!token || !businessId || !storeId) {
    return [];
  }

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
  const { email, token } = await resolveOfficialAuth(auth);
  const preferAccountScope = Boolean(auth?.email || auth?.token);
  const envBusinessId = preferAccountScope
    ? undefined
    : process.env.EXPO_PUBLIC_OFFICIAL_BUSINESS_ID;
  const metaSelections =
    email && token
      ? await discoverSelectionsFromMeta(email, token)
      : { businessId: null, storeId: null };
  const businessId =
    envBusinessId ?? metaSelections.businessId ?? (email && token ? await discoverBusinessId(email, token) : null);
  const storeId = metaSelections.storeId;

  const { startDate, endDate } = getWeeklyRange();
  const baseQuery: Record<string, unknown> = {
    time: [startDate, endDate],
  };
  if (!token || !businessId || !storeId) {
    return [];
  }

  const rawOrders = await requestScopedOrders(token, baseQuery, businessId, storeId);

  const detailedOrders = rawOrders.filter(
    (order): order is OrderSearchItem => typeof order === "object" && order !== null
  );

  const revenueByDay = new Map<string, number>();
  for (const order of detailedOrders) {
    if (!order.time) {
      continue;
    }

    const dayKey = toLocalDateKey(
      new Date(order.time.replace(" ", "T").replace(" +", "+"))
    );
    revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + toNumber(order.price));
  }

  return buildLastSevenDayKeys().map((dateKey) => {
    const d = new Date(`${dateKey}T00:00:00`);
    return {
      day: d.toLocaleDateString(undefined, { weekday: "short" }),
      revenue: revenueByDay.get(dateKey) ?? 0,
    };
  });
}

export async function fetchOfficialSalesHistory(
  start: Date,
  end: Date
): Promise<OfficialSaleRecord[]> {
  const [storedEmail, storedToken] = await Promise.all([
    SecureStore.getItemAsync(AUTH_EMAIL_KEY),
    SecureStore.getItemAsync(AUTH_TOKEN_KEY),
  ]);

  const email = storedEmail ?? process.env.EXPO_PUBLIC_OFFICIAL_EMAIL;
  const token = storedToken ?? process.env.EXPO_PUBLIC_OFFICIAL_TOKEN;
  const envBusinessId = process.env.EXPO_PUBLIC_OFFICIAL_BUSINESS_ID;
  const businessId =
    envBusinessId ?? (email && token ? await discoverBusinessId(email, token) : null);

  const baseQuery: Record<string, unknown> = {
    time: [formatBusinessDate(start, false), formatBusinessDate(end, true)],
  };

  const requestOrders = async (query: Record<string, unknown>) => {
    const payloads: Array<Record<string, unknown>> = [
      {
        detail: true,
        ignore_pagination: false,
        page: 0,
        query,
      },
      {
        detail: true,
        ignore_pagination: true,
        query,
      },
    ];

    if (token) {
      for (const payload of payloads) {
        payload.token = token;
      }
    }

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
        // Try the next variation.
      }
    }

    return [];
  };

  let rawOrders: Array<OrderSearchItem | string> = [];
  if (businessId) {
    rawOrders = await requestOrders({
      ...baseQuery,
      business_id: businessId,
    });
  }
  if (rawOrders.length === 0) {
    rawOrders = await requestOrders(baseQuery);
  }

  const detailedOrders = rawOrders.filter(
    (order): order is OrderSearchItem => typeof order === "object" && order !== null
  );

  return detailedOrders.map((order, index) => {
    const items = Array.isArray(order.qtys)
      ? order.qtys.reduce((sum, qty) => sum + (Number.isFinite(qty) ? qty : 0), 0)
      : 0;
    const payment = mapPayment(order.transactions?.[0]?.platform);
    return {
      id: order.order_num ?? order.order_id ?? index,
      date: order.time ?? new Date().toISOString(),
      order_id: order.order_num ? `#${order.order_num}` : order.order_id ?? `#${index}`,
      items: items || 1,
      module: mapOrderModule(order.source),
      payment,
      total: toNumber(order.price).toFixed(2),
      status: mapOrderStatus(order.status),
    };
  });
}
