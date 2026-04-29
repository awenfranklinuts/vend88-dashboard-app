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
import { SectionLabel } from "@/src/components/SectionLabel";
import { haptic } from "@/src/utils/haptics";
import {
  ACCENT,
  BG,
  CARD,
  CARD_BORDER,
  DANGER,
  GOLD,
  GOLD_DIM,
  SCREEN_PADDING,
  SUCCESS,
  TEXT,
  TEXT_DIM,
  TEXT_FAINT,
  WARNING,
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
  const [searchFocused, setSearchFocused] = useState(false);
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

  const {
    categories,
    categoryCounts,
    totalCount,
    avgPrice,
    minPrice,
    maxPrice,
    categoryBreakdown,
  } = useMemo(() => {
    const counts = new Map<string, number>();
    let sum = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (const p of items) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
      const price = parseMoney(p.price);
      sum += price;
      if (price < min) min = price;
      if (price > max) max = price;
    }
    const cats = ["All", ...Array.from(counts.keys()).sort()];
    const total = items.length;
    const breakdown = Array.from(counts.entries())
      .map(([name, count]) => ({
        name,
        count,
        pct: total > 0 ? (count / total) * 100 : 0,
        color: catMeta(name).color,
      }))
      .sort((a, b) => b.count - a.count);
    return {
      categories: cats,
      categoryCounts: counts,
      totalCount: total,
      avgPrice: total ? sum / total : 0,
      minPrice: total ? min : 0,
      maxPrice: max,
      categoryBreakdown: breakdown,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== "All" && i.category !== category) return false;
      if (
        q &&
        !i.name.toLowerCase().includes(q) &&
        !i.category.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [items, search, category]);

  const Header = (
    <>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.eyebrow}>CATALOG</Text>
          <Text style={styles.title}>Products</Text>
        </View>
        <Pressable
          accessibilityLabel="Filters"
          onPress={() => haptic.selection()}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <Ionicons name="options-outline" size={18} color={TEXT} />
        </Pressable>
        <Pressable
          accessibilityLabel="Add product"
          onPress={() => haptic.medium()}
          style={({ pressed }) => [
            styles.iconBtn,
            styles.iconBtnPrimary,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="add" size={20} color={GOLD} />
        </Pressable>
      </View>

      {loading ? (
        <>
          <Skeleton height={110} radius={22} />
          <Skeleton height={86} radius={0} />
        </>
      ) : (
        <>
          {/* Hero — total catalog value / size */}
          <View style={styles.hero}>
            <View style={styles.heroLeft}>
              <View style={styles.heroLabelRow}>
                <Text style={styles.heroLabel}>CATALOG SIZE</Text>
              </View>
              <AnimatedNumber value={totalCount} style={styles.heroValue} />
              <View style={styles.heroFoot}>
                <View style={styles.heroBadge}>
                  <Ionicons name="grid-outline" size={11} color={GOLD} />
                  <Text style={[styles.heroBadgeText, { color: GOLD }]}>
                    {Math.max(categories.length - 1, 0)}{" "}
                    {categories.length - 1 === 1 ? "category" : "categories"}
                  </Text>
                </View>
                <Text style={styles.heroHint}>
                  {totalCount === 1 ? "active item" : "active items"}
                </Text>
              </View>
            </View>

            {/* Mini distribution bars per category */}
            {categoryBreakdown.length > 0 && (
              <View style={styles.spark}>
                {categoryBreakdown.slice(0, 6).map((c) => {
                  const heightPct = Math.max(c.count / totalCount, 0.08);
                  return (
                    <View key={c.name} style={styles.sparkCol}>
                      <View
                        style={[
                          styles.sparkBar,
                          {
                            height: `${Math.round(heightPct * 100)}%`,
                            backgroundColor: c.color,
                          },
                        ]}
                      />
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* KPI row */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiCell}>
              <Ionicons name="pricetag-outline" size={16} color={SUCCESS} />
              <AnimatedNumber
                value={avgPrice}
                prefix="$"
                decimals={2}
                style={styles.kpiValue}
              />
              <Text style={styles.kpiLabel}>Avg price</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiCell}>
              <Ionicons name="trending-down-outline" size={16} color="#818cf8" />
              <AnimatedNumber
                value={minPrice}
                prefix="$"
                decimals={2}
                style={styles.kpiValue}
              />
              <Text style={styles.kpiLabel}>Low</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiCell}>
              <Ionicons name="trending-up-outline" size={16} color={WARNING} />
              <AnimatedNumber
                value={maxPrice}
                prefix="$"
                decimals={2}
                style={styles.kpiValue}
              />
              <Text style={styles.kpiLabel}>High</Text>
            </View>
          </View>

          {/* Category mix — stacked bar with legend */}
          {categoryBreakdown.length > 0 && (
            <View style={styles.block}>
              <SectionLabel
                label="Category Mix"
                right={
                  <Text style={styles.sectionHint}>
                    {categoryBreakdown.length}{" "}
                    {categoryBreakdown.length === 1 ? "category" : "categories"}
                  </Text>
                }
              />
              <View style={styles.stackedBar}>
                {categoryBreakdown.map((c) => (
                  <View
                    key={c.name}
                    style={{ width: `${c.pct}%`, backgroundColor: c.color }}
                  />
                ))}
              </View>
              <View style={styles.legend}>
                {categoryBreakdown.map((c) => (
                  <View key={c.name} style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: c.color }]}
                    />
                    <Text style={styles.legendName}>{c.name}</Text>
                    <Text style={styles.legendPct}>{c.pct.toFixed(0)}%</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Search */}
          <View
            style={[styles.searchRow, searchFocused && styles.searchRowFocused]}
          >
            <Ionicons
              name="search"
              size={15}
              color={searchFocused ? GOLD : TEXT_DIM}
            />
            <TextInput
              accessibilityLabel="Search products"
              placeholder="Search by name or category…"
              placeholderTextColor={TEXT_FAINT}
              value={search}
              onChangeText={setSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
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
                <Ionicons name="close-circle" size={18} color={TEXT_DIM} />
              </Pressable>
            ) : null}
          </View>

          {/* Category chips */}
          {categories.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {categories.map((c) => {
                const active = category === c;
                const count =
                  c === "All" ? totalCount : categoryCounts.get(c) ?? 0;
                return (
                  <Pressable
                    key={c}
                    accessibilityLabel={`Filter by ${c}, ${count} items`}
                    onPress={() => {
                      haptic.selection();
                      setCategory(c);
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {c}
                    </Text>
                    <View
                      style={[
                        styles.chipCount,
                        active && styles.chipCountActive,
                      ]}
                    >
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

          {/* Section header for the list */}
          <View style={styles.listHeaderRow}>
            <SectionLabel
              label={category === "All" ? "All products" : category}
              style={{ flex: 1, marginTop: 0, marginBottom: 0 }}
              right={
                <Text style={styles.sectionHint}>
                  {filtered.length} {filtered.length === 1 ? "item" : "items"}
                </Text>
              }
            />
            <View style={styles.viewToggle}>
              <Pressable
                accessibilityLabel="Grid view"
                onPress={() => {
                  haptic.selection();
                  setViewMode("grid");
                }}
                style={[
                  styles.viewBtn,
                  viewMode === "grid" && styles.viewBtnActive,
                ]}
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
                style={[
                  styles.viewBtn,
                  viewMode === "list" && styles.viewBtnActive,
                ]}
              >
                <Ionicons
                  name="list-outline"
                  size={16}
                  color={viewMode === "list" ? GOLD : TEXT_DIM}
                />
              </Pressable>
            </View>
          </View>
        </>
      )}
    </>
  );

  const renderGridItem = ({
    item,
    index,
  }: {
    item: Product;
    index: number;
  }) => {
    const meta = catMeta(item.category);
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
        <View style={styles.gridCardTop}>
          <View
            style={[styles.gridIcon, { backgroundColor: meta.color + "1f" }]}
          >
            <Ionicons name={meta.icon} size={22} color={meta.color} />
          </View>
          <Pressable
            accessibilityLabel="Product options"
            onPress={() => haptic.selection()}
            hitSlop={10}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={TEXT_DIM} />
          </Pressable>
        </View>
        <View
          style={[styles.gridTag, { backgroundColor: meta.color + "1a" }]}
        >
          <Text style={[styles.gridTagText, { color: meta.color }]}>
            {item.category}
          </Text>
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

  const renderListItem = ({
    item,
    index,
  }: {
    item: Product;
    index: number;
  }) => {
    const meta = catMeta(item.category);
    const isLast = index === filtered.length - 1;
    return (
      <Pressable
        accessibilityLabel={`${item.name}, ${item.category}, ${item.price} dollars`}
        onPress={() => haptic.light()}
        style={({ pressed }) => [
          styles.listRow,
          !isLast && styles.listRowDivider,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.listIcon, { backgroundColor: meta.color + "1f" }]}>
          <Ionicons name={meta.icon} size={16} color={meta.color} />
        </View>
        <View style={styles.listMid}>
          <View style={styles.listTopRow}>
            <Text style={styles.listName} numberOfLines={1}>
              {item.name}
            </Text>
            <View
              style={[styles.modTag, { backgroundColor: meta.color + "1f" }]}
            >
              <Text style={[styles.modTagText, { color: meta.color }]}>
                {item.category}
              </Text>
            </View>
          </View>
          <View style={styles.listSubRow}>
            <View style={[styles.statusDot, { backgroundColor: SUCCESS }]} />
            <Text style={[styles.listSub, { color: SUCCESS }]}>In stock</Text>
          </View>
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
      <Ionicons name="cube-outline" size={32} color={TEXT_DIM} />
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
          <Ionicons name="add" size={14} color={GOLD} />
          <Text style={styles.emptyBtnText}>Add product</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeContainer} edges={["top"]}>
      {loading ? (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {Header}
          <View style={{ gap: 1, marginTop: 4 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={64} radius={0} />
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
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={GOLD}
            />
          }
          ListHeaderComponent={Header}
          ItemSeparatorComponent={
            viewMode === "grid"
              ? () => <View style={{ height: 10 }} />
              : null
          }
          renderItem={
            viewMode === "grid" ? renderGridItem : renderListItem
          }
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
  content: {
    padding: SCREEN_PADDING,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 22,
  },
  pressed: { opacity: 0.7 },

  // Top bar — matches dashboard / sales rhythm
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  eyebrow: {
    color: TEXT_FAINT,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  iconBtnPrimary: {
    backgroundColor: GOLD_DIM,
    borderColor: "rgba(212,175,55,0.25)",
  },

  // Hero — flat, no card
  hero: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 16,
    paddingVertical: 4,
  },
  heroLeft: { flex: 1, gap: 4 },
  heroLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroLabel: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  heroValue: {
    color: TEXT,
    fontSize: 38,
    fontWeight: "800",
    marginTop: 8,
    letterSpacing: -1.4,
  },
  heroFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroBadgeText: { fontSize: 12, fontWeight: "700" },
  heroHint: { color: TEXT_DIM, fontSize: 12, fontWeight: "500" },

  // Mini bars next to hero number
  spark: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: 64,
    paddingBottom: 2,
  },
  sparkCol: {
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  sparkBar: {
    width: 5,
    backgroundColor: "rgba(212,175,55,0.25)",
    borderRadius: 2,
    minHeight: 4,
  },

  // KPI row
  kpiRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  kpiCell: { flex: 1, gap: 6, paddingHorizontal: 4 },
  kpiDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: CARD_BORDER,
    marginHorizontal: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT,
    marginTop: 4,
    letterSpacing: -0.4,
  },
  kpiLabel: { fontSize: 11, color: TEXT_DIM, fontWeight: "500" },

  // Generic flat block
  block: { gap: 10 },
  sectionHint: { fontSize: 11, color: TEXT_DIM, fontWeight: "600" },

  // Stacked bar / legend
  stackedBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendName: { fontSize: 11, color: TEXT, fontWeight: "600" },
  legendPct: { fontSize: 11, color: TEXT_DIM, fontWeight: "500" },

  // Search — focus-aware pill
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchRowFocused: {
    borderColor: GOLD,
    backgroundColor: GOLD_DIM,
  },
  searchInput: {
    flex: 1,
    color: TEXT,
    fontSize: 14,
    fontWeight: "500",
    padding: 0,
    letterSpacing: -0.1,
  },

  // Category chips
  chipsRow: { gap: 8, paddingVertical: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  chipActive: {
    backgroundColor: GOLD_DIM,
    borderColor: "rgba(212,175,55,0.4)",
  },
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

  // List section header row (inline view toggle)
  listHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  viewBtn: {
    width: 30,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  viewBtnActive: { backgroundColor: GOLD_DIM },

  // Grid card — minimal flat-card
  gridCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
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
    width: 40,
    height: 40,
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
  gridName: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "700",
    minHeight: 36,
    letterSpacing: -0.1,
  },
  gridFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  gridPrice: {
    color: TEXT,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  gridStatus: { flexDirection: "row", alignItems: "center", gap: 4 },
  gridStatusDot: { width: 5, height: 5, borderRadius: 2.5 },
  gridStatusText: { color: TEXT_DIM, fontSize: 10, fontWeight: "600" },

  // List row — flat, hairline divided (matches sales txnRow)
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  listRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  listMid: { flex: 1, gap: 4 },
  listTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  listName: {
    flex: 0,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
    color: TEXT,
    letterSpacing: -0.1,
  },
  modTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modTagText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  listSubRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  listSub: { fontSize: 11, fontWeight: "600", letterSpacing: 0.2 },
  listRight: { alignItems: "flex-end", gap: 4 },
  listPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.3,
  },

  // Empty state — matches sales emptyCard
  emptyCard: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  emptyBody: {
    color: TEXT_DIM,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  emptyBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: GOLD_DIM,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(212,175,55,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBtnText: {
    color: GOLD,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.2,
  },
});
