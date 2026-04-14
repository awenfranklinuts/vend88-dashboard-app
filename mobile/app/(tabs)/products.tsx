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

type Product = {
  id: number;
  name: string;
  category: string;
  price: string;
};

export default function ProductsScreen() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProducts = async () => {
    const response = await api.get<Product[]>("/products");
    setItems(response.data);
  };

  useEffect(() => {
    fetchProducts()
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProducts().catch(() => setItems([]));
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
      <Text style={styles.title}>Products</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.category}>{item.category}</Text>
            </View>
            <Text style={styles.price}>${item.price}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No products found or backend unavailable.</Text>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderColor: "#e5e7eb",
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  name: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 16,
  },
  category: {
    color: "#64748b",
    marginTop: 2,
  },
  price: {
    color: "#0f4cc9",
    fontWeight: "800",
    fontSize: 17,
  },
  empty: {
    textAlign: "center",
    color: "#6b7280",
    marginTop: 22,
  },
});
