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
import { Skeleton } from "@/src/components/Skeleton";
import { SectionLabel } from "@/src/components/SectionLabel";
import { haptic } from "@/src/utils/haptics";
import {
  BG,
  CARD,
  CARD_BORDER,
  GOLD,
  GOLD_DIM,
  SCREEN_PADDING,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseMoney(v: string | number | undefined): number {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return Number(String(v).replace(/[^0-9.-]/g, "")) || 0;
}

function formatMoney(v: number): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
      {/* Top bar — matches dashboard eyebrow + title + actions layout */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>CATALOG</Text>
          <Text style={styles.title} numberOfLines={1}>
            <Text style={styles.titleBold}>Products</Text>
            <Text style={styles.titleDim}>
              {loading ? "" : `  ${filtered.length} of ${totalCount}`}
            </Text>
          </Text>
          {!loading && (
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                {categories.length - 1} categories · avg ${formatMoney(avgPrice)}
              </Text>
            </View>
          )}
        </View>
        <Pressable
          accessibilityLabel="Add product"
          onPress={() => haptic.medium()}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={18} color={GOLD} />
        </Pressable>
      </View>

      {/* Search + view toggle */}
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={14} color={TEXT_DIM} />
          <TextInput
            accessibilityLabel="Search products"
            placeholder="Search name or category"
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
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={15} color={TEXT_DIM} />
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
              size={14}
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
              size={16}
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
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {c}
                </Text>
                <Text style={[styles.chipCount, active && styles.chipCountActive]}>
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {!loading && filtered.length > 0 && (
        <SectionLabel
          label={category === "All" ? "ALL ITEMS" : category.toUpperCase()}
        />
      )}
    </>
  );

  const renderGridItem = ({ item, index }: { item: Product; index: number }) => {
    const initial = (item.name?.trim()?.[0] ?? "?").toUpperCase();
    const isLeft = index % 2 === 0;
    return (
      <Pressable
        accessibilityLabel={`${item.name}, ${item.category}, ${item.price} dollars`}
        onPress={() => haptic.light()}
        style={({ pressed }) => [
          styles.gridCard,
          { marginRight: isLeft ? 10 : 0, marginLeft: isLeft ? 0 : 10 },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.gridThumb}>
          <Text style={styles.gridThumbText}>{initial}</Text>
        </View>
        <Text style={styles.gridCategory} numberOfLines={1}>
          {item.category}
        </Text>
        <Text style={styles.gridName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.gridPrice}>${item.price}</Text>
      </Pressable>
    );
  };

  const renderListItem = ({ item }: { item: Product }) => {
    const initial = (item.name?.trim()?.[0] ?? "?").toUpperCase();
    return (
      <Pressable
        accessibilityLabel={`${item.name}, ${item.category}, ${item.price} dollars`}
        onPress={() => haptic.light()}
        style={({ pressed }) => [styles.listCard, pressed && styles.pressed]}
      >
        <View style={styles.listThumb}>
          <Text style={styles.listThumbText}>{initial}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.listName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.listCategory} numberOfLines={1}>
            {item.category}
          </Text>
        </View>
        <View style={styles.listRight}>
          <Text style={styles.listPrice}>${item.price}</Text>
          <Ionicons name="chevron-forward" size={14} color={TEXT_FAINT} />
        </View>
      </Pressable>
    );
  };

  const EmptyState = (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ionicons name="cube-outline" size={24} color={TEXT_DIM} />
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
          <Ionicons name="add" size={13} color="#181e38" />
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
              <Skeleton key={i} height={viewMode === "grid" ? 120 : 68} radius={16} />
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
  content: { padding: SCREEN_PADDING, paddingBottom: 40, gap: 14 },

  glow: {
    position: "absolute",
    top: -140,
    right: -120,
    width: 340,
    height: 340,
    borderRadius: 200,
    backgroundColor: GOLD,
    opacity: 0.07,
  },

  pressed: { opacity: 0.7 },

  // Header
  topBar: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  eyebrow: {
    color: TEXT_DIM,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "800",
    marginBottom: 4,
  },
  title: { fontSize: 26, letterSpacing: -0.5, lineHeight: 30 },
  titleBold: { color: TEXT, fontWeight: "800" },
  titleDim: { color: TEXT_DIM, fontSize: 16, fontWeight: "600" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  metaText: { color: TEXT_DIM, fontSize: 11, fontWeight: "600" },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },

  // Search + view toggle
  searchWrap: { flexDirection: "row", gap: 8, marginTop: 2 },
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
    paddingVertical: 9,
  },
  searchInput: { flex: 1, color: TEXT, fontSize: 13, padding: 0 },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    padding: 2,
  },
  viewBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  viewBtnActive: { backgroundColor: GOLD_DIM },

  // Category chips — minimalist, no pill count badge
  chipsRow: { gap: 8, paddingVertical: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  chipActive: { backgroundColor: GOLD_DIM, borderColor: "rgba(212,175,55,0.4)" },
  chipText: { color: TEXT_DIM, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: GOLD },
  chipCount: { color: TEXT_FAINT, fontSize: 11, fontWeight: "700" },
  chipCountActive: { color: GOLD, opacity: 0.75 },

  // Grid card — lean, consistent with dashboard topThumb vibe
  gridCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    gap: 8,
  },
  gridThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: GOLD_DIM,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  gridThumbText: { color: GOLD, fontSize: 15, fontWeight: "800" },
  gridCategory: {
    color: TEXT_DIM,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  gridName: { color: TEXT, fontSize: 14, fontWeight: "700", minHeight: 36 },
  gridPrice: {
    color: TEXT,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginTop: 2,
  },

  // List card
  listCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 14,
    borderColor: CARD_BORDER,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  listThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: GOLD_DIM,
    alignItems: "center",
    justifyContent: "center",
  },
  listThumbText: { color: GOLD, fontSize: 15, fontWeight: "800" },
  listName: { color: TEXT, fontWeight: "700", fontSize: 14 },
  listCategory: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  listRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  listPrice: { color: TEXT, fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },

  // Empty
  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderStyle: "dashed",
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
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
