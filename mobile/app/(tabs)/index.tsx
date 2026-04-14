import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "@/src/services/api";

type SummaryResponse = {
  today_sales: string;
  total_orders: number;
  total_products: number;
  avg_order_value: string;
};

export default function DashboardScreen() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSummary = async () => {
    const response = await api.get<SummaryResponse>("/dashboard/summary");
    setSummary(response.data);
  };

  useEffect(() => {
    fetchSummary()
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSummary().catch(() => setSummary(null));
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#0f4cc9" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>Store performance at a glance</Text>

      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Today Sales</Text>
          <Text style={styles.cardValue}>${summary?.today_sales ?? "--"}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Orders</Text>
          <Text style={styles.cardValue}>{summary?.total_orders ?? "--"}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Products</Text>
          <Text style={styles.cardValue}>{summary?.total_products ?? "--"}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Avg Order</Text>
          <Text style={styles.cardValue}>${summary?.avg_order_value ?? "--"}</Text>
        </View>
      </View>

      {!summary ? (
        <Text style={styles.warning}>
          Could not reach backend. Check EXPO_PUBLIC_API_BASE_URL.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f6fb",
  },
  content: {
    padding: 16,
    gap: 12,
  },
  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f4f6fb",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0a1628",
  },
  subtitle: {
    color: "#64748b",
    marginBottom: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "48%",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardLabel: {
    color: "#6b7280",
    fontWeight: "600",
    marginBottom: 6,
  },
  cardValue: {
    color: "#0f172a",
    fontWeight: "800",
    fontSize: 20,
  },
  warning: {
    marginTop: 6,
    color: "#b45309",
    fontWeight: "600",
  },
});
