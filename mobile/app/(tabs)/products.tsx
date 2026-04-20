import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/services/api";
import { AnimatedNumber } from "@/src/components/AnimatedNumber";
import { Skeleton } from "@/src/components/Skeleton";
import { haptic } from "@/src/utils/haptics";
import {
  ACCENT,
  BG,
  CARD,
  CARD_BORDER,
  GOLD,
  SUCCESS,
  TEXT,
  TEXT_DIM,
  TEXT_FAINT,
} from "@/src/theme/tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

type Product = {
  id: number;
  name: string;
  category: string;
  price: string;
};

type ViewMode = "grid" | "list";

// ─── Category styling ────────────────────────────────────────────────────────

const CATEGORY_META: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  Beverages: { icon: "cafe-outline", color: "#10b981" },
  Bakery: { icon: "pizza-outline", color: "#f59e0b" },
  Food: { icon: "restaurant-outline", color: "#ef4444" },
  Snacks: { icon: "fast-food-outline", color: "#8b5cf6" },
  Desserts: { icon: "ice-cream-outline", color: "#ec4899" },
  Other: { icon: "cube-outline", color: ACCENT },
};

function catMeta(cat: string) {
  return CATEGORY_META[cat] ?? { icon: "cube-outline" as const, color: ACCENT };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseMoney(v: string | number | undefined): number {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return Number(String(v).replace(/[^0-9.-]/g, "")) || 0;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ProductsScreen() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const fetchProducts = async () => {
    try {
      const response = await api.get<Product[]>("/products");
      setItems(response.data);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    fetchProducts().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    haptic.light();
    setRefreshing(true);
    await fetchProducts();
    haptic.success();
    setRefreshing(false);
  };

  const { categories, categoryCounts, totalCount, avgPrice } = useMemo(() => {
    const counts = new Map<string, number>();
    let sum = 0;
    for (const p of items) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
      sum += parseMoney(p.price);
    }
    const cats = ["All", ...Array.from(counts.keys()).sort()];
    return {
      categories: cats,
      categoryCounts: counts,
      totalCount: items.length,
      avgPrice: items.length ? sum / items.length : 0,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== "All" && i.category !== category) return false;
      if (q && !i.name.toLowerCase().includes(q) && !i.category.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [items, search, category]);

  const Header = (
    <>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>CATALOG</Text>
          <Text style={styles.title}>Products</Text>
          <Text style={styles.subtitle}>
            {loading
              ? "Loading…"
              : `${filtered.length} of ${totalCount} ${totalCount === 1 ? "item" : "items"}`}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Add product"
          onPress={() => haptic.medium()}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={20} color="#181e38" />
        </Pressable>
      </View>

      {/* Stats strip */}
      {loading ? (
        <Skeleton height={78} radius={18} />
      ) : (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "rgba(212,175,55,0.15)" }]}>
              <Ionicons name="cube" size={14} color={GOLD} />
            </View>
            <AnimatedNumber value={totalCount} style={styles.statValue} />
            <Text style={styles.statLabel}>Products</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "rgba(64,100,220,0.18)" }]}>
              <Ionicons name="grid" size={14} color={ACCENT} />
            </View>
            <AnimatedNumber value={categories.length - 1} style={styles.statValue} />
            <Text style={styles.statLabel}>Categories</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
              <Ionicons name="pricetag" size={14} color={SUCCESS} />
            </View>
            <AnimatedNumber value={avgPrice} prefix="$" decimals={2} style={styles.statValue} />
            <Text style={styles.statLabel}>Avg price</Text>
          </View>
        </View>
      )}

      {/* Search + view toggle */}
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={14} color={TEXT_DIM} />
          <TextInput
            accessibilityLabel="Search products"
            placeholder="Search by name or category…"
            placeholderTextColor={TEXT_DIM}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search ? (
            <Pressable
              accessibilityLabel="Clear search"
              onPress={() => {
                haptic.selection();
                setSearch("");
              }}
            >
              <Ionicons name="close-circle" size={16} color={TEXT_DIM} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.viewToggle}>
          <Pressable
            accessibilityLabel="Grid view"
            onPress={() => {
              haptic.selection();
              setViewMode("grid");
            }}
            style={[styles.viewBtn, viewMode === "grid" && styles.viewBtnActive]}
          >
            <Ionicons
              name="grid-outline"
              size={15}
              color={viewMode === "grid" ? GOLD : TEXT_DIM}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="List view"
            onPress={() => {
              haptic.selection();
              setViewMode("list");
            }}
            style={[styles.viewBtn, viewMode === "list" && styles.viewBtnActive]}
          >
            <Ionicons
              name="list-outline"
              size={17}
              color={viewMode === "list" ? GOLD : TEXT_DIM}
            />
          </Pressable>
        </View>
      </View>

      {/* Category chips */}
      {!loading && categories.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {categories.map((c) => {
            const active = category === c;
            const count = c === "All" ? totalCount : categoryCounts.get(c) ?? 0;
            return (
              <Pressable
                key={c}
                accessibilityLabel={`Filter by ${c}`}
                onPress={() => {
                  haptic.selection();
                  setCategory(c);
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                <View style={[styles.chipCount, active && styles.chipCountActive]}>
                  <Text
                    style={[
                      styles.chipCountText,
                      active && styles.chipCountTextActive,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </>
  );

  const renderGridItem = ({ item, index }: { item: Product; index: number }) => {
    const meta = catMeta(item.category);
    const isLeft = index % 2 === 0;
    return (
      <Pressable
        accessibilityLabel={`${item.name}, ${item.category}, ${item.price} dollars`}
        onPress={() => haptic.light()}
        style={({ pressed }) => [
          styles.gridCard,
          { marginRight: isLeft ? 10 : 0, marginLeft: isLeft ? 0 : 10 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={styles.gridCardTop}>
          <View style={[styles.gridIcon, { backgroundColor: meta.color + "22" }]}>
            <Ionicons name={meta.icon} size={24} color={meta.color} />
          </View>
          <Pressable
            accessibilityLabel="Product options"
            onPress={() => haptic.selection()}
            hitSlop={10}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={TEXT_DIM} />
          </Pressable>
        </View>
        <View style={[styles.gridTag, { backgroundColor: meta.color + "1a" }]}>
          <Text style={[styles.gridTagText, { color: meta.color }]}>{item.category}</Text>
        </View>
        <Text style={styles.gridName} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.gridFooter}>
          <Text style={styles.gridPrice}>${item.price}</Text>
          <View style={styles.gridStatus}>
            <View style={[styles.gridStatusDot, { backgroundColor: SUCCESS }]} />
            <Text style={styles.gridStatusText}>In stock</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderListItem = ({ item }: { item: Product }) => {
    const meta = catMeta(item.category);
    return (
      <Pressable
        accessibilityLabel={`${item.name}, ${item.category}, ${item.price} dollars`}
        onPress={() => haptic.light()}
        style={({ pressed }) => [styles.listCard, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.listIcon, { backgroundColor: meta.color + "22" }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.listName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.listMetaRow}>
            <View style={[styles.miniTag, { backgroundColor: meta.color + "1a" }]}>
              <Text style={[styles.miniTagText, { color: meta.color }]}>{item.category}</Text>
            </View>
            <View style={styles.metaDot} />
            <Text style={styles.listMeta}>In stock</Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={styles.listPrice}>${item.price}</Text>
          <Ionicons name="chevron-forward" size={14} color={TEXT_FAINT} />
        </View>
      </Pressable>
    );
  };

  const EmptyState = (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ionicons name="cube-outline" size={28} color={TEXT_DIM} />
      </View>
      <Text style={styles.emptyTitle}>No products</Text>
      <Text style={styles.emptyBody}>
        {search || category !== "All"
          ? "No items match your filters."
          : "Your catalog is empty. Add your first product to get started."}
      </Text>
      {search || category !== "All" ? (
        <Pressable
          onPress={() => {
            haptic.selection();
            setSearch("");
            setCategory("All");
          }}
          style={styles.emptyBtn}
        >
          <Text style={styles.emptyBtnText}>Clear filters</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => haptic.medium()}
          style={[styles.emptyBtn, { flexDirection: "row", gap: 6 }]}
        >
          <Ionicons name="add" size={14} color="#181e38" />
          <Text style={styles.emptyBtnText}>Add product</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeContainer} edges={["top"]}>
      <View style={styles.glow} />

      {loading ? (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {Header}
          <View style={{ gap: 10, marginTop: 6 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={viewMode === "grid" ? 100 : 70} radius={16} />
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          key={viewMode}
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          numColumns={viewMode === "grid" ? 2 : 1}
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />
          }
          ListHeaderComponent={Header}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={viewMode === "grid" ? renderGridItem : renderListItem}
          ListEmptyComponent={EmptyState}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: BG },
  container: { flex: 1, backgroundColor: "transparent" },
  content: { padding: 16, paddingBottom: 40, gap: 18 },

  glow: {
    position: "absolute",
    top: -140,
    right: -120,
    width: 340,
    height: 340,
    borderRadius: 200,
    backgroundColor: GOLD,
    opacity: 0.08,
  },

  topBar: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrow: {
    color: TEXT_DIM,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "800",
    marginBottom: 2,
  },
  title: { fontSize: 28, fontWeight: "800", color: TEXT, letterSpacing: -0.5 },
  subtitle: { color: TEXT_DIM, fontSize: 12, marginTop: 2, fontWeight: "600" },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },

  statsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  statCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 12,
    gap: 6,
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { color: TEXT, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  statLabel: {
    color: TEXT_DIM,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  searchWrap: { flexDirection: "row", gap: 10, marginTop: 4 },
  searchRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: TEXT, fontSize: 13, padding: 0 },

  viewToggle: {
    flexDirection: "row",
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  viewBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  viewBtnActive: {
    backgroundColor: "rgba(212,175,55,0.15)",
  },

  chipsRow: { gap: 8, paddingVertical: 2, marginTop: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  chipActive: { backgroundColor: "rgba(212,175,55,0.18)", borderColor: GOLD },
  chipText: { color: TEXT_DIM, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: GOLD },
  chipCount: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipCountActive: { backgroundColor: "rgba(212,175,55,0.3)" },
  chipCountText: { color: TEXT_DIM, fontSize: 10, fontWeight: "800" },
  chipCountTextActive: { color: GOLD },

  // Grid card
  gridCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    gap: 10,
  },
  gridCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gridIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  gridTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  gridTagText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  gridName: { color: TEXT, fontSize: 14, fontWeight: "800", minHeight: 36 },
  gridFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  gridPrice: { color: GOLD, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  gridStatus: { flexDirection: "row", alignItems: "center", gap: 4 },
  gridStatusDot: { width: 6, height: 6, borderRadius: 3 },
  gridStatusText: { color: TEXT_DIM, fontSize: 10, fontWeight: "700" },

  // List card
  listCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 14,
    borderColor: CARD_BORDER,
    borderWidth: 1,
    padding: 12,
  },
  listIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  listName: { color: TEXT, fontWeight: "800", fontSize: 14 },
  listMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  miniTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  miniTagText: { fontSize: 10, fontWeight: "800" },
  metaDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: TEXT_FAINT },
  listMeta: { color: TEXT_DIM, fontSize: 11, fontWeight: "600" },
  listPrice: { color: GOLD, fontSize: 16, fontWeight: "800" },

  // Empty
  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderStyle: "dashed",
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: { color: TEXT, fontSize: 15, fontWeight: "800" },
  emptyBody: {
    color: TEXT_DIM,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  emptyBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBtnText: { color: "#181e38", fontWeight: "800", fontSize: 12 },
});
