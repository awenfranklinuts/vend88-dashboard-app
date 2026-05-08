import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { API_TARGET, api } from "../../src/services/api";
import { useAuth } from "../../src/context/AuthContext";
import {
  fetchAllOfficialProducts,
  fetchOfficialProductCategories,
} from "../../src/services/officialDashboard";
import { AnimatedNumber } from "../../src/components/AnimatedNumber";
import { Skeleton } from "../../src/components/Skeleton";
import { SectionLabel } from "../../src/components/SectionLabel";
import { haptic } from "../../src/utils/haptics";
import {
  ACCENT,
  BG,
  BG_ELEVATED,
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
} from "../../src/theme/tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl?: string;
  sku?: string;
  description?: string;
  active: boolean;
  pricingUnit?: string;
};

type ViewMode = "grid" | "list";

type SortMode = "category" | "name-asc" | "price-asc" | "price-desc";

type PriceBucketId = "all" | "lt10" | "10to50" | "50to200" | "gte200";

type PriceBucket = {
  id: PriceBucketId;
  label: string;
  match: (price: number) => boolean;
};

const PRICE_BUCKETS: PriceBucket[] = [
  { id: "all", label: "Any price", match: () => true },
  { id: "lt10", label: "Under $10", match: (p) => p < 10 },
  { id: "10to50", label: "$10 – $50", match: (p) => p >= 10 && p < 50 },
  { id: "50to200", label: "$50 – $200", match: (p) => p >= 50 && p < 200 },
  { id: "gte200", label: "$200+", match: (p) => p >= 200 },
];

const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
  { id: "category", label: "By category" },
  { id: "name-asc", label: "Name (A–Z)" },
  { id: "price-asc", label: "Price (low → high)" },
  { id: "price-desc", label: "Price (high → low)" },
];

const UNCATEGORIZED = "Uncategorized";

// ─── Category styling ────────────────────────────────────────────────────────

const CATEGORY_META: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  Beverages: { icon: "cafe-outline", color: "#10b981" },
  Beverage: { icon: "cafe-outline", color: "#10b981" },
  Drinks: { icon: "wine-outline", color: "#06b6d4" },
  "Cold drinks": { icon: "snow-outline", color: "#38bdf8" },
  "Hot drinks": { icon: "flame-outline", color: "#f97316" },
  Coffee: { icon: "cafe-outline", color: "#92400e" },
  Tea: { icon: "leaf-outline", color: "#16a34a" },
  "Milk Tea": { icon: "cafe-outline", color: "#a16207" },
  Bakery: { icon: "pizza-outline", color: "#f59e0b" },
  Pastries: { icon: "pizza-outline", color: "#f59e0b" },
  Cake: { icon: "ice-cream-outline", color: "#ec4899" },
  Food: { icon: "restaurant-outline", color: "#ef4444" },
  Bento: { icon: "fast-food-outline", color: "#dc2626" },
  Ramen: { icon: "restaurant-outline", color: "#b91c1c" },
  Sushi: { icon: "fish-outline", color: "#0891b2" },
  Sashimi: { icon: "fish-outline", color: "#0e7490" },
  Nigiri: { icon: "fish-outline", color: "#155e75" },
  Sake: { icon: "wine-outline", color: "#7c3aed" },
  "Hot Pot": { icon: "flame-outline", color: "#ea580c" },
  "Stir Fry": { icon: "flame-outline", color: "#dc2626" },
  "All-day breakfast": { icon: "egg-outline", color: "#facc15" },
  Snacks: { icon: "fast-food-outline", color: "#8b5cf6" },
  Desserts: { icon: "ice-cream-outline", color: "#ec4899" },
  Clothing: { icon: "shirt-outline", color: "#0ea5e9" },
  Other: { icon: "cube-outline", color: ACCENT },
  Unknown: { icon: "help-circle-outline", color: TEXT_DIM },
  [UNCATEGORIZED]: { icon: "cube-outline", color: TEXT_DIM },
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

function formatPrice(n: number): string {
  // Show 2 decimals only if needed to avoid noisy ".00" on integer prices.
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function pickPrimaryCategory(categories: string[] | undefined): string {
  if (!categories || categories.length === 0) return UNCATEGORIZED;
  const first = categories.find((c) => c && c.trim().length > 0);
  return first ?? UNCATEGORIZED;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ProductsScreen() {
  const { token, email } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [serverCategories, setServerCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [category, setCategory] = useState<string>("All");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortMode, setSortMode] = useState<SortMode>("category");
  const [priceBucket, setPriceBucket] = useState<PriceBucketId>("all");
  const [onlyActive, setOnlyActive] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const fetchProducts = async () => {
    try {
      if (API_TARGET === "official") {
        const auth = { token: token ?? undefined, email: email ?? undefined };
        const [products, categories] = await Promise.all([
          fetchAllOfficialProducts(auth),
          fetchOfficialProductCategories(auth).catch(() => [] as string[]),
        ]);
        const mapped: Product[] = products.map((p) => ({
          id: p.product_id,
          name: p.name?.trim() || "Untitled",
          category: pickPrimaryCategory(p.category),
          price: typeof p.price === "number" ? p.price : parseMoney(p.price),
          imageUrl:
            Array.isArray(p.image_urls) && p.image_urls.length > 0
              ? p.image_urls[0]
              : undefined,
          sku: p.sku?.trim() || undefined,
          description: p.description?.trim() || undefined,
          active: p.active !== false,
          pricingUnit: p.pricing_unit,
        }));
        setItems(mapped);
        setServerCategories(categories);
      } else {
        const response = await api.get<
          Array<{ id: number | string; name: string; category: string; price: string | number }>
        >("/products");
        const mapped: Product[] = response.data.map((p) => ({
          id: String(p.id),
          name: p.name,
          category: p.category || UNCATEGORIZED,
          price: parseMoney(p.price),
          active: true,
        }));
        setItems(mapped);
        setServerCategories([]);
      }
    } catch {
      setItems([]);
      setServerCategories([]);
    }
  };

  useEffect(() => {
    fetchProducts().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
      const price = p.price;
      sum += price;
      if (price < min) min = price;
      if (price > max) max = price;
    }
    // Build chip list: "All" + categories that actually have products,
    // sorted by count desc. Server categories are reserved for future use
    // (e.g. empty-state suggestions) but we don't show empty chips.
    const usedCats = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
    const cats = ["All", ...usedCats];
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
    const bucket = PRICE_BUCKETS.find((b) => b.id === priceBucket) ?? PRICE_BUCKETS[0];
    const list = items.filter((i) => {
      if (category !== "All" && i.category !== category) return false;
      if (onlyActive && !i.active) return false;
      if (!bucket.match(i.price)) return false;
      if (
        q &&
        !i.name.toLowerCase().includes(q) &&
        !i.category.toLowerCase().includes(q) &&
        !(i.sku?.toLowerCase().includes(q))
      )
        return false;
      return true;
    });

    if (sortMode === "name-asc") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === "price-asc") {
      list.sort((a, b) => a.price - b.price);
    } else if (sortMode === "price-desc") {
      list.sort((a, b) => b.price - a.price);
    } else {
      // category sort: by category name (count desc via categoryCounts), then name
      list.sort((a, b) => {
        if (a.category !== b.category) {
          const ca = categoryCounts.get(a.category) ?? 0;
          const cb = categoryCounts.get(b.category) ?? 0;
          if (ca !== cb) return cb - ca;
          return a.category.localeCompare(b.category);
        }
        return a.name.localeCompare(b.name);
      });
    }
    return list;
  }, [items, search, category, onlyActive, priceBucket, sortMode, categoryCounts]);

  // When sort = "category" and not filtering to one category, group rows by category
  // for SectionList rendering. Otherwise sections is null and we render a flat list.
  const sections = useMemo(() => {
    if (sortMode !== "category" || category !== "All") return null;
    const map = new Map<string, Product[]>();
    for (const p of filtered) {
      const arr = map.get(p.category);
      if (arr) arr.push(p);
      else map.set(p.category, [p]);
    }
    // Order: by count desc using categoryCounts (already used in sort)
    const ordered = Array.from(map.entries()).sort((a, b) => {
      const ca = categoryCounts.get(a[0]) ?? 0;
      const cb = categoryCounts.get(b[0]) ?? 0;
      if (ca !== cb) return cb - ca;
      return a[0].localeCompare(b[0]);
    });
    return ordered.map(([title, data]) => ({ title, data }));
  }, [filtered, sortMode, category, categoryCounts]);

  const activeFilterCount =
    (priceBucket !== "all" ? 1 : 0) +
    (onlyActive ? 1 : 0) +
    (sortMode !== "category" ? 1 : 0);

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
          onPress={() => {
            haptic.selection();
            setFilterOpen(true);
          }}
          style={({ pressed }) => [
            styles.iconBtn,
            activeFilterCount > 0 && styles.iconBtnPrimary,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name="options-outline"
            size={18}
            color={activeFilterCount > 0 ? GOLD : TEXT}
          />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
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
              style={styles.chipsScroll}
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
              label={
                category === "All"
                  ? sortMode === "category"
                    ? "By category"
                    : "All products"
                  : category
              }
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
        accessibilityLabel={`${item.name}, ${item.category}, ${formatPrice(item.price)} dollars`}
        onPress={() => haptic.light()}
        style={({ pressed }) => [
          styles.gridCard,
          { marginRight: isLeft ? 10 : 0, marginLeft: isLeft ? 0 : 10 },
          pressed && styles.pressed,
        ]}
      >
        <View
          style={[
            styles.gridImageWrap,
            { backgroundColor: meta.color + "14" },
          ]}
        >
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.gridImage}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name={meta.icon} size={36} color={meta.color} />
          )}
          <Pressable
            accessibilityLabel="Product options"
            onPress={() => haptic.selection()}
            hitSlop={10}
            style={styles.gridMore}
          >
            <Ionicons name="ellipsis-horizontal" size={14} color={TEXT} />
          </Pressable>
          {!item.active && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>INACTIVE</Text>
            </View>
          )}
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
          <Text style={styles.gridPrice}>${formatPrice(item.price)}</Text>
          <View style={styles.gridStatus}>
            <View
              style={[
                styles.gridStatusDot,
                { backgroundColor: item.active ? SUCCESS : TEXT_FAINT },
              ]}
            />
            <Text style={styles.gridStatusText}>
              {item.active ? "Active" : "Inactive"}
            </Text>
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
        accessibilityLabel={`${item.name}, ${item.category}, ${formatPrice(item.price)} dollars`}
        onPress={() => haptic.light()}
        style={({ pressed }) => [
          styles.listRow,
          !isLast && styles.listRowDivider,
          pressed && styles.pressed,
        ]}
      >
        <View
          style={[
            styles.listThumb,
            { backgroundColor: meta.color + "1f" },
          ]}
        >
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.listThumbImage}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name={meta.icon} size={18} color={meta.color} />
          )}
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
            <View
              style={[
                styles.statusDot,
                { backgroundColor: item.active ? SUCCESS : TEXT_FAINT },
              ]}
            />
            <Text
              style={[
                styles.listSub,
                { color: item.active ? SUCCESS : TEXT_DIM },
              ]}
            >
              {item.active ? "Active" : "Inactive"}
            </Text>
            {item.sku ? (
              <>
                <Text style={styles.listSubDot}>·</Text>
                <Text style={styles.listSubMuted} numberOfLines={1}>
                  {item.sku}
                </Text>
              </>
            ) : null}
          </View>
        </View>
        <View style={styles.listRight}>
          <Text style={styles.listPrice}>${formatPrice(item.price)}</Text>
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

  // For SectionList grid mode: group each section's data into pairs of products
  // so each rendered "row" is two cards side-by-side.
  const gridSections = useMemo(() => {
    if (!sections) return null;
    return sections.map((s) => {
      const rows: Array<[Product, Product?]> = [];
      for (let i = 0; i < s.data.length; i += 2) {
        rows.push([s.data[i], s.data[i + 1]]);
      }
      return { title: s.title, data: rows };
    });
  }, [sections]);

  const renderGridSectionRow = ({ item: row }: { item: [Product, Product?] }) => (
    <View style={styles.gridRow}>
      <View style={{ flex: 1 }}>
        {renderGridItemNoMargin(row[0])}
      </View>
      <View style={{ flex: 1 }}>
        {row[1] ? renderGridItemNoMargin(row[1]) : null}
      </View>
    </View>
  );

  const renderGridItemNoMargin = (item: Product) => {
    const meta = catMeta(item.category);
    return (
      <Pressable
        accessibilityLabel={`${item.name}, ${item.category}, ${formatPrice(item.price)} dollars`}
        onPress={() => haptic.light()}
        style={({ pressed }) => [styles.gridCard, pressed && styles.pressed]}
      >
        <View
          style={[
            styles.gridImageWrap,
            { backgroundColor: meta.color + "14" },
          ]}
        >
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.gridImage}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name={meta.icon} size={36} color={meta.color} />
          )}
          <Pressable
            accessibilityLabel="Product options"
            onPress={() => haptic.selection()}
            hitSlop={10}
            style={styles.gridMore}
          >
            <Ionicons name="ellipsis-horizontal" size={14} color={TEXT} />
          </Pressable>
          {!item.active && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>INACTIVE</Text>
            </View>
          )}
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
          <Text style={styles.gridPrice}>${formatPrice(item.price)}</Text>
          <View style={styles.gridStatus}>
            <View
              style={[
                styles.gridStatusDot,
                { backgroundColor: item.active ? SUCCESS : TEXT_FAINT },
              ]}
            />
            <Text style={styles.gridStatusText}>
              {item.active ? "Active" : "Inactive"}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderSectionHeader = ({ section }: { section: { title: string; data: unknown[] } }) => {
    const meta = catMeta(section.title);
    const count = categoryCounts.get(section.title) ?? 0;
    return (
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionHeaderDot, { backgroundColor: meta.color }]} />
        <Text style={styles.sectionHeaderTitle}>{section.title}</Text>
        <Text style={styles.sectionHeaderCount}>{count}</Text>
      </View>
    );
  };

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
      ) : sections && gridSections ? (
        <SectionList
          key={viewMode}
          sections={
            viewMode === "grid"
              ? (gridSections as unknown as Array<{
                  title: string;
                  data: Array<[Product, Product?]>;
                }>)
              : (sections as Array<{ title: string; data: Product[] }>)
          }
          keyExtractor={(item, index) =>
            Array.isArray(item)
              ? `pair-${index}-${item[0]?.id}`
              : String((item as Product).id)
          }
          stickySectionHeadersEnabled={false}
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
          renderSectionHeader={renderSectionHeader}
          renderItem={
            (viewMode === "grid"
              ? renderGridSectionRow
              : renderListItem) as unknown as (info: {
              item: unknown;
              index: number;
            }) => ReactElement
          }
          ItemSeparatorComponent={
            viewMode === "grid"
              ? () => <View style={{ height: 10 }} />
              : null
          }
          ListEmptyComponent={EmptyState}
        />
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

      {/* ── Filter modal ──────────────────────────────────────────── */}
      <Modal
        visible={filterOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterOpen(false)}
      >
        <Pressable
          style={styles.filterBackdrop}
          onPress={() => setFilterOpen(false)}
        >
          <Pressable style={styles.filterCard} onPress={() => {}}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filters</Text>
              <Pressable
                accessibilityLabel="Close filters"
                onPress={() => setFilterOpen(false)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.filterCloseBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="close" size={18} color={TEXT} />
              </Pressable>
            </View>

            {/* Sort */}
            <Text style={styles.filterGroupLabel}>SORT BY</Text>
            <View style={styles.filterChipsWrap}>
              {SORT_OPTIONS.map((opt) => {
                const active = sortMode === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => {
                      haptic.selection();
                      setSortMode(opt.id);
                    }}
                    style={[
                      styles.filterChip,
                      active && styles.filterChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Price */}
            <Text style={styles.filterGroupLabel}>PRICE</Text>
            <View style={styles.filterChipsWrap}>
              {PRICE_BUCKETS.map((b) => {
                const active = priceBucket === b.id;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => {
                      haptic.selection();
                      setPriceBucket(b.id);
                    }}
                    style={[
                      styles.filterChip,
                      active && styles.filterChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {b.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Active only */}
            <View style={styles.filterToggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterToggleLabel}>Active products only</Text>
                <Text style={styles.filterToggleHint}>
                  Hide items marked inactive
                </Text>
              </View>
              <Switch
                value={onlyActive}
                onValueChange={(v) => {
                  haptic.selection();
                  setOnlyActive(v);
                }}
                trackColor={{ false: "rgba(255,255,255,0.12)", true: GOLD_DIM }}
                thumbColor={onlyActive ? GOLD : "#9ca3af"}
              />
            </View>

            {/* Actions */}
            <View style={styles.filterActions}>
              <Pressable
                onPress={() => {
                  haptic.selection();
                  setSortMode("category");
                  setPriceBucket("all");
                  setOnlyActive(false);
                }}
                style={({ pressed }) => [
                  styles.filterSecondaryBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.filterSecondaryBtnText}>Reset</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  haptic.success();
                  setFilterOpen(false);
                }}
                style={({ pressed }) => [
                  styles.filterPrimaryBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.filterPrimaryBtnText}>
                  Show {filtered.length}{" "}
                  {filtered.length === 1 ? "item" : "items"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    marginTop: 8,
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
  chipsScroll: { marginTop: 14 },
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
    marginTop: 16,
    marginBottom: 4,
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
  gridImageWrap: {
    width: "100%",
    aspectRatio: 1.1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  gridImage: { width: "100%", height: "100%" },
  gridMore: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  inactiveBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
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
  listThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  listThumbImage: { width: "100%", height: "100%" },
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
  listSubDot: { color: TEXT_FAINT, fontSize: 11, fontWeight: "700" },
  listSubMuted: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "500",
    flexShrink: 1,
  },
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

  // Filter button badge
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: BG,
  },
  filterBadgeText: { color: BG, fontSize: 9, fontWeight: "900" },

  // Section header (per-category) for SectionList grouped view
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: BG,
  },
  sectionHeaderDot: { width: 8, height: 8, borderRadius: 4 },
  sectionHeaderTitle: {
    flex: 1,
    color: TEXT,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  sectionHeaderCount: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "700",
  },

  // Grid row used inside SectionList
  gridRow: {
    flexDirection: "row",
    gap: 10,
  },
  gridFiller: { flex: 1 },

  // Filter modal
  filterBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  filterCard: {
    backgroundColor: BG_ELEVATED,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  filterTitle: {
    flex: 1,
    color: TEXT,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  filterCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  filterGroupLabel: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 4,
  },
  filterChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  filterChipActive: {
    backgroundColor: GOLD_DIM,
    borderColor: "rgba(212,175,55,0.4)",
  },
  filterChipText: { color: TEXT_DIM, fontSize: 12, fontWeight: "700" },
  filterChipTextActive: { color: GOLD },
  filterToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    marginTop: 4,
  },
  filterToggleLabel: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "700",
  },
  filterToggleHint: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  filterActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  filterSecondaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  filterSecondaryBtnText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "700",
  },
  filterPrimaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  filterPrimaryBtnText: {
    color: BG,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
