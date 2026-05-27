import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeModules,
  Platform,
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
import { NativeModulesProxy } from "expo-modules-core";
import { useI18n } from "../../src/context/I18nContext";
import { useAuth } from "../../src/context/AuthContext";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { SectionLabel } from "../../src/components/SectionLabel";
import { TopProgressBar } from "../../src/components/TopProgressBar";
import { OfflineNotice } from "../../src/components/OfflineNotice";
import { Skeleton } from "../../src/components/Skeleton";
import { SingleDatePickerModal } from "../../src/components/SingleDatePickerModal";
import { haptic } from "../../src/utils/haptics";
import {
  fetchOfficialShopDetail,
  updateOfficialShop,
  type OfficialNamedSurcharge,
  type OfficialShopDetail,
  type OfficialShopOpenHours,
  type OpenHourSlot,
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
  SUCCESS_DIM,
  TEXT,
  TEXT_DIM,
  TEXT_FAINT,
  type ThemeTokens,
} from "../../src/theme/tokens";
import { useThemeTokens } from "../../src/context/ThemeContext";

const DAYS: (keyof OfficialShopOpenHours)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_LABELS: Record<keyof OfficialShopOpenHours, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

// Build the storefront URL from a shop key. Mirrors the web dashboard format.
function buildStorefrontUrl(shopKey?: string): string | null {
  if (!shopKey) return null;
  return `https://${shopKey}.vendappdevelopment.s3-website-ap-southeast-2.amazonaws.com/`;
}

function formatPercent(n: number): string {
  const pct = Math.round(n * 100 * 10) / 10;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct}%`;
}

function formatSurchargeDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${day} ${month} ${d.getFullYear()}`;
}

// Sanitize an HH:MM input — strip non-digits and re-insert the colon. Keeps
// partial typing usable (e.g. "9" → "9", "930" → "9:30", "0930" → "09:30").
function sanitizeTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function isValidTime(value: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return false;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h >= 0 && h <= 23 && mm >= 0 && mm <= 59;
}

function padTime(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return value;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

// Normalize a date string coming from the API/storage. Some legacy records
// may contain the string "null"/"undefined" or whitespace; coerce those to an
// empty string so the rest of the UI can treat them uniformly.
function normalizeStoredDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "none") return "";
  return trimmed;
}

// Auto-format YYYY-MM-DD as the user types digits.
function sanitizeDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function isValidDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

// Parses user-entered percent (e.g. "50", "5.5") into a decimal (0.5, 0.055).
function parsePercentInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

function percentToInput(decimal: number): string {
  // Round to at most 2 decimal places to avoid float noise like 5.000000001.
  const v = Math.round(decimal * 100 * 100) / 100;
  return String(v);
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function maskId(v: string): string {
  if (!v) return "—";
  if (v.length <= 4) return "••••";
  return "•".repeat(Math.max(8, v.length - 4)) + v.slice(-4);
}

// Clipboard helper — tries ExpoClipboard first, falls back to React Native's
// built-in Clipboard TurboModule which is always registered in any RN app.
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Prefer ExpoClipboard when available (i.e. dev client built with it).
    const expoClip = (NativeModulesProxy as Record<string, unknown>)["ExpoClipboard"] as
      | { setStringAsync: (s: string) => Promise<void> }
      | undefined;
    if (expoClip?.setStringAsync) {
      await expoClip.setStringAsync(text);
      return true;
    }
    // Fall back to React Native core Clipboard (always available).
    const rnClip = NativeModules.Clipboard as
      | { setString: (s: string) => void }
      | undefined;
    if (rnClip?.setString) {
      rnClip.setString(text);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function DetailRow({
  label,
  value,
  secret,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
  const tokens = useThemeTokens();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    []
  );

  const handleCopy = useCallback(async () => {
    if (!value) return;
    const ok = await copyToClipboard(value);
    if (ok) {
      haptic.success();
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } else {
      haptic.error();
    }
  }, [value]);

  const display = secret && !revealed ? maskId(value) : value;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      {secret ? (
        <Pressable
          onLongPress={handleCopy}
          delayLongPress={350}
          style={styles.detailValueRow}
          android_ripple={{ color: tokens.CARD_HOVER }}
        >
          <Text
            style={[
              styles.detailValue,
              !revealed && !copied && styles.detailValueMasked,
              copied && { color: tokens.SUCCESS },
            ]}
            numberOfLines={1}
          >
            {copied ? t("sales_export_copied") : display || "—"}
          </Text>
          <Pressable
            hitSlop={8}
            onPress={() => setRevealed((v) => !v)}
            style={({ pressed }) => [
              styles.revealBtn,
              pressed && { opacity: 0.5 },
            ]}
          >
            <Ionicons
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={14}
              color={tokens.TEXT_DIM}
            />
          </Pressable>
        </Pressable>
      ) : (
        <Text style={styles.detailValue} numberOfLines={2}>
          {value || "—"}
        </Text>
      )}
    </View>
  );
}

const DAY_LABEL_KEYS: Record<
  keyof OfficialShopOpenHours,
  "stores_day_monday" | "stores_day_tuesday" | "stores_day_wednesday" | "stores_day_thursday" | "stores_day_friday" | "stores_day_saturday" | "stores_day_sunday"
> = {
  monday: "stores_day_monday",
  tuesday: "stores_day_tuesday",
  wednesday: "stores_day_wednesday",
  thursday: "stores_day_thursday",
  friday: "stores_day_friday",
  saturday: "stores_day_saturday",
  sunday: "stores_day_sunday",
};

function SectionCard({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {action ? <View style={styles.cardHeaderAction}>{action}</View> : null}
      </View>
      {hint ? (
        <Text style={styles.cardHint}>{hint}</Text>
      ) : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function HoursRow({
  day,
  label,
  slots,
}: {
  day: keyof OfficialShopOpenHours;
  label: string;
  slots: OpenHourSlot[];
}) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { t } = useI18n();
  const closed = slots.length === 0;
  return (
    <View style={styles.hoursRow}>
      <Text style={[styles.hoursDayLabel, closed && styles.hoursDayLabelDim]}>
        {label}
      </Text>
      <View style={styles.hoursSlots}>
        {closed ? (
          <Text style={styles.closedLabel}>{t("stores_closed")}</Text>
        ) : (
          slots.map((s, idx) => (
            <View
              key={`${day}-${idx}-${s.start_time}-${s.end_time}`}
              style={styles.slotItem}
            >
              {idx > 0 ? <View style={styles.slotDivider} /> : null}
              <Text style={styles.slotText}>
                {s.start_time}
                <Text style={styles.slotDash}>  –  </Text>
                {s.end_time}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function SurchargeRow({ item }: { item: OfficialNamedSurcharge }) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return (
    <View style={styles.surchargeRow}>
      <View style={styles.surchargeLeft}>
        <View style={styles.surchargeTagRow}>
          <Ionicons name="pricetag-outline" size={13} color={tokens.TEXT_DIM} />
          <Text style={styles.surchargeName}>{item.name}</Text>
        </View>
        <View style={styles.surchargeDateRow}>
          <Ionicons name="calendar-outline" size={12} color={tokens.TEXT_FAINT} />
          <Text style={styles.surchargeDate}>
            {formatSurchargeDate(item.date)}
          </Text>
        </View>
      </View>
      <View style={styles.surchargeRight}>
        <View
          style={[
            styles.surchargeToggle,
            {
              backgroundColor: item.enabled
                ? tokens.SUCCESS_DIM
                : "rgba(255,255,255,0.06)",
            },
          ]}
        >
          <View
            style={[
              styles.surchargeDot,
              {
                backgroundColor: item.enabled ? tokens.SUCCESS : tokens.TEXT_FAINT,
                alignSelf: item.enabled ? "flex-end" : "flex-start",
              },
            ]}
          />
        </View>
        <View
          style={[
            styles.surchargePctPill,
            {
              backgroundColor: item.enabled
                ? tokens.ACCENT_DIM
                : "rgba(255,255,255,0.05)",
            },
          ]}
        >
          <Text
            style={[
              styles.surchargePctText,
              { color: item.enabled ? tokens.ACCENT : tokens.TEXT_DIM },
            ]}
          >
            {formatPercent(item.percentage)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Edit Hours Modal ───────────────────────────────────────────────────────

function EditHoursModal({
  visible,
  initial,
  saving,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: OfficialShopOpenHours;
  saving: boolean;
  onCancel: () => void;
  onSave: (hours: OfficialShopOpenHours) => void;
}) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { t } = useI18n();
  const [draft, setDraft] = useState<OfficialShopOpenHours>(initial);

  // Reset draft each time the modal opens with new data.
  useEffect(() => {
    if (visible) setDraft(initial);
  }, [visible, initial]);

  const updateSlot = useCallback(
    (
      day: keyof OfficialShopOpenHours,
      idx: number,
      field: "start_time" | "end_time",
      raw: string
    ) => {
      setDraft((prev) => {
        const slots = [...prev[day]];
        slots[idx] = { ...slots[idx], [field]: sanitizeTimeInput(raw) };
        return { ...prev, [day]: slots };
      });
    },
    []
  );

  const addSlot = useCallback((day: keyof OfficialShopOpenHours) => {
    haptic.light();
    setDraft((prev) => ({
      ...prev,
      [day]: [...prev[day], { start_time: "09:00", end_time: "17:00" }],
    }));
  }, []);

  const removeSlot = useCallback(
    (day: keyof OfficialShopOpenHours, idx: number) => {
      haptic.light();
      setDraft((prev) => ({
        ...prev,
        [day]: prev[day].filter((_, i) => i !== idx),
      }));
    },
    []
  );

  const handleSave = useCallback(() => {
    // Validate all slot values before committing.
    for (const day of DAYS) {
      for (const slot of draft[day]) {
        if (!isValidTime(slot.start_time) || !isValidTime(slot.end_time)) {
          Alert.alert(
            t("stores_modal_alert_invalid_time"),
            t("stores_modal_alert_invalid_time_msg", { day: t(DAY_LABEL_KEYS[day]) })
          );
          return;
        }
      }
    }
    // Normalize zero-padding before sending.
    const normalized: OfficialShopOpenHours = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    };
    for (const day of DAYS) {
      normalized[day] = draft[day].map((s) => ({
        start_time: padTime(s.start_time),
        end_time: padTime(s.end_time),
      }));
    }
    onSave(normalized);
  }, [draft, onSave, t]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.modalSafe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable onPress={onCancel} hitSlop={10}>
              <Text style={styles.modalCancel}>{t("common_cancel")}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{t("stores_modal_edit_hours")}</Text>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              hitSlop={10}
            >
              {saving ? (
                <ActivityIndicator color={tokens.GOLD} />
              ) : (
                <Text style={styles.modalSave}>{t("stores_modal_save")}</Text>
              )}
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            {DAYS.map((day) => (
              <View key={day} style={styles.editDayGroup}>
                <View style={styles.editDayHeader}>
                  <Text style={styles.editDayLabel}>{t(DAY_LABEL_KEYS[day])}</Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.addSlotBtn,
                      pressed && { opacity: 0.6 },
                    ]}
                    onPress={() => addSlot(day)}
                    hitSlop={6}
                  >
                    <Ionicons name="add" size={13} color={tokens.ACCENT} />
                    <Text style={styles.addSlotLabel}>{t("stores_modal_add_slot")}</Text>
                  </Pressable>
                </View>
                {draft[day].length === 0 ? (
                  <Text style={styles.editClosedHint}>
                    {t("stores_edit_closed_hint")}
                  </Text>
                ) : (
                  <View style={styles.editSlotList}>
                    {draft[day].map((slot, idx) => (
                      <View key={idx} style={styles.editSlotRow}>
                        <TextInput
                          value={slot.start_time}
                          onChangeText={(v) =>
                            updateSlot(day, idx, "start_time", v)
                          }
                          placeholder="--:--"
                          placeholderTextColor={tokens.TEXT_FAINT}
                          keyboardType="number-pad"
                          maxLength={5}
                          style={styles.editInput}
                        />
                        <Text style={styles.editArrow}>–</Text>
                        <TextInput
                          value={slot.end_time}
                          onChangeText={(v) =>
                            updateSlot(day, idx, "end_time", v)
                          }
                          placeholder="--:--"
                          placeholderTextColor={tokens.TEXT_FAINT}
                          keyboardType="number-pad"
                          maxLength={5}
                          style={styles.editInput}
                        />
                        <Pressable
                          onPress={() => removeSlot(day, idx)}
                          hitSlop={10}
                          style={({ pressed }) => [
                            styles.removeSlotBtn,
                            pressed && { opacity: 0.5 },
                          ]}
                        >
                          <Ionicons
                            name="close"
                            size={16}
                            color={tokens.TEXT_FAINT}
                          />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Edit Surcharges Modal ──────────────────────────────────────────────────

type SpecificDraft = { id: string; date: string; percentInput: string };
type NamedDraft = {
  id: string;
  /** Original key in named_surcharges (for replacement detection). */
  originalKey?: string;
  name: string;
  date: string;
  percentInput: string;
  enabled: boolean;
};

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function EditSurchargesModal({
  visible,
  initialNamed,
  initialSpecific,
  saving,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initialNamed: Record<string, OfficialNamedSurcharge>;
  initialSpecific: Record<string, number>;
  saving: boolean;
  onCancel: () => void;
  onSave: (
    named: Record<string, OfficialNamedSurcharge>,
    specific: Record<string, number>
  ) => void;
}) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { t } = useI18n();
  const [specificDraft, setSpecificDraft] = useState<SpecificDraft[]>([]);
  const [namedDraft, setNamedDraft] = useState<NamedDraft[]>([]);
  // Identifier of the row whose date picker is currently open. Encodes which
  // list the row belongs to so we can route the apply back to the right state.
  // Format: "specific:<id>" or "named:<id>".
  const [datePickerTarget, setDatePickerTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSpecificDraft(
      Object.entries(initialSpecific)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, pct]) => ({
          id: makeId(),
          date: normalizeStoredDate(date),
          percentInput: percentToInput(pct),
        }))
    );
    setNamedDraft(
      Object.entries(initialNamed).map(([key, item]) => ({
        id: makeId(),
        originalKey: key,
        name: item.name || key,
        date: normalizeStoredDate(item.date),
        percentInput: percentToInput(item.percentage),
        enabled: item.enabled,
      }))
    );
  }, [visible, initialNamed, initialSpecific]);

  const addSpecific = useCallback(() => {
    haptic.light();
    setSpecificDraft((prev) => [
      ...prev,
      { id: makeId(), date: "", percentInput: "" },
    ]);
  }, []);

  const updateSpecific = useCallback(
    (id: string, field: "date" | "percentInput", value: string) => {
      setSpecificDraft((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                [field]: field === "date" ? sanitizeDateInput(value) : value,
              }
            : row
        )
      );
    },
    []
  );

  const removeSpecific = useCallback((id: string) => {
    haptic.light();
    setSpecificDraft((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const addNamed = useCallback(() => {
    haptic.light();
    setNamedDraft((prev) => [
      ...prev,
      {
        id: makeId(),
        name: "",
        date: "",
        percentInput: "",
        enabled: true,
      },
    ]);
  }, []);

  const updateNamed = useCallback(
    (id: string, patch: Partial<NamedDraft>) => {
      setNamedDraft((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          const next = { ...row, ...patch };
          if (patch.date !== undefined) next.date = sanitizeDateInput(patch.date);
          return next;
        })
      );
    },
    []
  );

  const removeNamed = useCallback((id: string) => {
    haptic.light();
    setNamedDraft((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const handleSave = useCallback(() => {
    // Validate specific rows.
    const specificOut: Record<string, number> = {};
    for (const row of specificDraft) {
      if (!row.date && !row.percentInput.trim()) continue; // skip empty
      if (!isValidDate(row.date)) {
        Alert.alert(
          t("stores_modal_alert_invalid_date"),
          t("stores_modal_alert_invalid_date_msg", { value: row.date || "(empty)" })
        );
        return;
      }
      const pct = parsePercentInput(row.percentInput);
      if (pct === null || pct < 0) {
        Alert.alert(
          t("stores_modal_alert_invalid_percent"),
          t("stores_modal_alert_invalid_percent_msg", { date: row.date })
        );
        return;
      }
      if (specificOut[row.date] !== undefined) {
        Alert.alert(
          t("stores_modal_alert_duplicate_date"),
          t("stores_modal_alert_duplicate_date_msg", { date: row.date })
        );
        return;
      }
      specificOut[row.date] = pct;
    }

    // Validate named rows.
    const namedOut: Record<string, OfficialNamedSurcharge> = {};
    for (const row of namedDraft) {
      const name = row.name.trim();
      if (!name && !row.date && !row.percentInput.trim()) continue; // skip blank rows
      if (!name) {
        Alert.alert(
          t("stores_modal_alert_missing_name"),
          t("stores_modal_alert_missing_name_msg")
        );
        return;
      }
      // Named surcharges don't require a date — some legacy/API entries are
      // recurring or undated. Only validate when the user actually entered
      // something so typos still surface.
      if (row.date && !isValidDate(row.date)) {
        Alert.alert(
          t("stores_modal_alert_invalid_date"),
          t("stores_modal_alert_invalid_date_named", { name })
        );
        return;
      }
      const pct = parsePercentInput(row.percentInput);
      if (pct === null || pct < 0) {
        Alert.alert(
          t("stores_modal_alert_invalid_percent"),
          t("stores_modal_alert_invalid_percent_named", { name })
        );
        return;
      }
      if (namedOut[name]) {
        Alert.alert(
          t("stores_modal_alert_duplicate_name"),
          t("stores_modal_alert_duplicate_name_msg", { name })
        );
        return;
      }
      namedOut[name] = {
        name,
        date: row.date,
        enabled: row.enabled,
        percentage: pct,
      };
    }

    onSave(namedOut, specificOut);
  }, [specificDraft, namedDraft, onSave, t]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.modalSafe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable
              onPress={onCancel}
              hitSlop={10}
              accessibilityLabel={t("common_cancel")}
              style={({ pressed }) => [
                styles.modalHeaderIconBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons name="close" size={18} color={tokens.TEXT} />
            </Pressable>
            <View style={styles.modalHeaderTitleWrap} pointerEvents="none">
              <Text style={styles.modalTitle} numberOfLines={1}>
                {t("stores_modal_edit_surcharges")}
              </Text>
              <Text style={styles.modalHeaderSubtitle} numberOfLines={1}>
                {specificDraft.length + namedDraft.length === 0
                  ? t("stores_modal_header_empty")
                  : t("stores_modal_header_count", {
                      count: String(
                        specificDraft.length + namedDraft.length
                      ),
                    })}
              </Text>
            </View>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              hitSlop={10}
              style={({ pressed }) => [
                styles.modalSavePill,
                saving && styles.modalSavePillSaving,
                pressed && !saving && { opacity: 0.85 },
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#181e38" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={15} color="#181e38" />
                  <Text style={styles.modalSavePillText}>
                    {t("stores_modal_save")}
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Specific Date Surcharges */}
            <View style={styles.editSection}>
              <View style={styles.editSectionHeader}>
                <View style={styles.editSectionTitleWrap}>
                  <View style={styles.editSectionIcon}>
                    <Ionicons
                      name="calendar-outline"
                      size={14}
                      color={tokens.ACCENT}
                    />
                  </View>
                  <Text style={styles.editSectionTitle}>
                    {t("stores_modal_specific_dates")}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.addPillBtn,
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={addSpecific}
                  hitSlop={6}
                >
                  <Ionicons name="add" size={14} color={tokens.ACCENT} />
                  <Text style={styles.addPillLabel}>
                    {t("stores_modal_add")}
                  </Text>
                </Pressable>
              </View>
              {specificDraft.length === 0 ? (
                <View style={styles.editEmptyState}>
                  <Text style={styles.editEmptyText}>
                    {t("stores_modal_no_specific_surcharges_hint")}
                  </Text>
                </View>
              ) : (
                <View style={styles.editCardList}>
                  {specificDraft.map((row) => (
                    <View key={row.id} style={styles.editFieldCard}>
                      <View style={styles.editFieldRow}>
                        <Text style={styles.editFieldLabel}>
                          {t("stores_modal_date_label")}
                        </Text>
                        <Pressable
                          onPress={() => {
                            haptic.light();
                            setDatePickerTarget(`specific:${row.id}`);
                          }}
                          style={({ pressed }) => [
                            styles.datePickerBtn,
                            !row.date && styles.datePickerBtnEmpty,
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <Ionicons
                            name="calendar-outline"
                            size={14}
                            color={
                              row.date ? tokens.TEXT : tokens.TEXT_FAINT
                            }
                          />
                          <Text
                            style={[
                              styles.datePickerBtnText,
                              !row.date && styles.datePickerBtnTextEmpty,
                            ]}
                          >
                            {row.date
                              ? formatSurchargeDate(row.date)
                              : t("stores_modal_select_date")}
                          </Text>
                        </Pressable>
                      </View>
                      <View style={styles.editFieldDivider} />
                      <View style={styles.editFieldRow}>
                        <Text style={styles.editFieldLabel}>
                          {t("stores_modal_percent_label")}
                        </Text>
                        <View style={styles.percentField}>
                          <TextInput
                            value={row.percentInput}
                            onChangeText={(v) =>
                              updateSpecific(row.id, "percentInput", v)
                            }
                            placeholder="0"
                            placeholderTextColor={tokens.TEXT_FAINT}
                            keyboardType="decimal-pad"
                            maxLength={6}
                            style={styles.percentInput}
                          />
                          <Text style={styles.percentSuffix}>%</Text>
                        </View>
                      </View>
                      <Pressable
                        onPress={() => removeSpecific(row.id)}
                        hitSlop={10}
                        style={({ pressed }) => [
                          styles.cardRemoveBtn,
                          pressed && { opacity: 0.5 },
                        ]}
                        accessibilityLabel={t("common_cancel")}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={14}
                          color={tokens.DANGER}
                        />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Named Surcharges */}
            <View style={styles.editSection}>
              <View style={styles.editSectionHeader}>
                <View style={styles.editSectionTitleWrap}>
                  <View style={styles.editSectionIcon}>
                    <Ionicons
                      name="sparkles-outline"
                      size={14}
                      color={tokens.GOLD}
                    />
                  </View>
                  <Text style={styles.editSectionTitle}>
                    {t("stores_modal_holiday_named")}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.addPillBtn,
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={addNamed}
                  hitSlop={6}
                >
                  <Ionicons name="add" size={14} color={tokens.ACCENT} />
                  <Text style={styles.addPillLabel}>
                    {t("stores_modal_add")}
                  </Text>
                </Pressable>
              </View>
              {namedDraft.length === 0 ? (
                <View style={styles.editEmptyState}>
                  <Text style={styles.editEmptyText}>
                    {t("stores_modal_no_named_surcharges_hint")}
                  </Text>
                </View>
              ) : (
                <View style={styles.editCardList}>
                  {namedDraft.map((row) => (
                    <View key={row.id} style={styles.editFieldCard}>
                      <View style={styles.namedHeaderRow}>
                        <TextInput
                          value={row.name}
                          onChangeText={(v) =>
                            updateNamed(row.id, { name: v })
                          }
                          placeholder={t(
                            "stores_modal_holiday_name_placeholder"
                          )}
                          placeholderTextColor={tokens.TEXT_FAINT}
                          style={styles.namedNameInputV2}
                        />
                        <Pressable
                          onPress={() => {
                            haptic.light();
                            updateNamed(row.id, { enabled: !row.enabled });
                          }}
                          hitSlop={6}
                          style={[
                            styles.surchargeToggle,
                            {
                              backgroundColor: row.enabled
                                ? tokens.SUCCESS_DIM
                                : "rgba(255,255,255,0.06)",
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.surchargeDot,
                              {
                                backgroundColor: row.enabled
                                  ? tokens.SUCCESS
                                  : tokens.TEXT_FAINT,
                                alignSelf: row.enabled
                                  ? "flex-end"
                                  : "flex-start",
                              },
                            ]}
                          />
                        </Pressable>
                      </View>
                      <View style={styles.editFieldDivider} />
                      <View style={styles.editFieldRow}>
                        <Text style={styles.editFieldLabel}>
                          {t("stores_modal_date_label")}
                        </Text>
                        <Pressable
                          onPress={() => {
                            haptic.light();
                            setDatePickerTarget(`named:${row.id}`);
                          }}
                          style={({ pressed }) => [
                            styles.datePickerBtn,
                            !row.date && styles.datePickerBtnEmpty,
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <Ionicons
                            name="calendar-outline"
                            size={14}
                            color={
                              row.date ? tokens.TEXT : tokens.TEXT_FAINT
                            }
                          />
                          <Text
                            style={[
                              styles.datePickerBtnText,
                              !row.date && styles.datePickerBtnTextEmpty,
                            ]}
                          >
                            {row.date
                              ? formatSurchargeDate(row.date)
                              : t("stores_modal_select_date")}
                          </Text>
                        </Pressable>
                      </View>
                      <View style={styles.editFieldDivider} />
                      <View style={styles.editFieldRow}>
                        <Text style={styles.editFieldLabel}>
                          {t("stores_modal_percent_label")}
                        </Text>
                        <View style={styles.percentField}>
                          <TextInput
                            value={row.percentInput}
                            onChangeText={(v) =>
                              updateNamed(row.id, { percentInput: v })
                            }
                            placeholder="0"
                            placeholderTextColor={tokens.TEXT_FAINT}
                            keyboardType="decimal-pad"
                            maxLength={6}
                            style={styles.percentInput}
                          />
                          <Text style={styles.percentSuffix}>%</Text>
                        </View>
                      </View>
                      <Pressable
                        onPress={() => removeNamed(row.id)}
                        hitSlop={10}
                        style={({ pressed }) => [
                          styles.cardRemoveBtn,
                          pressed && { opacity: 0.5 },
                        ]}
                        accessibilityLabel={t("common_cancel")}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={14}
                          color={tokens.DANGER}
                        />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <SingleDatePickerModal
        visible={!!datePickerTarget}
        initialDate={(() => {
          if (!datePickerTarget) return null;
          const [kind, id] = datePickerTarget.split(":");
          if (kind === "specific") {
            return specificDraft.find((r) => r.id === id)?.date || null;
          }
          return namedDraft.find((r) => r.id === id)?.date || null;
        })()}
        onClose={() => setDatePickerTarget(null)}
        onApply={(iso) => {
          if (!datePickerTarget) return;
          const [kind, id] = datePickerTarget.split(":");
          if (kind === "specific") {
            updateSpecific(id, "date", iso);
          } else {
            updateNamed(id, { date: iso });
          }
          setDatePickerTarget(null);
        }}
        title={t("stores_modal_select_date")}
        applyLabel={t("stores_modal_save")}
        clearLabel={t("common_cancel")}
      />
    </Modal>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function StoresScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { t } = useI18n();
  const { email, token, loading: authLoading } = useAuth();
  const [shop, setShop] = useState<OfficialShopDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoursEditOpen, setHoursEditOpen] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [surchargeEditOpen, setSurchargeEditOpen] = useState(false);
  const [savingSurcharges, setSavingSurcharges] = useState(false);
  const [previewImage, setPreviewImage] = useState<{
    uri: string;
    label: string;
  } | null>(null);
  const [warehouseIdRevealed, setWarehouseIdRevealed] = useState(false);
  const [warehouseIdCopied, setWarehouseIdCopied] = useState(false);
  const warehouseIdCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (warehouseIdCopiedTimer.current) clearTimeout(warehouseIdCopiedTimer.current);
    },
    []
  );

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const detail = await fetchOfficialShopDetail(undefined, {
          email: email ?? undefined,
          token: token ?? undefined,
        });
        setShop(detail);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("stores_error_body");
        setError(message);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [email, token, t]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!token) return;
    load("initial");
  }, [authLoading, token, load]);

  const onRefresh = useCallback(() => {
    haptic.light();
    load("refresh");
  }, [load]);

  const storefrontUrl = useMemo(
    () => buildStorefrontUrl(shop?.shop_key),
    [shop?.shop_key]
  );

  const namedSurcharges = useMemo(() => {
    if (!shop) return [] as OfficialNamedSurcharge[];
    return Object.values(shop.named_surcharges);
  }, [shop]);

  const specificSurcharges = useMemo(() => {
    if (!shop) return [] as { date: string; percentage: number }[];
    return Object.entries(shop.surcharge)
      .map(([date, percentage]) => ({ date, percentage }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [shop]);

  const handleSaveHours = useCallback(
    async (next: OfficialShopOpenHours) => {
      if (!shop) return;
      setSavingHours(true);
      try {
        await updateOfficialShop(
          { open_hour: next },
          { email: email ?? undefined, token: token ?? undefined }
        );
        setShop((prev) => (prev ? { ...prev, open_hour: next } : prev));
        setHoursEditOpen(false);
        haptic.light();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update hours.";
        Alert.alert(t("stores_alert_update_failed"), message);
      } finally {
        setSavingHours(false);
      }
    },
    [shop, email, token, t]
  );

  const handleSaveSurcharges = useCallback(
    async (
      nextNamed: Record<string, OfficialNamedSurcharge>,
      nextSpecific: Record<string, number>
    ) => {
      if (!shop) return;
      setSavingSurcharges(true);
      try {
        await updateOfficialShop(
          { named_surcharges: nextNamed, surcharge: nextSpecific },
          { email: email ?? undefined, token: token ?? undefined }
        );
        setShop((prev) =>
          prev
            ? { ...prev, named_surcharges: nextNamed, surcharge: nextSpecific }
            : prev
        );
        haptic.light();
        Alert.alert(
          t("stores_surcharges_saved_title"),
          t("stores_surcharges_saved_msg"),
          [
            {
              text: t("stores_surcharges_saved_ok"),
              style: "default",
              onPress: () => setSurchargeEditOpen(false),
            },
          ],
          { cancelable: false }
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update surcharges.";
        Alert.alert(t("stores_alert_update_failed"), message);
      } finally {
        setSavingSurcharges(false);
      }
    },
    [shop, email, token, t]
  );

  // ─── Render states ────────────────────────────────────────────────────────

  if (loading || authLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <OfflineNotice />
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header — eyebrow → title → subtitle, matches ScreenHeader rhythm */}
          <View style={styles.bootHeader}>
            <Skeleton width={70} height={10} radius={3} />
            <Skeleton width={"58%" as any} height={26} radius={6} style={styles.bootHeaderTitle} />
            <Skeleton width={"40%" as any} height={12} radius={3} style={styles.bootHeaderSubtitle} />
          </View>

          {/* Store Detail card — section label + 4 detail rows */}
          <View style={styles.bootSectionLabel}>
            <Skeleton width={100} height={10} radius={3} />
          </View>
          <View style={styles.bootCard}>
            <Skeleton width={"45%" as any} height={13} radius={3} />
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.bootDetailRow}>
                <Skeleton width={`${28 + (i % 2) * 8}%` as any} height={11} radius={3} />
                <Skeleton width={`${34 + (i % 3) * 10}%` as any} height={12} radius={3} />
              </View>
            ))}
          </View>

          {/* Store Logo card — square thumbnail + meta column */}
          <View style={styles.bootSectionLabel}>
            <Skeleton width={80} height={10} radius={3} />
          </View>
          <View style={styles.bootCard}>
            <Skeleton width={"40%" as any} height={13} radius={3} />
            <Skeleton width={"75%" as any} height={11} radius={3} style={{ marginTop: 2 }} />
            <View style={styles.bootLogoRow}>
              <Skeleton width={64} height={64} radius={12} />
              <View style={styles.bootLogoMeta}>
                <Skeleton width={"70%" as any} height={13} radius={3} />
                <Skeleton width={"50%" as any} height={11} radius={3} />
              </View>
            </View>
          </View>

          {/* Store Banner card — wide 3:1 banner block */}
          <View style={styles.bootSectionLabel}>
            <Skeleton width={90} height={10} radius={3} />
          </View>
          <View style={styles.bootCard}>
            <Skeleton width={"55%" as any} height={13} radius={3} />
            <Skeleton width={"80%" as any} height={11} radius={3} style={{ marginTop: 2 }} />
            <View style={styles.bootBannerWrap}>
              <Skeleton width={"100%" as any} height={120} radius={12} />
            </View>
          </View>

          {/* Online Store card — link box + small button */}
          <View style={styles.bootSectionLabel}>
            <Skeleton width={100} height={10} radius={3} />
          </View>
          <View style={styles.bootCard}>
            <Skeleton width={"50%" as any} height={13} radius={3} />
            <Skeleton width={"70%" as any} height={11} radius={3} style={{ marginTop: 2 }} />
            <View style={styles.bootLinkRow}>
              <View style={styles.bootLinkBox}>
                <Skeleton width={70} height={10} radius={3} />
                <Skeleton width={"95%" as any} height={12} radius={3} style={{ marginTop: 6 }} />
              </View>
              <Skeleton width={64} height={32} radius={16} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (error && !shop) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.centerFill}>
          <Ionicons name="alert-circle-outline" size={28} color={tokens.DANGER} />
          <Text style={styles.errorTitle}>{t("stores_error_unable_to_load")}</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => load("initial")}>
            <Text style={styles.retryLabel}>{t("stores_retry_btn")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!shop) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.centerFill}>
          <Text style={styles.errorBody}>{t("stores_no_store_selected")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <OfflineNotice />
      <TopProgressBar visible={refreshing && !loading} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={onRefresh}
            tintColor="transparent"
            colors={["transparent"]}
            progressBackgroundColor="transparent"
          />
        }
      >
        <ScreenHeader
          eyebrow={t("tab_stores").toUpperCase()}
          title={shop.store_name || shop.name || t("stores_store_fallback")}
          subtitle={shop.location || shop.shop_key}
        />

        {/* Store Detail */}
        <SectionLabel
          label={t("stores_detail_section")}
          style={styles.firstSectionLabel}
        />
        <SectionCard title={t("stores_identifiers")}>
          <DetailRow label={t("stores_store_id")} value={shop._id} secret />
          <DetailRow label={t("stores_store_name_identifier")} value={shop.name ?? ""} />
          <DetailRow
            label={t("stores_store_name_public")}
            value={shop.store_name ?? ""}
          />
          <DetailRow label={t("stores_location")} value={shop.location ?? ""} />
          <DetailRow label={t("stores_number")} value={shop.phone ?? ""} />
          <DetailRow
            label={t("stores_description")}
            value={shop.description ?? ""}
          />
        </SectionCard>

        {/* Store Logo */}
        <SectionLabel label={t("stores_logo_section")} />
        <SectionCard
          title={t("stores_brand_icon")}
          hint={t("stores_logo_tap_hint")}
        >
          <View style={styles.logoRow}>
            <Pressable
              onPress={() => {
                if (!shop.logo) return;
                haptic.light();
                setPreviewImage({ uri: shop.logo, label: t("stores_logo_preview_label") });
              }}
              disabled={!shop.logo}
              style={({ pressed }) => [
                styles.logoImg,
                !shop.logo && styles.imgPlaceholder,
                pressed && shop.logo ? { opacity: 0.85 } : null,
              ]}
            >
              {shop.logo ? (
                <Image
                  source={{ uri: shop.logo }}
                  style={styles.logoImgInner}
                />
              ) : (
                <Ionicons name="image-outline" size={22} color={tokens.TEXT_FAINT} />
              )}
            </Pressable>
            {shop.logo ? (
              <View style={styles.logoMeta}>
                <Text style={styles.metaTitle}>
                  {shop.store_name || shop.name || t("stores_logo_fallback")}
                </Text>
                <View style={styles.tapHintRow}>
                  <Ionicons name="expand-outline" size={12} color={tokens.TEXT_DIM} />
                  <Text style={styles.tapHint}>{t("stores_tap_to_preview")}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </SectionCard>

        {/* Store Banner */}
        <SectionLabel label={t("stores_banner_section")} />
        <SectionCard
          title={t("stores_storefront_banner")}
          hint={t("stores_banner_hint")}
        >
          <Pressable
            onPress={() => {
              if (!shop.banner) return;
              haptic.light();
              setPreviewImage({ uri: shop.banner, label: t("stores_banner_preview_label") });
            }}
            disabled={!shop.banner}
            style={({ pressed }) => [
              styles.bannerImg,
              !shop.banner && styles.imgPlaceholder,
              pressed && shop.banner ? { opacity: 0.9 } : null,
            ]}
          >
            {shop.banner ? (
              <Image
                source={{ uri: shop.banner }}
                style={styles.bannerImgInner}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="image-outline" size={28} color={tokens.TEXT_FAINT} />
            )}
            {shop.banner ? (
              <View style={styles.bannerExpandBadge}>
                <Ionicons name="expand-outline" size={13} color={tokens.TEXT} />
              </View>
            ) : null}
          </Pressable>
        </SectionCard>

        {/* Online Store */}
        <SectionLabel label={t("stores_online_store_section")} />
        <SectionCard
          title={t("stores_storefront_link")}
          hint={t("stores_storefront_link_hint")}
        >
          <View style={styles.linkRow}>
            <View style={styles.linkBox}>
              <Text style={styles.linkLabel}>{t("stores_store_link_label")}</Text>
              <Text style={styles.linkValue} numberOfLines={2}>
                {storefrontUrl ?? "N/A"}
              </Text>
            </View>
            {storefrontUrl ? (
              <Pressable
                style={({ pressed }) => [
                  styles.visitBtn,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => {
                  haptic.light();
                  Linking.openURL(storefrontUrl).catch(() => undefined);
                }}
              >
                <Ionicons name="open-outline" size={14} color={tokens.ACCENT} />
                <Text style={styles.visitBtnLabel}>{t("stores_visit_btn")}</Text>
              </Pressable>
            ) : null}
          </View>
        </SectionCard>

        {/* Bind Warehouse Stock */}
        <SectionLabel label={t("stores_warehouse_section")} />
        <SectionCard
          title={t("stores_inventory_source")}
          hint={t("stores_warehouse_hint")}
        >
          <View style={styles.warehouseRow}>
            <View style={styles.warehouseIcon}>
              <Ionicons name="cube-outline" size={18} color={tokens.GOLD} />
            </View>
            <View style={styles.warehouseBody}>
              <Text style={styles.warehouseTitle}>{t("stores_warehouse_title")}</Text>
              <Text
                style={[
                  styles.warehouseStatus,
                  { color: shop.warehouse_id ? tokens.SUCCESS : tokens.TEXT_DIM },
                ]}
              >
                {shop.warehouse_id ? t("stores_warehouse_connected") : t("stores_warehouse_not_connected")}
              </Text>
            </View>
          </View>
          {shop.warehouse_id ? (
            <Pressable
              onLongPress={async () => {
                const ok = await copyToClipboard(shop.warehouse_id || "");
                if (ok) {
                  haptic.success();
                  setWarehouseIdCopied(true);
                  if (warehouseIdCopiedTimer.current)
                    clearTimeout(warehouseIdCopiedTimer.current);
                  warehouseIdCopiedTimer.current = setTimeout(
                    () => setWarehouseIdCopied(false),
                    1500
                  );
                } else {
                  haptic.error();
                }
              }}
              delayLongPress={350}
              style={styles.warehouseIdBox}
              android_ripple={{ color: tokens.CARD_HOVER }}
            >
              <Text style={styles.warehouseIdLabel}>{t("stores_warehouse_id_label")}</Text>
              <View style={styles.warehouseIdRow}>
                <Text
                  style={[
                    styles.warehouseIdValue,
                    !warehouseIdRevealed && !warehouseIdCopied && styles.detailValueMasked,
                    warehouseIdCopied && { color: tokens.SUCCESS },
                  ]}
                  numberOfLines={1}
                >
                  {warehouseIdCopied
                    ? t("sales_export_copied")
                    : warehouseIdRevealed
                    ? shop.warehouse_id
                    : maskId(shop.warehouse_id)}
                </Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => setWarehouseIdRevealed((v) => !v)}
                  style={({ pressed }) => [
                    styles.revealBtn,
                    pressed && { opacity: 0.5 },
                  ]}
                >
                  <Ionicons
                    name={warehouseIdRevealed ? "eye-off-outline" : "eye-outline"}
                    size={14}
                    color={tokens.TEXT_DIM}
                  />
                </Pressable>
              </View>
            </Pressable>
          ) : null}
        </SectionCard>

        {/* Operational Hours */}
        <SectionLabel label={t("stores_hours_section")} />
        <SectionCard
          title={t("stores_weekly_schedule")}
          hint={t("stores_hours_hint")}
          action={
            <Pressable
              style={({ pressed }) => [
                styles.headerEditBtn,
                pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
              ]}
              onPress={() => {
                haptic.light();
                setHoursEditOpen(true);
              }}
              hitSlop={8}
            >
              <View style={styles.headerEditBtnIconWrap}>
                <Ionicons name="pencil" size={10} color={tokens.ACCENT} />
              </View>
              <Text style={styles.headerEditBtnLabel}>{t("stores_edit_btn")}</Text>
              <Ionicons name="chevron-forward" size={11} color={tokens.ACCENT} />
            </Pressable>
          }
        >
          <View style={styles.hoursList}>
            {DAYS.map((day) => (
              <HoursRow
                key={day}
                day={day}
                label={t(DAY_LABEL_KEYS[day])}
                slots={shop.open_hour[day]}
              />
            ))}
          </View>
          <View style={styles.preorderNote}>
            <Ionicons name="calendar-outline" size={13} color={tokens.TEXT_DIM} />
            <Text style={styles.preorderNoteText}>
              <Text style={styles.preorderNoteLabel}>{t("stores_preorder_label")}</Text>
              {(shop.max_perorderday ?? 0) > 0
                ? `Up to ${shop.max_perorderday} day(s) ahead are allowed.`
                : "Only same-day orders are currently allowed."}
            </Text>
          </View>
        </SectionCard>

        {/* Surcharge Management */}
        <SectionLabel label={t("stores_surcharge_section")} />
        <SectionCard
          title={t("stores_surcharges")}
          hint={t("stores_surcharge_hint")}
          action={
            <Pressable
              style={({ pressed }) => [
                styles.headerEditBtn,
                pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
              ]}
              onPress={() => {
                haptic.light();
                setSurchargeEditOpen(true);
              }}
              hitSlop={8}
            >
              <View style={styles.headerEditBtnIconWrap}>
                <Ionicons name="pencil" size={10} color={tokens.ACCENT} />
              </View>
              <Text style={styles.headerEditBtnLabel}>{t("stores_edit_btn")}</Text>
              <Ionicons name="chevron-forward" size={11} color={tokens.ACCENT} />
            </Pressable>
          }
        >
          {/* Specific Date Surcharges */}
          <Text style={styles.subSectionLabel}>{t("stores_surcharge_specific_dates")}</Text>
          {specificSurcharges.length === 0 ? (
            <Text style={styles.emptyText}>{t("stores_no_specific_surcharges")}</Text>
          ) : (
            specificSurcharges.map((item) => (
              <View key={item.date} style={styles.specificRow}>
                <View style={styles.specificDateRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={13}
                    color={tokens.TEXT_DIM}
                  />
                  <Text style={styles.specificDate}>
                    {formatSurchargeDate(item.date)}
                  </Text>
                </View>
                <View
                  style={[styles.surchargePctPill, { backgroundColor: tokens.ACCENT_DIM }]}
                >
                  <Text style={[styles.surchargePctText, { color: tokens.ACCENT }]}>
                    {formatPercent(item.percentage)}
                  </Text>
                </View>
              </View>
            ))
          )}

          {/* Named Surcharges */}
          <Text style={[styles.subSectionLabel, { marginTop: 14 }]}>
            {t("stores_surcharge_holiday_named")}
          </Text>
          {namedSurcharges.length === 0 ? (
            <Text style={styles.emptyText}>{t("stores_no_named_surcharges")}</Text>
          ) : (
            namedSurcharges.map((item) => (
              <SurchargeRow key={item.name} item={item} />
            ))
          )}
        </SectionCard>
      </ScrollView>

      <EditHoursModal
        visible={hoursEditOpen}
        initial={shop.open_hour}
        saving={savingHours}
        onCancel={() => setHoursEditOpen(false)}
        onSave={handleSaveHours}
      />

      <EditSurchargesModal
        visible={surchargeEditOpen}
        initialNamed={shop.named_surcharges}
        initialSpecific={shop.surcharge}
        saving={savingSurcharges}
        onCancel={() => setSurchargeEditOpen(false)}
        onSave={handleSaveSurcharges}
      />

      <Modal
        visible={previewImage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <Pressable
          style={styles.previewBackdrop}
          onPress={() => setPreviewImage(null)}
        >
          <SafeAreaView
            style={styles.previewSafe}
            edges={["top", "bottom"]}
            pointerEvents="box-none"
          >
            <View style={styles.previewHeader} pointerEvents="box-none">
              <Text style={styles.previewLabel}>{previewImage?.label}</Text>
              <Pressable
                onPress={() => setPreviewImage(null)}
                hitSlop={12}
                style={styles.previewClose}
              >
                <Ionicons name="close" size={20} color={tokens.TEXT} />
              </Pressable>
            </View>
            {previewImage ? (
              <Image
                source={{ uri: previewImage.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : null}
          </SafeAreaView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const makeStyles = (t: ThemeTokens) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: t.BG },
  container: { flex: 1 },
  content: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 8,
    paddingBottom: 140,
    gap: 12,
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: SCREEN_PADDING,
  },
  errorTitle: { color: t.TEXT, fontSize: 16, fontWeight: "700" },
  errorBody: {
    color: t.TEXT_DIM,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: t.GOLD_DIM,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.GOLD,
  },
  retryLabel: { color: t.GOLD, fontWeight: "700", fontSize: 13 },

  firstSectionLabel: {
    marginTop: 2,
  },

  // ─── Initial stores loading skeleton ─────────────────────────────────
  // Mirrors the real ScreenHeader + section-card stack so the first paint
  // previews the page shape (header, detail rows, logo, banner, link)
  // instead of a single spinner.
  bootHeader: {
    gap: 6,
    marginTop: 2,
    marginBottom: 4,
  },
  bootHeaderTitle: { marginTop: 4 },
  bootHeaderSubtitle: { marginTop: 4 },
  bootSectionLabel: {
    marginTop: 14,
    marginBottom: 4,
  },
  bootCard: {
    backgroundColor: t.CARD,
    borderColor: t.CARD_BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  bootDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.CARD_BORDER,
    gap: 12,
  },
  bootLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 4,
    marginTop: 4,
  },
  bootLogoMeta: {
    flex: 1,
    gap: 8,
  },
  bootBannerWrap: {
    marginTop: 4,
  },
  bootLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  bootLinkBox: {
    flex: 1,
  },

  card: {
    backgroundColor: t.CARD,
    borderColor: t.CARD_BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeaderAction: { marginLeft: 8 },
  cardTitle: { color: t.TEXT, fontSize: 14, fontWeight: "700" },
  cardHint: {
    color: t.TEXT_DIM,
    fontSize: 12,
    lineHeight: 17,
  },
  cardBody: { gap: 4 },

  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.CARD_BORDER,
    gap: 12,
  },
  detailLabel: {
    color: t.TEXT_DIM,
    fontSize: 12,
    fontWeight: "500",
    flexShrink: 0,
  },
  detailValue: {
    color: t.TEXT,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
  },
  detailValueMasked: {
    fontFamily: "Menlo",
    letterSpacing: 1,
    color: t.TEXT_DIM,
  },
  detailValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  revealBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.CARD_HOVER,
  },

  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 4,
  },
  logoImg: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    overflow: "hidden",
  },
  logoImgInner: { width: "100%", height: "100%" },
  imgPlaceholder: { alignItems: "center", justifyContent: "center" },
  logoMeta: { flex: 1, gap: 4 },
  metaTitle: { color: t.TEXT, fontSize: 13, fontWeight: "700" },
  metaItem: { color: t.TEXT_DIM, fontSize: 11, lineHeight: 16 },
  tapHintRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tapHint: { color: t.TEXT_DIM, fontSize: 11, fontWeight: "500" },

  bannerHeaderRow: { flexDirection: "row", justifyContent: "flex-end" },
  recoPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  recoPillText: {
    color: t.TEXT_DIM,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  bannerImg: {
    width: "100%",
    aspectRatio: 3,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    overflow: "hidden",
  },
  bannerImgInner: { width: "100%", height: "100%" },
  bannerExpandBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Image preview modal
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  previewSafe: { flex: 1 },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 8,
    paddingBottom: 12,
  },
  previewLabel: {
    color: t.TEXT,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  previewClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    flex: 1,
    width: "100%",
    height: "100%",
  },

  linkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  linkBox: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    gap: 2,
  },
  linkLabel: {
    color: t.TEXT_FAINT,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  linkValue: { color: t.TEXT, fontSize: 12, fontWeight: "500" },
  visitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: t.ACCENT_DIM,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.ACCENT,
  },
  visitBtnLabel: { color: t.ACCENT, fontSize: 12, fontWeight: "700" },

  warehouseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  warehouseIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: t.GOLD_DIM,
    alignItems: "center",
    justifyContent: "center",
  },
  warehouseBody: { flex: 1, gap: 2 },
  warehouseTitle: { color: t.TEXT, fontSize: 13, fontWeight: "700" },
  warehouseStatus: { fontSize: 11, fontWeight: "600" },
  warehouseIdBox: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: t.CARD_HOVER,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  warehouseIdRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
  },
  warehouseIdLabel: {
    color: t.TEXT_FAINT,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  warehouseIdValue: { color: t.TEXT, fontSize: 12, fontWeight: "500" },

  hoursList: { marginTop: 2 },
  hoursRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 38,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.CARD_BORDER,
    gap: 10,
  },
  hoursDayLabel: {
    color: t.TEXT,
    fontSize: 13,
    fontWeight: "500",
    width: 88,
  },
  hoursDayLabelDim: { color: t.TEXT_DIM, fontWeight: "400" },
  hoursSlots: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  slotItem: { flexDirection: "row", alignItems: "center" },
  slotText: {
    color: t.TEXT,
    fontSize: 13,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  slotDash: { color: t.TEXT_FAINT, fontWeight: "400" },
  slotDivider: {
    width: 1,
    height: 10,
    marginHorizontal: 10,
    backgroundColor: t.CARD_BORDER,
  },
  closedLabel: {
    color: t.TEXT_FAINT,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.2,
  },

  preorderNote: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  preorderNoteText: {
    flex: 1,
    color: t.TEXT_DIM,
    fontSize: 11,
    lineHeight: 16,
  },
  preorderNoteLabel: {
    color: t.TEXT,
    fontWeight: "600",
  },

  surchargeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.CARD_BORDER,
    gap: 12,
  },
  surchargeLeft: { flex: 1, gap: 4 },
  surchargeTagRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  surchargeName: { color: t.TEXT, fontSize: 13, fontWeight: "700" },
  surchargeDateRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  surchargeDate: { color: t.TEXT_FAINT, fontSize: 11, fontWeight: "500" },
  surchargeRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  surchargeToggle: {
    width: 34,
    height: 18,
    borderRadius: 999,
    padding: 2,
    justifyContent: "center",
  },
  surchargeDot: { width: 14, height: 14, borderRadius: 7 },
  surchargePctPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  surchargePctText: { fontSize: 11, fontWeight: "700" },

  emptyText: {
    color: t.TEXT_DIM,
    fontSize: 12,
    fontStyle: "italic",
    paddingVertical: 6,
  },

  subSectionLabel: {
    color: t.TEXT,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginTop: 4,
    marginBottom: 2,
  },
  specificRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.CARD_BORDER,
    gap: 10,
  },
  specificDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  specificDate: { color: t.TEXT, fontSize: 13, fontWeight: "600" },

  // Edit surcharge modal extras
  editGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  editGroupTitle: {
    color: t.TEXT,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  percentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  percentSuffix: {
    color: t.TEXT_FAINT,
    fontSize: 13,
    fontWeight: "500",
    marginLeft: 4,
  },

  // Header inline edit button (Operational Hours / Surcharges)
  headerEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(64,100,220,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(64,100,220,0.32)",
  },
  headerEditBtnIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(64,100,220,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerEditBtnLabel: {
    color: t.ACCENT,
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },

  // Edit hours modal
  modalSafe: { flex: 1, backgroundColor: t.BG },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SCREEN_PADDING,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.CARD_BORDER,
  },
  modalTitle: { color: t.TEXT, fontSize: 16, fontWeight: "700" },
  modalCancel: { color: t.TEXT_DIM, fontSize: 14, fontWeight: "600" },
  modalSave: { color: t.GOLD, fontSize: 14, fontWeight: "700" },
  // Redesigned surcharge modal header (round close + centered title + gold pill).
  modalHeaderIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
  modalHeaderTitleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 76, // reserve space for side controls
  },
  modalHeaderSubtitle: {
    color: t.TEXT_FAINT,
    fontSize: 10.5,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 2,
  },
  modalSavePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: t.GOLD,
    minWidth: 76,
    justifyContent: "center",
  },
  modalSavePillSaving: { opacity: 0.7 },
  modalSavePillText: {
    color: "#181e38",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  modalContent: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 8,
    paddingBottom: 40,
  },
  editDayGroup: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.CARD_BORDER,
    gap: 10,
  },
  editDayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editDayLabel: {
    color: t.TEXT,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  addSlotBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  addSlotLabel: { color: t.ACCENT, fontSize: 12, fontWeight: "600" },
  editClosedHint: {
    color: t.TEXT_FAINT,
    fontSize: 12,
  },
  editSlotList: { gap: 8 },
  editSlotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  editArrow: {
    color: t.TEXT_FAINT,
    fontSize: 16,
    fontWeight: "400",
  },
  editInput: {
    flex: 1,
    color: t.TEXT,
    fontSize: 15,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  dateInput: { flex: 2 },
  percentField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  percentInput: {
    flex: 1,
    color: t.TEXT,
    fontSize: 15,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    paddingVertical: 9,
  },
  namedList: { gap: 14 },
  namedRow: { gap: 8 },
  namedTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  namedNameInput: {
    flex: 1,
    textAlign: "left",
    fontWeight: "600",
  },
  removeSlotBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  // ─── Surcharge edit modal v2 ──────────────────────────────────────────
  editSection: {
    marginTop: 18,
    gap: 12,
  },
  editSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editSectionTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  editSectionIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  editSectionTitle: {
    color: t.TEXT,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  addPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(64,100,220,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(64,100,220,0.32)",
  },
  addPillLabel: {
    color: t.ACCENT,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  editEmptyState: {
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    borderStyle: "dashed",
    alignItems: "center",
  },
  editEmptyText: {
    color: t.TEXT_FAINT,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
  },
  editCardList: { gap: 12 },
  editFieldCard: {
    position: "relative",
    backgroundColor: "rgba(255,255,255,0.035)",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 4,
    paddingRight: 38,
  },
  editFieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    gap: 12,
  },
  editFieldLabel: {
    color: t.TEXT_DIM,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  editFieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.CARD_BORDER,
    opacity: 0.6,
  },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    minWidth: 140,
    justifyContent: "flex-end",
  },
  datePickerBtnEmpty: {
    backgroundColor: "rgba(255,255,255,0.025)",
  },
  datePickerBtnText: {
    color: t.TEXT,
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  datePickerBtnTextEmpty: {
    color: t.TEXT_FAINT,
    fontWeight: "500",
  },
  namedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  namedNameInputV2: {
    flex: 1,
    color: t.TEXT,
    fontSize: 15,
    fontWeight: "700",
    paddingVertical: 4,
  },
  cardRemoveBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.CARD_BORDER,
  },
});
