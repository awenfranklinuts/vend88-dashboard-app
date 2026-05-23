import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useI18n } from "../context/I18nContext";
import {
  fetchOfficialProductDetails,
  OfficialOrderDetail,
} from "../services/officialDashboard";
import { ShimmerSkeleton } from "./ShimmerSkeleton";
import {
  BG,
  CARD,
  CARD_BORDER,
  DANGER,
  GOLD,
  SCREEN_PADDING,
  SUCCESS,
  TEXT,
  TEXT_DIM,
  TEXT_FAINT,
  WARNING,
} from "../theme/tokens";

type OrderProduct = {
  name: string;
  sku?: string;
  qty: number;
  price: number;
  imageUrl?: string;
  refunded?: boolean;
};

type OrderTransaction = {
  id?: string;
  platform?: string;
  type?: string;
  amount?: number;
  surcharge?: number;
};

export type OrderDetailSale = {
  order_id: string;
  date: string;
  /**
   * Optional pre-loaded summary fields shown when the full detail payload
   * cannot be loaded (e.g. device offline). Allows the user to still see
   * useful info about the order without a successful detail fetch.
   */
  preview?: {
    total?: string;
    status?: string;
    statusLabel?: string;
    statusColor?: string;
    payment?: string;
    items?: string;
    time?: string;
  };
};

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return undefined;
}

function formatCurrency(n: number, fractionDigits = 2): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

function extractProducts(order: OfficialOrderDetail): OrderProduct[] {
  const candidates: unknown[] = [];
  for (const key of ["products", "items", "order_items", "line_items"]) {
    const v = (order as Record<string, unknown>)[key];
    if (Array.isArray(v)) {
      const allStrings = v.every((x) => typeof x === "string");
      if (allStrings) continue;
      candidates.push(...v);
    }
  }
  const products: OrderProduct[] = [];
  for (const raw of candidates) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const name =
      pickString(p, "name", "item_name", "product_name", "title") ?? "Item";
    const sku = pickString(p, "sku", "barcode", "code");
    const qty = pickNumber(p, "qty", "quantity", "count") ?? 1;
    const price =
      pickNumber(p, "price", "cost", "total", "amount", "item_cost") ?? 0;
    const imageUrl = pickString(p, "image", "image_url", "img", "photo");
    const status = pickString(p, "status", "state");
    const refunded = typeof status === "string" && /refund/i.test(status);
    products.push({ name, sku, qty, price, imageUrl, refunded });
  }
  return products;
}

function extractProductRefs(order: OfficialOrderDetail): { id: string; qty: number }[] {
  const o = order as Record<string, unknown>;
  const raw = o.products;
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const v of raw) {
    if (typeof v === "string" && v.length > 0) ids.push(v);
  }
  if (ids.length === 0) return [];
  const qtys = Array.isArray(o.qtys) ? (o.qtys as unknown[]) : [];
  return ids.map((id, i) => {
    const q = qtys[i];
    const qty =
      typeof q === "number" && Number.isFinite(q) && q > 0 ? Math.round(q) : 1;
    return { id, qty };
  });
}

function extractTransactions(order: OfficialOrderDetail): OrderTransaction[] {
  const list: unknown[] = Array.isArray((order as Record<string, unknown>).transactions)
    ? ((order as Record<string, unknown>).transactions as unknown[])
    : [];
  const out: OrderTransaction[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    out.push({
      id: pickString(t, "transaction_id", "id", "_id", "txn_id"),
      platform: pickString(t, "platform", "method", "payment_platform"),
      type: pickString(t, "type", "transaction_type", "kind"),
      amount: pickNumber(t, "amount", "value", "total", "price"),
      surcharge: pickNumber(t, "surcharge", "fee"),
    });
  }
  return out;
}

function formatOrderTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "-";
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status?: string }) {
  const { t } = useI18n();
  const s = (status ?? "").toLowerCase();
  let bg = TEXT_DIM + "22";
  let fg = TEXT_DIM;
  let label = status ?? "-";
  if (/unpaid/.test(s)) {
    bg = WARNING + "22";
    fg = WARNING;
    label = "Unpaid";
  } else if (/\bpaid\b|complete|done/.test(s)) {
    bg = SUCCESS + "22";
    fg = SUCCESS;
    label = t("sales_status_paid");
  } else if (/refund/.test(s)) {
    bg = DANGER + "22";
    fg = DANGER;
    label = t("sales_status_refunded");
  } else if (/cancel|void/.test(s)) {
    bg = DANGER + "22";
    fg = DANGER;
    label = status ?? t("sales_status_cancelled");
  } else if (/active|open|pending/.test(s)) {
    bg = WARNING + "22";
    fg = WARNING;
    label = t("sales_active");
  }
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  mono,
  emphasis,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          mono && styles.rowValueMono,
          emphasis && styles.rowValueEmphasis,
        ]}
        numberOfLines={mono ? 1 : 2}
        ellipsizeMode="middle"
      >
        {value}
      </Text>
    </View>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

export function OrderDetailModal({
  sale,
  order,
  loading,
  error,
  onClose,
}: {
  sale: OrderDetailSale | null;
  order: OfficialOrderDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const visible = sale != null;

  const summary = useMemo(() => {
    if (!order) return null;
    const o = order as Record<string, unknown>;
    const orderId = pickString(o, "order_id", "_id") ?? "-";
    const orderNum = pickNumber(o, "order_num");
    const cost = pickNumber(o, "price", "total", "cost") ?? 0;
    const status = pickString(o, "status") ?? "-";
    const method = pickString(o, "pick_method", "method", "dine_option") ?? "-";
    const source = pickString(o, "source", "module") ?? "-";
    const discount = pickNumber(o, "discount", "discount_total") ?? 0;
    const rounding = pickNumber(o, "rounding", "rounding_total") ?? 0;
    const tax = pickNumber(o, "tax", "tax_total") ?? 0;
    const holidaySurcharge =
      pickNumber(o, "holiday_surcharge", "holiday_surcharge_pct") ?? 0;
    const guestCount = pickNumber(o, "guest_count", "guests", "people") ?? 0;
    const time = pickString(o, "time", "created_at", "date");
    return {
      orderId,
      orderNum,
      cost,
      status,
      method,
      source,
      discount,
      rounding,
      tax,
      holidaySurcharge,
      guestCount,
      time,
    };
  }, [order]);

  const products = useMemo(() => (order ? extractProducts(order) : []), [order]);
  const productRefs = useMemo(() => (order ? extractProductRefs(order) : []), [order]);
  const transactions = useMemo(() => (order ? extractTransactions(order) : []), [order]);

  const [productNameMap, setProductNameMap] = useState<
    Record<string, { name: string; image?: string; price?: number }>
  >({});

  useEffect(() => {
    if (productRefs.length === 0) {
      setProductNameMap({});
      return;
    }
    let cancelled = false;
    const ids = productRefs.map((r) => r.id);
    fetchOfficialProductDetails(ids)
      .then((map) => {
        if (!cancelled) setProductNameMap(map);
      })
      .catch(() => {
        if (!cancelled) setProductNameMap({});
      });
    return () => {
      cancelled = true;
    };
  }, [productRefs]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{t("sales_detail_order_details")}</Text>
            <Text style={styles.title} numberOfLines={1}>
              {sale?.order_id ?? "-"}
            </Text>
            {sale ? <Text style={styles.subtitle}>{formatOrderTime(sale.date)}</Text> : null}
          </View>
          <Pressable
            accessibilityLabel={t("sales_detail_close")}
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close" size={20} color={TEXT} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <View style={styles.loadingCard}>
              <ShimmerSkeleton width="40%" height={12} radius={3} />
              <View style={{ height: 12 }} />
              <ShimmerSkeleton width="80%" height={20} radius={4} />
              <View style={{ height: 16 }} />
              <ShimmerSkeleton width="100%" height={1} radius={0} />
              <View style={{ height: 16 }} />
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.loadingRow}>
                  <ShimmerSkeleton width="30%" height={12} radius={3} />
                  <ShimmerSkeleton width="40%" height={12} radius={3} />
                </View>
              ))}
            </View>
          </View>
        ) : error ? (
          sale?.preview ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.previewNotice}>
                <Ionicons name="cloud-offline-outline" size={14} color={GOLD} />
                <Text style={styles.previewNoticeText} numberOfLines={2}>
                  {t("sales_detail_offline_preview")}
                </Text>
              </View>
              <View style={styles.hero}>
                <Text style={styles.heroEyebrow}>{t("sales_detail_total")}</Text>
                <Text style={styles.heroAmount}>
                  {sale.preview.total ? `$${sale.preview.total}` : "-"}
                </Text>
                {sale.preview.statusLabel ? (
                  <View style={styles.heroMeta}>
                    <View
                      style={[
                        styles.previewPill,
                        sale.preview.statusColor
                          ? {
                              borderColor: sale.preview.statusColor,
                              backgroundColor: `${sale.preview.statusColor}22`,
                            }
                          : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.previewPillText,
                          sale.preview.statusColor
                            ? { color: sale.preview.statusColor }
                            : null,
                        ]}
                      >
                        {sale.preview.statusLabel}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
              <SectionCard title={t("sales_detail_order_details")}>
                {sale.preview.items ? (
                  <DetailRow label={t("sales_detail_items")} value={sale.preview.items} />
                ) : null}
                {sale.preview.payment ? (
                  <DetailRow label={t("sales_detail_method")} value={sale.preview.payment} />
                ) : null}
                {sale.preview.time ? (
                  <DetailRow label={t("sales_detail_time")} value={sale.preview.time} />
                ) : null}
              </SectionCard>
            </ScrollView>
          ) : (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={32} color={DANGER} />
              <Text style={styles.errorTitle}>{t("sales_detail_error_title")}</Text>
              <Text style={styles.errorBody}>{error}</Text>
            </View>
          )
        ) : summary ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>{t("sales_detail_total")}</Text>
              <Text style={styles.heroAmount}>{formatCurrency(summary.cost, 2)}</Text>
              <View style={styles.heroMeta}>
                <StatusPill status={summary.status} />
                {summary.method && summary.method !== "-" ? (
                  <View style={styles.heroChip}>
                    <Ionicons name="bag-outline" size={12} color={TEXT_DIM} />
                    <Text style={styles.heroChipText}>{summary.method}</Text>
                  </View>
                ) : null}
                {summary.source && summary.source !== "-" ? (
                  <View style={styles.heroChip}>
                    <Ionicons name="terminal-outline" size={12} color={TEXT_DIM} />
                    <Text style={styles.heroChipText}>{summary.source.toUpperCase()}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <SectionCard title={t("sales_detail_section_summary")}>
              <DetailRow label={t("sales_detail_order_id")} value={summary.orderId} mono />
              {summary.orderNum != null ? (
                <DetailRow
                  label={t("sales_detail_order_number")}
                  value={`#${summary.orderNum}`}
                />
              ) : null}
              <DetailRow label={t("sales_detail_cost")} value={formatCurrency(summary.cost, 2)} emphasis />
              <DetailRow label={t("sales_detail_status")} value={summary.status} />
              <DetailRow label={t("sales_detail_method")} value={summary.method} />
              <DetailRow label={t("sales_detail_source")} value={summary.source} />
              <DetailRow label={t("sales_detail_discount")} value={formatCurrency(summary.discount, 2)} />
              <DetailRow label={t("sales_detail_rounding")} value={formatCurrency(summary.rounding, 2)} />
              <DetailRow label={t("sales_detail_holiday_surcharge")} value={`${summary.holidaySurcharge}%`} />
              <DetailRow label={t("sales_detail_tax")} value={formatCurrency(summary.tax, 2)} />
              <DetailRow label={t("sales_detail_guest_count")} value={String(summary.guestCount)} />
              <DetailRow label={t("sales_detail_date_of_purchase")} value={formatOrderTime(summary.time)} />
            </SectionCard>

            {products.length > 0 ? (
              <SectionCard title={t("sales_detail_products", { count: products.length })}>
                {products.map((p, i) => (
                  <View
                    key={i}
                    style={[styles.productRow, i !== products.length - 1 && styles.productRowDivider]}
                  >
                    <View style={styles.productThumb}>
                      <Ionicons name="cube-outline" size={20} color={TEXT_DIM} />
                    </View>
                    <View style={styles.productMid}>
                      <View style={styles.productNameRow}>
                        <Text style={styles.productName} numberOfLines={2}>
                          {p.name}
                        </Text>
                        {p.refunded ? (
                          <View style={styles.refundBadge}>
                            <Text style={styles.refundBadgeText}>{t("sales_detail_refund_badge")}</Text>
                          </View>
                        ) : null}
                      </View>
                      {p.sku ? <Text style={styles.productSku}>SKU - {p.sku}</Text> : null}
                    </View>
                    <View style={styles.productRight}>
                      <Text style={styles.productPrice}>{formatCurrency(p.price, 2)}</Text>
                      <Text style={styles.productQty}>x{p.qty}</Text>
                    </View>
                  </View>
                ))}
              </SectionCard>
            ) : productRefs.length > 0 ? (
              <SectionCard title={t("sales_detail_products", { count: productRefs.length })}>
                {productRefs.map((ref, i) => {
                  const detail = productNameMap[ref.id];
                  const name = detail?.name ?? `Item ${ref.id.slice(-6).toUpperCase()}`;
                  const resolved = !!detail?.name;
                  const initial = (detail?.name ?? "?").trim().charAt(0).toUpperCase();
                  return (
                    <View
                      key={`${ref.id}-${i}`}
                      style={[styles.productRow, i !== productRefs.length - 1 && styles.productRowDivider]}
                    >
                      <View style={styles.productThumb}>
                        {detail?.image ? (
                          <Image
                            source={{ uri: detail.image }}
                            style={styles.productThumbImage}
                            resizeMode="cover"
                          />
                        ) : resolved ? (
                          <Text style={styles.productThumbInitial}>{initial}</Text>
                        ) : (
                          <Ionicons name="cube-outline" size={20} color={TEXT_DIM} />
                        )}
                      </View>
                      <View style={styles.productMid}>
                        {resolved ? (
                          <Text style={styles.productName} numberOfLines={2}>
                            {name}
                          </Text>
                        ) : (
                          <ShimmerSkeleton width="70%" height={13} radius={3} />
                        )}
                        <Text style={styles.productSku}>ID - {ref.id.slice(-8).toUpperCase()}</Text>
                      </View>
                      <View style={styles.productRight}>
                        {detail?.price != null ? (
                          <>
                            <Text style={styles.productPrice}>{formatCurrency(detail.price * ref.qty, 2)}</Text>
                            <Text style={styles.productQty}>
                              {ref.qty > 1
                                ? `${formatCurrency(detail.price, 2)} x ${ref.qty}`
                                : `x${ref.qty}`}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.productQty}>x{ref.qty}</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </SectionCard>
            ) : null}

            {transactions.length > 0 ? (
              <SectionCard title={t("sales_detail_transactions")}>
                {transactions.map((tx, i) => {
                  const isRefund = /refund/i.test(tx.type ?? "");
                  return (
                    <View
                      key={i}
                      style={[styles.txnDetailRow, i !== transactions.length - 1 && styles.txnDetailRowDivider]}
                    >
                      <View style={styles.txnDetailHead}>
                        <View
                          style={[
                            styles.txnDetailDot,
                            { backgroundColor: isRefund ? DANGER : SUCCESS },
                          ]}
                        />
                        <Text style={styles.txnDetailType}>
                          {(tx.type ?? t("sales_detail_payment_label")).toUpperCase()}
                        </Text>
                        {tx.platform ? (
                          <Text style={styles.txnDetailPlatform}>- {tx.platform}</Text>
                        ) : null}
                      </View>
                      {tx.id ? (
                        <Text style={styles.txnDetailId} numberOfLines={1} ellipsizeMode="middle">
                          {tx.id}
                        </Text>
                      ) : null}
                      <View style={styles.txnDetailAmounts}>
                        <Text style={[styles.txnDetailAmount, isRefund && { color: DANGER }]}> 
                          {isRefund ? "-" : ""}
                          {formatCurrency(tx.amount ?? 0, 2)}
                        </Text>
                        {tx.surcharge != null && tx.surcharge > 0 ? (
                          <Text style={styles.txnDetailSurcharge}>
                            {t("sales_detail_fee_suffix", {
                              amount: formatCurrency(tx.surcharge, 2),
                            })}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </SectionCard>
            ) : null}

            <View style={{ height: 24 }} />
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 24,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
    color: TEXT_FAINT,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  subtitle: { fontSize: 12, color: TEXT_DIM, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  content: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 14,
  },
  hero: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 18,
    gap: 8,
  },
  heroEyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
    color: TEXT_FAINT,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -0.8,
  },
  heroMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  heroChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: TEXT_DIM,
    letterSpacing: 0.3,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    overflow: "hidden",
  },
  cardTitle: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
    color: TEXT_FAINT,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    textTransform: "uppercase",
  },
  cardBody: { paddingHorizontal: 16, paddingBottom: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER + "55",
  },
  rowLabel: { fontSize: 12, color: TEXT_DIM, fontWeight: "500" },
  rowValue: {
    fontSize: 13,
    color: TEXT,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  rowValueMono: { fontFamily: "Menlo", fontSize: 11, color: TEXT_DIM },
  rowValueEmphasis: { fontSize: 14, fontWeight: "800", letterSpacing: -0.2 },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  productRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER + "55",
  },
  productThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  productThumbImage: { width: "100%", height: "100%" },
  productThumbInitial: {
    fontSize: 18,
    fontWeight: "800",
    color: GOLD,
    letterSpacing: -0.4,
  },
  productMid: { flex: 1, gap: 4 },
  productNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  productName: {
    fontSize: 13,
    color: TEXT,
    fontWeight: "700",
    flexShrink: 1,
  },
  refundBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: DANGER + "22",
  },
  refundBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: DANGER,
    letterSpacing: 0.5,
  },
  productSku: { fontSize: 11, color: TEXT_DIM, fontWeight: "500" },
  productRight: { alignItems: "flex-end", gap: 2 },
  productPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.2,
  },
  productQty: { fontSize: 11, color: TEXT_DIM, fontWeight: "600" },
  txnDetailRow: { paddingVertical: 12, gap: 6 },
  txnDetailRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER + "55",
  },
  txnDetailHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  txnDetailDot: { width: 6, height: 6, borderRadius: 3 },
  txnDetailType: {
    fontSize: 11,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: 1,
  },
  txnDetailPlatform: {
    fontSize: 11,
    color: TEXT_DIM,
    fontWeight: "600",
  },
  txnDetailId: {
    fontSize: 11,
    color: TEXT_DIM,
    fontFamily: "Menlo",
  },
  txnDetailAmounts: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 2,
  },
  txnDetailAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.3,
  },
  txnDetailSurcharge: { fontSize: 11, color: TEXT_DIM, fontWeight: "600" },
  loading: {
    flex: 1,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 16,
  },
  loadingCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 18,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  errorBox: {
    margin: SCREEN_PADDING,
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    marginTop: 4,
  },
  errorBody: {
    fontSize: 12,
    color: TEXT_DIM,
    textAlign: "center",
    lineHeight: 18,
  },
  previewNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: SCREEN_PADDING,
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(212,175,55,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(212,175,55,0.28)",
  },
  previewNoticeText: {
    flex: 1,
    color: TEXT_DIM,
    fontSize: 11.5,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  previewPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    backgroundColor: CARD,
  },
  previewPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: TEXT,
    textTransform: "uppercase",
  },
});
