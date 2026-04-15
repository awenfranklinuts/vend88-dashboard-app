import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/services/api";

type Sale = {
  id: number;
  date: string;
  order_id: string;
  items: number;
  module: string;
  payment: string;
  total: string;
  status: string;
};

type PeriodSummary = {
  revenue: string;
  orders: number;
  avg: string;
};

type SalesSummary = {
  today: PeriodSummary;
  this_week: PeriodSummary;
  this_month: PeriodSummary;
};

type ModuleStat = {
  module: string;
  revenue: number;
  orders: number;
  pct: number;
};

const MODULE_COLORS: Record<string, string> = {
  POS: "#0f4cc9",
  KDS: "#d97706",
  Vending: "#059669",
  Kiosk: "#7c3aed",
  Loyalty: "#db2777",
};

const PERIODS = ["today", "this_week", "this_month"] as const;
type Period = typeof PERIODS[number];
const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
};

export default function SalesScreen() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [byModule, setByModule] = useState<ModuleStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("this_week");

  const fetchAll = async () => {
    const [s, sm, bm] = await Promise.allSettled([
      api.get<Sale[]>("/sales"),
      api.get<SalesSummary>("/sales/summary"),
      api.get<ModuleStat[]>("/sales/by-module"),
    ]);
    if (s.status === "fulfilled") setSales(s.value.data);
    if (sm.status === "fulfilled") setSummary(sm.value.data);
    if (bm.status === "fulfilled") setByModule(bm.value.data);
  };

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const stat = summary ? summary[period] : null;

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#0f4cc9" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0f4cc9" />}
      ListHeaderComponent={() => (
        <>
          {/* Header */}
          <Text style={styles.title}>Sales Report</Text>
          <Text style={styles.subtitle}>Revenue & transaction history</Text>

          {/* Period Selector */}
          <View style={styles.periodRow}>
            {PERIODS.map((p) => (
              <Pressable
                key={p}
                style={[styles.periodBtn, period === p && styles.periodBtnActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                  {PERIOD_LABELS[p]}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Summary KPIs */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Ionicons name="cash-outline" size={16} color="#0f4cc9" />
              <Text style={styles.summaryValue}>${stat?.revenue ?? "--"}</Text>
              <Text style={styles.summaryLabel}>Revenue</Text>
            </View>
            <View style={styles.summaryCard}>
              <Ionicons name="receipt-outline" size={16} color="#d97706" />
              <Text style={styles.summaryValue}>{stat?.orders ?? "--"}</Text>
              <Text style={styles.summaryLabel}>Orders</Text>
            </View>
            <View style={styles.summaryCard}>
              <Ionicons name="trending-up-outline" size={16} color="#059669" />
              <Text style={styles.summaryValue}>${stat?.avg ?? "--"}</Text>
              <Text style={styles.summaryLabel}>Avg Order</Text>
            </View>
          </View>

          {/* By Module */}
          {byModule.length > 0 && (
            <View style={styles.moduleCard}>
              <Text style={styles.sectionTitle}>Revenue by Module</Text>
              {byModule.map((m) => (
                <View key={m.module} style={styles.moduleRow}>
                  <View style={styles.moduleLeft}>
                    <View style={[styles.moduleDot, { backgroundColor: MODULE_COLORS[m.module] ?? "#64748b" }]} />
                    <Text style={styles.moduleName}>{m.module}</Text>
                  </View>
                  <View style={styles.barWrap}>
                    <View style={[styles.barFill, { width: `${m.pct}%`, backgroundColor: MODULE_COLORS[m.module] ?? "#64748b" }]} />
                  </View>
                  <Text style={styles.moduleRevenue}>${m.revenue.toFixed(0)}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>Transactions</Text>
        </>
      )}
      data={sales}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <View style={styles.txnCard}>
          <View style={styles.txnLeft}>
            <View style={styles.txnTopRow}>
              <Text style={styles.txnId}>{item.order_id}</Text>
              <View style={[styles.modTag, { backgroundColor: (MODULE_COLORS[item.module] ?? "#64748b") + "18" }]}>
                <Text style={[styles.modTagText, { color: MODULE_COLORS[item.module] ?? "#64748b" }]}>{item.module}</Text>
              </View>
            </View>
            <View style={styles.txnBottomRow}>
              <Ionicons name="calendar-outline" size={11} color="#94a3b8" />
              <Text style={styles.txnDate}>{item.date}</Text>
              <Ionicons name="cube-outline" size={11} color="#94a3b8" />
              <Text style={styles.txnMeta}>{item.items} items</Text>
              <Ionicons name="card-outline" size={11} color="#94a3b8" />
              <Text style={styles.txnMeta}>{item.payment}</Text>
            </View>
          </View>
          <View style={styles.txnRight}>
            <Text style={styles.txnTotal}>${item.total}</Text>
            <View style={[
              styles.statusBadge,
              item.status === "completed" ? styles.statusDone : styles.statusPending,
            ]}>
              <Text style={[
                styles.statusText,
                item.status === "completed" ? styles.statusDoneText : styles.statusPendingText,
              ]}>
                {item.status === "completed" ? "Done" : "Active"}
              </Text>
            </View>
          </View>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No transactions found.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f6fb" },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  loaderWrap: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f6fb" },

  title: { fontSize: 26, fontWeight: "800", color: "#0a1628" },
  subtitle: { color: "#64748b", fontSize: 13, marginTop: 2 },

  periodRow: { flexDirection: "row", backgroundColor: "#e2e8f0", borderRadius: 12, padding: 3, gap: 3 },
  periodBtn: { flex: 1, paddingVertical: 7, alignItems: "center", borderRadius: 10 },
  periodBtnActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  periodText: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  periodTextActive: { color: "#0f4cc9", fontWeight: "700" },

  summaryRow: { flexDirection: "row", gap: 10 },
  summaryCard: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#e5e7eb", gap: 4, alignItems: "center" },
  summaryValue: { fontSize: 17, fontWeight: "800", color: "#0a1628" },
  summaryLabel: { fontSize: 11, color: "#64748b", fontWeight: "600" },

  moduleCard: { backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#e5e7eb", gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#0a1628" },
  moduleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  moduleLeft: { flexDirection: "row", alignItems: "center", gap: 6, width: 70 },
  moduleDot: { width: 8, height: 8, borderRadius: 4 },
  moduleName: { fontSize: 12, color: "#0a1628", fontWeight: "600" },
  barWrap: { flex: 1, height: 8, backgroundColor: "#f1f5f9", borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  moduleRevenue: { width: 46, textAlign: "right", fontSize: 12, fontWeight: "700", color: "#0a1628" },

  txnCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: "#e5e7eb",
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  txnLeft: { flex: 1, gap: 6 },
  txnTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  txnId: { fontSize: 13, fontWeight: "800", color: "#0a1628" },
  modTag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  modTagText: { fontSize: 10, fontWeight: "700" },
  txnBottomRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  txnDate: { fontSize: 11, color: "#94a3b8", marginRight: 4 },
  txnMeta: { fontSize: 11, color: "#94a3b8", marginRight: 4 },
  txnRight: { alignItems: "flex-end", gap: 6 },
  txnTotal: { fontSize: 15, fontWeight: "800", color: "#0a1628" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusDone: { backgroundColor: "#d1fae5" },
  statusPending: { backgroundColor: "#fef3c7" },
  statusText: { fontSize: 10, fontWeight: "700" },
  statusDoneText: { color: "#059669" },
  statusPendingText: { color: "#d97706" },
  empty: { textAlign: "center", color: "#6b7280", marginTop: 22 },
});
