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

function getMonthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
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

function getWeeklyRange(now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  return {
    startDate: formatBusinessDate(start, false),
    endDate: formatBusinessDate(end, true),
  };
}

function buildLastSevenDayKeys(now = new Date()): string[] {
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - index));
    return d.toISOString().slice(0, 10);
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
      if (typeof businessSelection === "string" && businessSelection.trim().length > 0) {
        return businessSelection;
      }
    } catch {
      // Try the next payload variation.
    }
  }

  return null;
}

export async function fetchOfficialMonthRevenueData(): Promise<{
  summary: DashboardSummary;
  chart: DashboardChartPoint[];
}> {
  let businessId = process.env.EXPO_PUBLIC_OFFICIAL_BUSINESS_ID;
  const [storedEmail, storedToken] = await Promise.all([
    SecureStore.getItemAsync(AUTH_EMAIL_KEY),
    SecureStore.getItemAsync(AUTH_TOKEN_KEY),
  ]);

  const email = storedEmail ?? process.env.EXPO_PUBLIC_OFFICIAL_EMAIL;
  const token = storedToken ?? process.env.EXPO_PUBLIC_OFFICIAL_TOKEN;

  if (!email || !token) {
    throw new Error("Official business sales config missing.");
  }

  if (!businessId) {
    businessId = await discoverBusinessId(email, token);
  }

  if (!businessId) {
    throw new Error("Unable to resolve business_id for this account.");
  }

  const { startDate, endDate } = getMonthRange();
  const response = await api.post<BusinessSalesResponse>("/dashboard/business_sales", {
    business_id: businessId,
    email,
    start_date: startDate,
    end_date: endDate,
    token,
  });

  const data = response.data;
  if (data?.status_code !== 200) {
    throw new Error("Official business sales request failed.");
  }

  const dailyStats = data.daily_statistics ?? {};
  const sortedDays = Object.keys(dailyStats).sort();
  const lastSevenDays = sortedDays.slice(-7);

  const chart: DashboardChartPoint[] = lastSevenDays.map((dateKey) => {
    const d = new Date(`${dateKey}T00:00:00`);
    const day = d.toLocaleDateString(undefined, { weekday: "short" });
    return {
      day,
      revenue: toNumber(dailyStats[dateKey]?.sales),
    };
  });

  const todayKey = new Date().toISOString().slice(0, 10);
  const todaySales = toNumber(dailyStats[todayKey]?.sales);

  const totalSales = toNumber(data.total_orders?.sales);
  const totalOrderCount =
    toNumber(data.total_order_count) || toNumber(data.total_orders?.num_sales);
  const totalProducts = toNumber(data.total_orders?.num_products);
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

export async function fetchOfficialRecentOrders(): Promise<DashboardRecentOrder[]> {
  const [storedEmail, storedToken] = await Promise.all([
    SecureStore.getItemAsync(AUTH_EMAIL_KEY),
    SecureStore.getItemAsync(AUTH_TOKEN_KEY),
  ]);

  const email = storedEmail ?? process.env.EXPO_PUBLIC_OFFICIAL_EMAIL;
  const token = storedToken ?? process.env.EXPO_PUBLIC_OFFICIAL_TOKEN;

  const envBusinessId = process.env.EXPO_PUBLIC_OFFICIAL_BUSINESS_ID;
  const businessId =
    envBusinessId ?? (email && token ? await discoverBusinessId(email, token) : null);
  const { startDate, endDate } = getRecentRange();

  const baseQuery: Record<string, unknown> = {
    time: [startDate, endDate],
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
        // Try the next lighter/heavier variation.
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
    // Some accounts return empty when scoped by business selection.
    // Retry with time-only query to keep recent orders visible.
    rawOrders = await requestOrders(baseQuery);
  }

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

export async function fetchOfficialWeeklyRevenueChart(): Promise<DashboardChartPoint[]> {
  const [storedEmail, storedToken] = await Promise.all([
    SecureStore.getItemAsync(AUTH_EMAIL_KEY),
    SecureStore.getItemAsync(AUTH_TOKEN_KEY),
  ]);

  const email = storedEmail ?? process.env.EXPO_PUBLIC_OFFICIAL_EMAIL;
  const token = storedToken ?? process.env.EXPO_PUBLIC_OFFICIAL_TOKEN;
  const envBusinessId = process.env.EXPO_PUBLIC_OFFICIAL_BUSINESS_ID;
  const businessId =
    envBusinessId ?? (email && token ? await discoverBusinessId(email, token) : null);

  const { startDate, endDate } = getWeeklyRange();
  const baseQuery: Record<string, unknown> = {
    time: [startDate, endDate],
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

  const revenueByDay = new Map<string, number>();
  for (const order of detailedOrders) {
    if (!order.time) {
      continue;
    }

    const dayKey = new Date(order.time.replace(" ", "T").replace(" +", "+"))
      .toISOString()
      .slice(0, 10);
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
