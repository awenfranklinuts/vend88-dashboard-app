import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/context/AuthContext";
import { useI18n } from "../../src/context/I18nContext";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { SectionLabel } from "../../src/components/SectionLabel";
import { DateRangePickerModal } from "../../src/components/DateRangePickerModal";
import { haptic } from "../../src/utils/haptics";
import {
  fetchOfficialCloseHistory,
  type OfficialCloseHistoryItem,
} from "../../src/services/officialDashboard";
import {
  ACCENT,
  ACCENT_DIM,
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
} from "../../src/theme/tokens";

// ─── Type tabs ──────────────────────────────────────────────────────────────

type TypeTab = "SHIFT" | "EOD" | "KIOSK";

const TYPE_BADGE: Record<TypeTab, { tint: string; bg: string }> = {
  SHIFT: { tint: ACCENT, bg: ACCENT_DIM },
  EOD: { tint: "#a78bfa", bg: "rgba(167,139,250,0.15)" },
  KIOSK: { tint: GOLD, bg: GOLD_DIM },
};

function typeKeyFor(rawType: string): TypeTab | null {
  const upper = (rawType ?? "").toUpperCase();
  if (upper === "EOD") return "EOD";
  if (upper === "KIOSK") return "KIOSK";
  if (upper === "SHIFT") return "SHIFT";
  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  const abs = Math.abs(n ?? 0);
  const sign = (n ?? 0) < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRowDateTime(iso: string): string {
  // "2026-05-03 13:00:00 +0000" -> "03/05/2026, 13:00:00"
  if (!iso) return "—";
  const [d, t] = iso.split(" ");
  if (!d) return iso;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}${t ? `, ${t}` : ""}`;
}

function formatRangeShort(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${m}/${d.getFullYear()}`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatementRow({
  label,
  value,
  emphasis,
  total,
  negative,
  indent,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  total?: boolean;
  negative?: boolean;
  indent?: boolean;
}) {
  return (
    <View style={[styles.row, indent && { paddingLeft: 18 }]}>
      <View style={styles.rowLabelWrap}>
        {indent ? <Text style={styles.rowGlyph}>└</Text> : null}
        <Text
          style={[
            styles.rowLabel,
            emphasis && styles.rowLabelEmphasis,
            total && styles.rowLabelTotal,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <Text
        style={[
          styles.rowValue,
          emphasis && styles.rowValueEmphasis,
          total && styles.rowValueTotal,
          negative && { color: DANGER },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function StatChip({
  icon,
  label,
  value,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <View style={styles.chip}>
      <View style={[styles.chipIcon, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={14} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.chipLabel}>{label}</Text>
        <Text style={styles.chipValue}>{value}</Text>
      </View>
    </View>
  );
}

function TypeBadge({ rawType, label }: { rawType: string; label: string }) {
  const typeKey = typeKeyFor(rawType);
  const meta = typeKey ? TYPE_BADGE[typeKey] : { tint: TEXT_DIM, bg: "rgba(255,255,255,0.06)" };
  return (
    <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
      <Text style={[styles.typeBadgeText, { color: meta.tint }]}>{label}</Text>
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function HandoverScreen() {
  const { email, token, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeTab, setTypeTab] = useState<TypeTab>("EOD");

  const [items, setItems] = useState<OfficialCloseHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Range. Default = first day of current month → today.
  const today = useMemo(() => new Date(), []);
  const [rangeStart, setRangeStart] = useState<Date>(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [rangeEnd, setRangeEnd] = useState<Date>(today);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!email || !token) {
      setError(t("handover_sign_in_required"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await fetchOfficialCloseHistory(rangeStart, rangeEnd, {
        email,
        token,
      });
      setItems(data);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : t("handover_load_failed");
      setError(msg);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, email, token, rangeStart, rangeEnd, t]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const selected = useMemo(
    () => items.find((r) => r._id === selectedId) ?? null,
    [items, selectedId]
  );

  const filtered = useMemo(
    () =>
      items.filter(
        (r) => (r.type ?? "").toUpperCase() === typeTab
      ),
    [items, typeTab]
  );

  // Aggregate summary across the currently visible (filtered) set.
  const summary = useMemo(() => {
    const reports = filtered.length;
    let gross = 0;
    let tax = 0;
    let orders = 0;
    for (const r of filtered) {
      gross += r.financial_summary?.gross_sales ?? 0;
      tax += r.financial_summary?.total_tax ?? 0;
      orders += r.operational_summary?.total_orders ?? 0;
    }
    return { reports, gross, tax, orders };
  }, [filtered]);

  // Count per type, used for badges on the segmented control.
  const typeCounts = useMemo(() => {
    const counts: Record<TypeTab, number> = { SHIFT: 0, EOD: 0, KIOSK: 0 };
    for (const r of items) {
      const t = (r.type ?? "").toUpperCase() as TypeTab;
      if (t in counts) counts[t] += 1;
    }
    return counts;
  }, [items]);

  const typeTabs = useMemo(
    () => [
      { key: "SHIFT" as const, label: t("handover_type_shift") },
      { key: "EOD" as const, label: t("handover_type_eod") },
      { key: "KIOSK" as const, label: t("handover_type_kiosk") },
    ],
    [t]
  );

  const labelForType = useCallback(
    (rawType: string) => {
      const typeKey = typeKeyFor(rawType);
      if (typeKey === "SHIFT") return t("handover_type_shift");
      if (typeKey === "EOD") return t("handover_type_eod");
      if (typeKey === "KIOSK") return t("handover_type_kiosk");
      return rawType || "—";
    },
    [t]
  );

  if (selected) {
    return (
      <DetailView
        report={selected}
        email={email ?? null}
        onBack={() => {
          haptic.selection();
          setSelectedId(null);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={TEXT_DIM}
          />
        }
      >
        <ScreenHeader
          eyebrow={t("handover_reports_eyebrow")}
          title={t("handover_title")}
          subtitle={t("handover_subtitle")}
        />

        {/* Date range pill (tap to edit) */}
        <Pressable
          accessibilityLabel={t("handover_edit_date_range")}
          onPress={() => {
            haptic.selection();
            setPickerOpen(true);
          }}
          style={({ pressed }) => [styles.rangeRow, pressed && styles.pressed]}
        >
          <View style={styles.rangePill} pointerEvents="none">
            <Ionicons name="calendar-outline" size={14} color={TEXT_DIM} />
            <Text style={styles.rangeText}>{formatRangeShort(rangeStart)}</Text>
          </View>
          <Ionicons name="arrow-forward" size={14} color={TEXT_FAINT} />
          <View style={styles.rangePill} pointerEvents="none">
            <Ionicons name="calendar-outline" size={14} color={TEXT_DIM} />
            <Text style={styles.rangeText}>{formatRangeShort(rangeEnd)}</Text>
          </View>
        </Pressable>

        {/* Summary banner */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryHeaderLeft}>
              <View style={styles.summaryIcon}>
                <Ionicons name="stats-chart-outline" size={14} color={GOLD} />
              </View>
              <Text style={styles.summaryEyebrow}>{t("handover_range_summary")}</Text>
            </View>
            <Text style={styles.summaryHint}>
              {t("handover_reports_count", { count: summary.reports })}
            </Text>
          </View>
          <Text style={styles.summaryHero}>{formatMoney(summary.gross)}</Text>
          <Text style={styles.summarySub}>
            {t("sales_stmt_gross_sales")} · {labelForType(typeTab)}
          </Text>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStats}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatLabel}>{t("sales_orders")}</Text>
              <Text style={styles.summaryStatValue}>{summary.orders}</Text>
            </View>
            <View style={styles.summaryStatSep} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatLabel}>{t("sales_stmt_tax")}</Text>
              <Text style={styles.summaryStatValue}>
                {formatMoney(summary.tax)}
              </Text>
            </View>
            <View style={styles.summaryStatSep} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatLabel}>{t("handover_avg_per_report")}</Text>
              <Text style={styles.summaryStatValue}>
                {formatMoney(
                  summary.reports > 0 ? summary.gross / summary.reports : 0
                )}
              </Text>
            </View>
          </View>
        </View>

        {/* Type segmented control */}
        <View style={styles.tabsRow}>
          {typeTabs.map((tab) => {
            const active = tab.key === typeTab;
            const count = typeCounts[tab.key];
            return (
              <Pressable
                key={tab.key}
                onPress={() => {
                  haptic.selection();
                  setTypeTab(tab.key);
                }}
                style={({ pressed }) => [
                  styles.tab,
                  active && styles.tabActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {tab.label}
                </Text>
                {count > 0 ? (
                  <View
                    style={[
                      styles.tabCount,
                      active && styles.tabCountActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabCountText,
                        active && styles.tabCountTextActive,
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* Reports list */}
        {loading && items.length === 0 ? (
          <View style={[styles.card, styles.historyEmpty]}>
            <ActivityIndicator color={TEXT_DIM} />
            <Text style={styles.historyBody}>{t("handover_loading_reports")}</Text>
          </View>
        ) : error ? (
          <View style={[styles.card, styles.historyEmpty]}>
            <Ionicons name="alert-circle-outline" size={28} color={DANGER} />
            <Text style={styles.historyTitle}>{t("handover_load_reports_title")}</Text>
            <Text style={styles.historyBody}>{error}</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={[styles.card, styles.historyEmpty]}>
            <Ionicons name="time-outline" size={28} color={TEXT_FAINT} />
            <Text style={styles.historyTitle}>{t("handover_empty_title")}</Text>
            <Text style={styles.historyBody}>
              {typeTab === "KIOSK"
                ? t("handover_empty_kiosk")
                : t("handover_empty_generic")}
            </Text>
          </View>
        ) : (
          <View style={styles.reportList}>
            {filtered.map((r) => {
              const staff = r.staff_name || r.business_info?.staff_name || "—";
              const shop = r.business_info?.shop_name || "";
              const gross = r.financial_summary?.gross_sales ?? 0;
              const tax = r.financial_summary?.total_tax ?? 0;
              const net = r.financial_summary?.net_sales ?? 0;
              const orders = r.operational_summary?.total_orders ?? 0;
              return (
                <Pressable
                  key={r._id}
                  onPress={() => {
                    haptic.selection();
                    setSelectedId(r._id);
                  }}
                  style={({ pressed }) => [
                    styles.reportCard,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.reportTop}>
                    <TypeBadge rawType={r.type} label={labelForType(r.type)} />
                    <View style={styles.reportTimeRow}>
                      <Ionicons name="time-outline" size={11} color={TEXT_FAINT} />
                      <Text style={styles.reportTimeText} numberOfLines={1}>
                        {formatRowDateTime(r.start_time)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.reportStaff} numberOfLines={1}>
                    {staff}
                  </Text>
                  {shop ? (
                    <Text style={styles.reportShop} numberOfLines={1}>
                      {shop}
                    </Text>
                  ) : null}

                  <View style={styles.reportStatsRow}>
                    <View style={styles.reportStat}>
                      <Text style={styles.reportStatLabel}>{t("handover_gross_short")}</Text>
                      <Text style={styles.reportStatValue}>
                        {formatMoney(gross)}
                      </Text>
                    </View>
                    <View style={styles.reportStatSep} />
                    <View style={styles.reportStat}>
                      <Text style={styles.reportStatLabel}>{t("handover_net_short")}</Text>
                      <Text style={styles.reportStatValueDim}>
                        {formatMoney(net)}
                      </Text>
                    </View>
                    <View style={styles.reportStatSep} />
                    <View style={styles.reportStat}>
                      <Text style={styles.reportStatLabel}>{t("sales_stmt_tax")}</Text>
                      <Text style={styles.reportStatValueDim}>
                        {formatMoney(tax)}
                      </Text>
                    </View>
                    <View style={styles.reportStatSep} />
                    <View style={styles.reportStat}>
                      <Text style={styles.reportStatLabel}>{t("sales_orders")}</Text>
                      <Text style={styles.reportStatValueDim}>{orders}</Text>
                    </View>
                  </View>

                  <View style={styles.reportFooter}>
                    <Text style={styles.reportFooterText}>{t("handover_view_details")}</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={ACCENT}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <DateRangePickerModal
        visible={pickerOpen}
        initialStart={rangeStart}
        initialEnd={rangeEnd}
        maxDate={today}
        title={t("handover_date_range")}
        onClose={() => setPickerOpen(false)}
        onApply={(start, end) => {
          setRangeStart(start);
          setRangeEnd(end);
          setPickerOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Detail view ────────────────────────────────────────────────────────────

function DetailView({
  report,
  email,
  onBack,
}: {
  report: OfficialCloseHistoryItem;
  email: string | null;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const typeKey = typeKeyFor(report.type);
  const meta = typeKey ? TYPE_BADGE[typeKey] : { tint: TEXT_DIM, bg: "rgba(255,255,255,0.06)" };
  const fin = report.financial_summary ?? ({} as OfficialCloseHistoryItem["financial_summary"]);
  const op = report.operational_summary ?? ({} as OfficialCloseHistoryItem["operational_summary"]);
  const bd = report.breakdowns ?? {};
  const channels = Object.entries(bd.channel ?? {});
  const dining = Object.entries(bd.dining_mode ?? {});
  const payments = Object.entries(bd.payment_method ?? {});
  const categories = Object.entries(bd.categories ?? {});
  const staffPerf = Object.entries(bd.staff_performance ?? {});
  const hourly = Object.entries(bd.hourly_sales ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const topProducts = report.top_products ?? [];

  const staffName = report.staff_name || report.business_info?.staff_name || "—";
  const shopName = report.business_info?.shop_name ?? "—";
  const typeLabel =
    typeKey === "EOD"
      ? t("handover_type_eod")
      : typeKey === "SHIFT"
      ? t("handover_type_shift")
      : typeKey === "KIOSK"
      ? t("handover_type_kiosk")
      : report.type || t("handover_report_fallback");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          eyebrow={typeLabel}
          title={
            typeKey === "EOD"
              ? t("handover_type_eod")
              : typeKey === "SHIFT"
              ? t("handover_type_shift")
              : typeKey === "KIOSK"
              ? t("handover_type_kiosk")
              : t("handover_report_fallback")
          }
          subtitle={`${formatRowDateTime(report.start_time)} · ${shopName}`}
          right={
            <Pressable
              accessibilityLabel={t("handover_back_to_history")}
              onPress={onBack}
              style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
            >
              <Ionicons name="arrow-back" size={14} color={ACCENT} />
              <Text style={styles.headerBtnText}>{t("handover_back")}</Text>
            </Pressable>
          }
        />

        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {staffName
                  .split(" ")
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase() || "?"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName} numberOfLines={1}>
                {staffName}
              </Text>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {email ?? "N.A"}
              </Text>
            </View>
            <View
              style={[styles.typeBadge, { backgroundColor: meta.bg }]}
            >
              <Text style={[styles.typeBadgeText, { color: meta.tint }]}>
                {typeLabel}
              </Text>
            </View>
          </View>

          <Text style={styles.heroEyebrow}>{t("sales_stmt_total_revenue")}</Text>
          <Text style={styles.heroAmount}>
            {formatMoney(fin.total_revenue ?? 0)}
          </Text>
          <Text style={styles.heroSub} numberOfLines={1}>
            {shopName}
          </Text>

          <View style={styles.heroDivider} />

          <View style={styles.statRow}>
            <StatChip
              icon="receipt-outline"
              label={t("sales_orders")}
              value={`${op.total_orders ?? 0}`}
              tint={ACCENT}
            />
            <StatChip
              icon="trending-up-outline"
              label={t("sales_avg_order")}
              value={formatMoney(fin.average_order_value ?? 0)}
              tint={GOLD}
            />
          </View>
        </View>

        {/* Business Info */}
        <View style={styles.card}>
          <SectionLabel
            label={t("handover_business_info")}
            right={<Text style={styles.hint}>{shopName}</Text>}
          />
          <StatementRow label={t("handover_start_time")} value={report.start_time || "—"} />
          <Divider />
          <StatementRow label={t("handover_end_time")} value={report.end_time || "—"} />
          <Divider />
          <StatementRow label={t("handover_staff_name")} value={staffName} />
        </View>

        {/* Statement */}
        <View style={styles.card}>
          <SectionLabel label={t("sales_statement")} />
          <StatementRow
            label={t("sales_stmt_total_orders")}
            value={`${op.total_orders ?? 0}`}
            emphasis
          />
          <Divider />
          <StatementRow
            label={t("sales_stmt_gross_sales")}
            value={formatMoney(fin.gross_sales ?? 0)}
            emphasis
          />
          <StatementRow
            label={t("sales_stmt_item_sales")}
            value={formatMoney(fin.total_item_sale ?? 0)}
            indent
          />
          <Divider />
          <StatementRow label={t("handover_net_sales")} value={formatMoney(fin.net_sales ?? 0)} />
          <Divider />
          <StatementRow label={t("sales_stmt_tax")} value={formatMoney(fin.total_tax ?? 0)} />
          <Divider />
          <StatementRow
            label={t("sales_stmt_discounts")}
            value={formatMoney(-(fin.total_discount ?? 0))}
            negative={(fin.total_discount ?? 0) > 0}
          />
          <Divider />
          <StatementRow
            label={t("handover_refund_count", { count: op.refund_count ?? 0 })}
            value={formatMoney(-(fin.total_refunds ?? 0))}
            negative={(fin.total_refunds ?? 0) > 0}
          />
          <Divider />
          <StatementRow
            label={t("handover_surcharge")}
            value={formatMoney(fin.total_surcharge ?? 0)}
          />
          <Divider />
          <StatementRow
            label={t("handover_extra_charge")}
            value={formatMoney(fin.total_extra_charge ?? 0)}
          />
          <Divider />
          <StatementRow
            label={t("handover_credit_added")}
            value={formatMoney(fin.total_credit_added ?? 0)}
          />
          <Divider />
          <StatementRow
            label={t("sales_stmt_total_revenue")}
            value={formatMoney(fin.total_revenue ?? 0)}
            total
          />
        </View>

        {/* Operational summary */}
        <View style={styles.card}>
          <SectionLabel label={t("handover_operational_summary")} />
          <StatementRow
            label={t("handover_guest_sales")}
            value={formatMoney(op.guest_sales ?? 0)}
          />
          <Divider />
          <StatementRow
            label={t("handover_member_sales")}
            value={formatMoney(op.member_sales ?? 0)}
          />
        </View>

        {/* Channel Breakdown */}
        {channels.length > 0 && (
          <View style={styles.card}>
            <SectionLabel label={t("handover_channel_breakdown")} />
            {channels.map(([label, total], i) => (
              <React.Fragment key={label}>
                {i > 0 && <Divider />}
                <StatementRow
                  label={label.toUpperCase()}
                  value={formatMoney(total)}
                />
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Dining Mode */}
        {dining.length > 0 && (
          <View style={styles.card}>
            <SectionLabel label={t("sales_stmt_section_dining_mode")} />
            {dining.map(([label, total], i) => (
              <React.Fragment key={label}>
                {i > 0 && <Divider />}
                <StatementRow label={label} value={formatMoney(total)} />
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Total Collected */}
        {payments.length > 0 && (
          <View style={styles.card}>
            <SectionLabel label={t("handover_total_collected")} />
            {payments.map(([label, total], i) => (
              <React.Fragment key={label}>
                {i > 0 && <Divider />}
                <StatementRow label={label} value={formatMoney(total)} emphasis />
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Categories */}
        {categories.length > 0 && (
          <View style={styles.card}>
            <SectionLabel label={t("products_categories")} />
            {categories.map(([label, total], i) => (
              <React.Fragment key={label}>
                {i > 0 && <Divider />}
                <StatementRow label={label} value={formatMoney(total)} />
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Staff performance */}
        {staffPerf.length > 0 && (
          <View style={styles.card}>
            <SectionLabel label={t("handover_staff_performance")} />
            {staffPerf.map(([label, total], i) => (
              <React.Fragment key={label}>
                {i > 0 && <Divider />}
                <StatementRow label={label} value={formatMoney(total)} />
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Top Products */}
        {topProducts.length > 0 && (
          <View style={styles.card}>
            <SectionLabel
              label={t("handover_top_products")}
              right={<Text style={styles.hint}>{topProducts.length}</Text>}
            />
            {topProducts.map((p, i) => (
              <React.Fragment key={`${p.name}-${i}`}>
                {i > 0 && <Divider />}
                <View style={styles.productRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName} numberOfLines={1}>
                      {p.name?.trim() || "—"}
                    </Text>
                    <Text style={styles.productQty}>{t("handover_qty", { count: p.qty })}</Text>
                  </View>
                  <Text style={styles.productTotal}>{formatMoney(p.total)}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Hourly sales */}
        {hourly.length > 0 && (
          <View style={styles.card}>
            <SectionLabel label={t("handover_hourly_sales")} />
            {hourly.map(([label, total], i) => (
              <React.Fragment key={label}>
                {i > 0 && <Divider />}
                <StatementRow label={label} value={formatMoney(total)} />
              </React.Fragment>
            ))}
          </View>
        )}

        <Text style={styles.footnote}>
          <Ionicons name="information-circle-outline" size={12} color={TEXT_DIM} />
          {"  "}
          {t("handover_snapshot_note")}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
// Reserved for future status surfaces.
void SUCCESS;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  content: {
    padding: SCREEN_PADDING,
    paddingTop: 8,
    paddingBottom: 140,
    gap: 14,
  },

  pressed: { opacity: 0.7 },

  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: ACCENT_DIM,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(64,100,220,0.3)",
  },
  headerBtnText: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // Range row
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rangePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  rangeText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "600",
  },

  // Type tabs
  tabsRow: {
    flexDirection: "row",
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  tabText: {
    color: TEXT_DIM,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: TEXT,
  },
  tabCount: {
    minWidth: 18,
    paddingHorizontal: 5,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountActive: {
    backgroundColor: GOLD_DIM,
  },
  tabCountText: {
    color: TEXT_DIM,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  tabCountTextActive: {
    color: GOLD,
  },

  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 16,
  },

  // Summary banner
  summaryCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 16,
    gap: 4,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GOLD_DIM,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryEyebrow: {
    color: TEXT_DIM,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  summaryHint: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  summaryHero: {
    color: TEXT,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 8,
  },
  summarySub: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 2,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CARD_BORDER,
    marginVertical: 14,
  },
  summaryStats: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  summaryStat: {
    flex: 1,
  },
  summaryStatSep: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: CARD_BORDER,
    marginHorizontal: 6,
  },
  summaryStatLabel: {
    color: TEXT_FAINT,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  summaryStatValue: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },

  // Report list cards
  reportList: {
    gap: 10,
  },
  reportCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 14,
    gap: 6,
  },
  reportTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reportTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  reportTimeText: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "600",
  },
  reportStaff: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
    marginTop: 4,
  },
  reportShop: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },
  reportStatsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CARD_BORDER,
  },
  reportStat: {
    flex: 1,
  },
  reportStatSep: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: CARD_BORDER,
    marginHorizontal: 4,
  },
  reportStatLabel: {
    color: TEXT_FAINT,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  reportStatValue: {
    color: SUCCESS,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
  },
  reportStatValueDim: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  reportFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 8,
  },
  reportFooterText: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  // Detail hero
  heroCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 16,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  heroEyebrow: {
    color: TEXT_DIM,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 4,
  },
  heroAmount: {
    color: TEXT,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.6,
    marginTop: 4,
  },
  heroSub: {
    color: TEXT_DIM,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CARD_BORDER,
    marginVertical: 14,
  },

  // Profile (legacy — kept for compatibility)
  profileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: GOLD_DIM,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(212,175,55,0.4)",
  },
  avatarText: {
    color: GOLD,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  profileName: {
    color: TEXT,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  profileEmail: {
    color: TEXT_DIM,
    fontSize: 12,
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: ACCENT_DIM,
  },
  roleBadgeText: {
    color: ACCENT,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },

  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  chipIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  chipLabel: {
    color: TEXT_DIM,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  chipValue: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 1,
  },

  // Statement rows
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 12,
  },
  rowLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  rowGlyph: { color: TEXT_FAINT, fontSize: 12 },
  rowLabel: {
    color: TEXT_DIM,
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
  },
  rowLabelEmphasis: { color: TEXT, fontWeight: "700" },
  rowLabelTotal: { color: TEXT, fontWeight: "800" },
  rowValue: { color: TEXT, fontSize: 13, fontWeight: "600" },
  rowValueEmphasis: { color: TEXT, fontWeight: "700" },
  rowValueTotal: { color: GOLD, fontSize: 15, fontWeight: "800" },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CARD_BORDER,
  },
  hint: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },

  // Top products
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  productName: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "700",
  },
  productQty: {
    color: TEXT_DIM,
    fontSize: 11,
    marginTop: 2,
  },
  productTotal: {
    color: GOLD,
    fontSize: 13,
    fontWeight: "800",
  },

  footnote: {
    color: TEXT_DIM,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 4,
  },

  // Empty state
  historyEmpty: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 8,
  },
  historyTitle: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  historyBody: {
    color: TEXT_DIM,
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 12,
    lineHeight: 18,
  },
});
