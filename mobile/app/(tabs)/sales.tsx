import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "@/src/services/api";

type Sale = {
  id: number;
  date: string;
  total: string;
};

export default function SalesScreen() {
  const [items, setItems] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSales = async () => {
    const response = await api.get<Sale[]>("/sales");
    setItems(response.data);
  };

  useEffect(() => {
    fetchSales()
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSales().catch(() => setItems([]));
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
    <View style={styles.container}>
      <Text style={styles.title}>Sales</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.date}>{item.date}</Text>
            <Text style={styles.total}>${item.total}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No sales found or backend unavailable.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f6fb",
    padding: 16,
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
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderColor: "#e5e7eb",
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  date: {
    color: "#64748b",
    marginBottom: 4,
  },
  total: {
    color: "#0f172a",
    fontWeight: "800",
    fontSize: 20,
  },
  empty: {
    textAlign: "center",
    color: "#6b7280",
    marginTop: 22,
  },
});
