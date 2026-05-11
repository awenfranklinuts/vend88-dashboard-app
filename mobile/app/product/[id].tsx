import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { useAuth } from "../../src/context/AuthContext";
import {
  fetchOfficialProductDetail,
  OfficialProductDetail,
} from "../../src/services/officialDashboard";
import { Skeleton } from "../../src/components/Skeleton";
import { SectionLabel } from "../../src/components/SectionLabel";
import { haptic } from "../../src/utils/haptics";
import {
  ACCENT,
  BG,
  CARD,
  CARD_BORDER,
  GOLD,
  SCREEN_PADDING,
  SUCCESS,
  TEXT,
  TEXT_DIM,
  TEXT_FAINT,
} from "../../src/theme/tokens";

function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, email } = useAuth();
  const [detail, setDetail] = useState<OfficialProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const productId = Array.isArray(id) ? id[0] : id;
    if (!productId) {
      setError("Missing product id");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const auth = { token: token ?? undefined, email: email ?? undefined };
        const data = await fetchOfficialProductDetail(productId, auth);
        if (!cancelled) setDetail(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load product");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token, email]);

  const imageUrl =
    detail?.image_urls && detail.image_urls.length > 0
      ? detail.image_urls[0]
      : undefined;
  const categories = Array.isArray(detail?.category)
    ? (detail!.category as string[]).filter((c) => c && c.trim())
    : [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Back"
          onPress={() => {
            haptic.selection();
            router.back();
          }}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={20} color={TEXT} />
        </Pressable>
        <Text style={styles.topTitle}>Product</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <>
            <Skeleton height={260} radius={20} />
            <View style={{ height: 12 }} />
            <Skeleton height={20} radius={6} />
            <View style={{ height: 8 }} />
            <Skeleton height={14} radius={6} />
            <View style={{ height: 16 }} />
            <Skeleton height={120} radius={16} />
          </>
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={28} color={TEXT_DIM} />
            <Text style={styles.errorTitle}>Couldn’t load product</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </View>
        ) : detail ? (
          <>
            <View style={styles.heroImageWrap}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.heroImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="cube-outline" size={64} color={TEXT_FAINT} />
              )}
              {!detail.active && (
                <View style={styles.inactiveBadge}>
                  <Text style={styles.inactiveBadgeText}>INACTIVE</Text>
                </View>
              )}
            </View>

            <View style={styles.headerBlock}>
              <Text style={styles.name}>{detail.name?.trim() || "Untitled"}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.price}>${formatPrice(Number(detail.price))}</Text>
                {detail.pricing_unit ? (
                  <Text style={styles.priceUnit}>/ {detail.pricing_unit}</Text>
                ) : null}
              </View>

              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: detail.active ? SUCCESS : TEXT_FAINT },
                  ]}
                />
                <Text
                  style={[
                    styles.statusText,
                    { color: detail.active ? SUCCESS : TEXT_DIM },
                  ]}
                >
                  {detail.active ? "Active" : "Inactive"}
                </Text>
                {detail.sku ? (
                  <>
                    <Text style={styles.dot}>·</Text>
                    <Text style={styles.statusMuted}>SKU {detail.sku}</Text>
                  </>
                ) : null}
              </View>
            </View>

            {categories.length > 0 && (
              <View style={styles.section}>
                <SectionLabel label="Categories" />
                <View style={styles.chipRow}>
                  {categories.map((c) => (
                    <View key={c} style={styles.chip}>
                      <Text style={styles.chipText}>{c}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {detail.description ? (
              <View style={styles.section}>
                <SectionLabel label="Description" />
                <Text style={styles.description}>
                  {detail.description.trim()}
                </Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <SectionLabel label="Details" />
              <View style={styles.card}>
                <DetailRow label="Product ID" value={detail.product_id} mono />
                {detail.sku ? <DetailRow label="SKU" value={detail.sku} /> : null}
                {detail.pricing_unit ? (
                  <DetailRow label="Pricing unit" value={detail.pricing_unit} />
                ) : null}
                {typeof detail.prepare_time === "number" ? (
                  <DetailRow
                    label="Prepare time"
                    value={`${detail.prepare_time} min`}
                  />
                ) : null}
                {typeof detail.calorie === "number" && detail.calorie > 0 ? (
                  <DetailRow label="Calories" value={`${detail.calorie} kcal`} />
                ) : null}
                {typeof detail.tax_required === "boolean" ? (
                  <DetailRow
                    label="Tax required"
                    value={detail.tax_required ? "Yes" : "No"}
                  />
                ) : null}
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[styles.detailValue, mono && styles.detailValueMono]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  container: { flex: 1, backgroundColor: BG },
  content: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: 48,
    gap: 14,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SCREEN_PADDING,
    paddingVertical: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  pressed: { opacity: 0.7 },
  topTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: 0.3,
  },
  heroImageWrap: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  heroImage: { width: "100%", height: "100%" },
  inactiveBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  inactiveBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  headerBlock: { gap: 6, marginTop: 4 },
  name: { fontSize: 22, fontWeight: "800", color: TEXT, letterSpacing: -0.2 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  price: { fontSize: 28, fontWeight: "800", color: GOLD },
  priceUnit: { fontSize: 13, color: TEXT_DIM, fontWeight: "600" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: "700" },
  statusMuted: { fontSize: 12, color: TEXT_DIM, fontWeight: "500" },
  dot: { fontSize: 12, color: TEXT_FAINT },
  section: { gap: 10, marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  chipText: { color: TEXT, fontSize: 12, fontWeight: "600" },
  description: {
    color: TEXT,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CARD_BORDER,
    gap: 16,
  },
  detailLabel: { color: TEXT_DIM, fontSize: 12, fontWeight: "600" },
  detailValue: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "600",
    maxWidth: "60%",
    textAlign: "right",
  },
  detailValueMono: {
    fontFamily: "Menlo",
    fontSize: 11,
    color: TEXT_DIM,
  },
  errorCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 24,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    marginTop: 32,
  },
  errorTitle: { color: TEXT, fontSize: 15, fontWeight: "700" },
  errorBody: { color: TEXT_DIM, fontSize: 13, textAlign: "center" },
  // Reserved tokens (kept to satisfy lint if extended later)
  _accent: { color: ACCENT },
});
