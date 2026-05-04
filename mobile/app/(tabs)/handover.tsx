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

const TYPE_TABS: { key: TypeTab; label: string }[] = [
  { key: "SHIFT", label: "Shift Close" },
  { key: "EOD", label: "End of Day" },
  { key: "KIOSK", label: "Kiosk Settlement" },
];

const TYPE_BADGE: Record<TypeTab, { label: string; tint: string; bg: string }> = {
  SHIFT: { label: "SHIFT", tint: ACCENT, bg: ACCENT_DIM },
  EOD: { label: "EOD", tint: "#a78bfa", bg: "rgba(167,139,250,0.15)" },
  KIOSK: { label: "KIOSK", tint: GOLD, bg: GOLD_DIM },
};

function badgeFor(rawType: string): { label: string; tint: string; bg: string } {
  const upper = (rawType ?? "").toUpperCase();
  if (upper === "EOD") return TYPE_BADGE.EOD;
  if (upper === "KIOSK") return TYPE_BADGE.KIOSK;
  if (upper === "SHIFT") return TYPE_BADGE.SHIFT;
  return { label: upper || "—", tint: TEXT_DIM, bg: "rgba(255,255,255,0.06)" };
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

function TypeBadge({ rawType }: { rawType: string }) {
  const meta = badgeFor(rawType);
  return (
    <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
      <Text style={[styles.typeBadgeText, { color: meta.tint }]}>{meta.label}</Text>
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function HandoverScreen() {
  const { email, token, loading: authLoading } = useAuth();
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
      setError("Sign in to view handover history.");
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
        e instanceof Error ? e.message : "Failed to load handover history.";
      setError(msg);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, email, token, rangeStart, rangeEnd]);

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
          eyebrow="REPORTS"
          title="History & Reports"
          subtitle="Shift, end-of-day and kiosk closings"
        />

        {/* Date range pill (tap to edit) */}
        <Pressable
          accessibilityLabel="Edit date range"
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

        {/* Type tabs */}
        <View style={styles.tabsRow}>
          {TYPE_TABS.map((t) => {
            const active = t.key === typeTab;
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  haptic.selection();
                  setTypeTab(t.key);
                }}
                style={({ pressed }) => [
                  styles.tab,
                  active && styles.tabActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* List */}
        <View style={styles.card}>
          <View style={styles.listHeader}>
            <Text style={[styles.colHead, styles.colStaff]}>STAFF NAME</Text>
            <Text style={[styles.colHead, styles.colTime]}>START TIME</Text>
            <Text style={[styles.colHead, styles.colTime]}>END TIME</Text>
            <Text style={[styles.colHead, styles.colMoney]}>GROSS</Text>
            <Text style={[styles.colHead, styles.colMoney]}>TAX</Text>
            <Text style={[styles.colHead, styles.colType]}>TYPE</Text>
          </View>

          {loading && items.length === 0 ? (
            <View style={styles.historyEmpty}>
              <ActivityIndicator color={TEXT_DIM} />
              <Text style={styles.historyBody}>Loading reports…</Text>
            </View>
          ) : error ? (
            <View style={styles.historyEmpty}>
              <Ionicons name="alert-circle-outline" size={28} color={DANGER} />
              <Text style={styles.historyTitle}>Couldn&apos;t load reports</Text>
              <Text style={styles.historyBody}>{error}</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.historyEmpty}>
              <Ionicons name="time-outline" size={28} color={TEXT_FAINT} />
              <Text style={styles.historyTitle}>No closings yet</Text>
              <Text style={styles.historyBody}>
                {typeTab === "KIOSK"
                  ? "Kiosk settlements will appear here once available."
                  : "Past reports of this type will appear here."}
              </Text>
            </View>
          ) : (
            filtered.map((r, i) => (
              <React.Fragment key={r._id}>
                {i > 0 && <Divider />}
                <Pressable
                  onPress={() => {
                    haptic.selection();
                    setSelectedId(r._id);
                  }}
                  style={({ pressed }) => [
                    styles.listRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.cellText, styles.cellName, styles.colStaff]}
                    numberOfLines={1}
                  >
                    {r.staff_name || r.business_info?.staff_name || "—"}
                  </Text>
                  <Text style={[styles.cellText, styles.colTime]} numberOfLines={1}>
                    {formatRowDateTime(r.start_time)}
                  </Text>
                  <Text style={[styles.cellText, styles.colTime]} numberOfLines={1}>
                    {formatRowDateTime(r.end_time)}
                  </Text>
                  <Text
                    style={[styles.cellText, styles.cellMoney, styles.colMoney]}
                    numberOfLines={1}
                  >
                    {formatMoney(r.financial_summary?.gross_sales ?? 0)}
                  </Text>
                  <Text
                    style={[styles.cellText, styles.cellMoney, styles.colMoney]}
                    numberOfLines={1}
                  >
                    {formatMoney(r.financial_summary?.total_tax ?? 0)}
                  </Text>
                  <View style={styles.colType}>
                    <TypeBadge rawType={r.type} />
                  </View>
                </Pressable>
              </React.Fragment>
            ))
          )}
        </View>
      </ScrollView>

      <DateRangePickerModal
        visible={pickerOpen}
        initialStart={rangeStart}
        initialEnd={rangeEnd}
        maxDate={today}
        title="Date range"
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
  const meta = badgeFor(report.type);
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          eyebrow={meta.label}
          title={
            meta.label === "EOD"
              ? "End of Day"
              : meta.label === "SHIFT"
              ? "Shift Close"
              : meta.label === "KIOSK"
              ? "Kiosk Settlement"
              : "Report"
          }
          subtitle={`${formatRowDateTime(report.start_time)} · ${shopName}`}
          right={
            <Pressable
              accessibilityLabel="Back to history"
              onPress={onBack}
              style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
            >
              <Ionicons name="arrow-back" size={14} color={ACCENT} />
              <Text style={styles.headerBtnText}>Back</Text>
            </Pressable>
          }
        />

        {/* Staff profile */}
        <View style={styles.card}>
          <SectionLabel label="Staff Profile" />
          <View style={styles.profileTop}>
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
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{meta.label}</Text>
              </View>
            </View>
          </View>

          <View style={styles.statRow}>
            <StatChip
              icon="receipt-outline"
              label="Orders"
              value={`${op.total_orders ?? 0}`}
              tint={ACCENT}
            />
            <StatChip
              icon="trending-up-outline"
              label="Avg Order"
              value={formatMoney(fin.average_order_value ?? 0)}
              tint={GOLD}
            />
          </View>
        </View>

        {/* Business Info */}
        <View style={styles.card}>
          <SectionLabel
            label="Business Info"
            right={<Text style={styles.hint}>{shopName}</Text>}
          />
          <StatementRow label="Start Time" value={report.start_time || "—"} />
          <Divider />
          <StatementRow label="End Time" value={report.end_time || "—"} />
          <Divider />
          <StatementRow label="Staff Name" value={staffName} />
        </View>

        {/* Statement */}
        <View style={styles.card}>
          <SectionLabel label="Statement" />
          <StatementRow
            label="Total Orders"
            value={`${op.total_orders ?? 0}`}
            emphasis
          />
          <Divider />
          <StatementRow
            label="Gross Sales"
            value={formatMoney(fin.gross_sales ?? 0)}
            emphasis
          />
          <StatementRow
            label="Item Sales"
            value={formatMoney(fin.total_item_sale ?? 0)}
            indent
          />
          <Divider />
          <StatementRow label="Net Sales" value={formatMoney(fin.net_sales ?? 0)} />
          <Divider />
          <StatementRow label="Tax" value={formatMoney(fin.total_tax ?? 0)} />
          <Divider />
          <StatementRow
            label="Discounts"
            value={formatMoney(-(fin.total_discount ?? 0))}
            negative={(fin.total_discount ?? 0) > 0}
          />
          <Divider />
          <StatementRow
            label={`Refund (${op.refund_count ?? 0})`}
            value={formatMoney(-(fin.total_refunds ?? 0))}
            negative={(fin.total_refunds ?? 0) > 0}
          />
          <Divider />
          <StatementRow
            label="Surcharge"
            value={formatMoney(fin.total_surcharge ?? 0)}
          />
          <Divider />
          <StatementRow
            label="Extra Charge"
            value={formatMoney(fin.total_extra_charge ?? 0)}
          />
          <Divider />
          <StatementRow
            label="Credit Added"
            value={formatMoney(fin.total_credit_added ?? 0)}
          />
          <Divider />
          <StatementRow
            label="Total Revenue"
            value={formatMoney(fin.total_revenue ?? 0)}
            total
          />
        </View>

        {/* Operational summary */}
        <View style={styles.card}>
          <SectionLabel label="Operational Summary" />
          <StatementRow
            label="Guest Sales"
            value={formatMoney(op.guest_sales ?? 0)}
          />
          <Divider />
          <StatementRow
            label="Member Sales"
            value={formatMoney(op.member_sales ?? 0)}
          />
        </View>

        {/* Channel Breakdown */}
        {channels.length > 0 && (
          <View style={styles.card}>
            <SectionLabel label="Channel Breakdown" />
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
            <SectionLabel label="Dining Mode" />
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
            <SectionLabel label="Total Collected" />
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
            <SectionLabel label="Categories" />
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
            <SectionLabel label="Staff Performance" />
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
              label="Top Products"
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
                    <Text style={styles.productQty}>Qty {p.qty}</Text>
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
            <SectionLabel label="Hourly Sales" />
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
          Snapshot at the time the report was closed.
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
    alignItems: "center",
    justifyContent: "center",
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

  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    padding: 16,
  },

  // List
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 10,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CARD_BORDER,
    gap: 8,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 8,
  },
  colHead: {
    color: TEXT_FAINT,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  colStaff: { flex: 1.1 },
  colTime: { flex: 1.6 },
  colMoney: { flex: 1, textAlign: "right" },
  colType: { flex: 0.9, alignItems: "flex-end" },
  cellText: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "500",
  },
  cellName: {
    fontWeight: "700",
  },
  cellMoney: {
    color: SUCCESS,
    fontWeight: "700",
    textAlign: "right",
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

  // Profile
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
