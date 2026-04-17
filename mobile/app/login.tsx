import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Dimensions,
  GestureResponderEvent,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import { Accelerometer } from "expo-sensors";
import { useAuth } from "../src/context/AuthContext";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// --- Floating particles config ---
const PARTICLE_COUNT = 12;
const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  id: i,
  x: Math.random() * SCREEN_W,
  y: Math.random() * SCREEN_H,
  size: 3 + Math.random() * 4,
  duration: 6000 + Math.random() * 8000,
  delay: Math.random() * 4000,
  opacity: 0.06 + Math.random() * 0.1,
}));

// --- i18n ---
type Lang = "en" | "zh" | "id";
const LANG_ORDER: Lang[] = ["en", "zh", "id"];
const LANG_LABELS: Record<Lang, string> = { en: "EN", zh: "中文", id: "ID" };
const i18n: Record<Lang, Record<string, string>> = {
  en: {
    dashboard: "DASHBOARD",
    welcomeBack: "WELCOME BACK.",
    emailLabel: "Email Address",
    emailLabelUp: "EMAIL ADDRESS",
    passwordLabel: "Password",
    passwordLabelUp: "PASSWORD",
    forgot: "Forgot?",
    signIn: "SIGN IN",
    authenticating: "Authenticating",
    noAccount: "Don't have an account? ",
    requestAccess: "Request Access",
    fillAll: "Please fill in all fields.",
    invalidEmail: "Please enter a valid email address.",
    signInFailed: "Sign in failed.",
    biometricPrompt: "Sign in to VEND88",
    biometricFallback: "Use password",
    biometricCancel: "Cancel",
    biometricUnavailable: "Biometric auth not available on this device.",
    biometricNotEnrolled: "No biometrics enrolled. Set up Face ID or fingerprint first.",
    pos: "Point of Sale",
    kds: "Kitchen Display System",
    vending: "Vending Machine",
  },
  zh: {
    dashboard: "控制面板",
    welcomeBack: "欢迎回来",
    emailLabel: "电子邮箱",
    emailLabelUp: "电子邮箱",
    passwordLabel: "密码",
    passwordLabelUp: "密码",
    forgot: "忘记?",
    signIn: "登录",
    authenticating: "验证中",
    noAccount: "还没有账号？",
    requestAccess: "申请访问",
    fillAll: "请填写所有字段。",
    invalidEmail: "请输入有效的电子邮箱地址。",
    signInFailed: "登录失败。",
    biometricPrompt: "登录 VEND88",
    biometricFallback: "使用密码",
    biometricCancel: "取消",
    biometricUnavailable: "此设备不支持生物识别。",
    biometricNotEnrolled: "未注册生物识别。请先设置面容ID或指纹。",
    pos: "收银系统",
    kds: "厨房显示",
    vending: "自动售货机",
  },
  id: {
    dashboard: "DASHBOARD",
    welcomeBack: "SELAMAT DATANG.",
    emailLabel: "Alamat Email",
    emailLabelUp: "ALAMAT EMAIL",
    passwordLabel: "Kata Sandi",
    passwordLabelUp: "KATA SANDI",
    forgot: "Lupa?",
    signIn: "MASUK",
    authenticating: "Memverifikasi",
    noAccount: "Belum punya akun? ",
    requestAccess: "Minta Akses",
    fillAll: "Harap isi semua kolom.",
    invalidEmail: "Masukkan alamat email yang valid.",
    signInFailed: "Gagal masuk.",
    biometricPrompt: "Masuk ke VEND88",
    biometricFallback: "Gunakan kata sandi",
    biometricCancel: "Batal",
    biometricUnavailable: "Autentikasi biometrik tidak tersedia di perangkat ini.",
    biometricNotEnrolled: "Biometrik belum terdaftar. Atur Face ID atau sidik jari terlebih dahulu.",
    pos: "Point of Sale",
    kds: "Kitchen Display System",
    vending: "Vending Machine",
  },
};

const MODULES: { icon: React.ReactNode; labelKey: string }[] = [
  { icon: <MaterialCommunityIcons name="cash-register" size={20} color="#d4af37" />, labelKey: "pos" },
  {
    icon: (
      <View style={{ width: 24, height: 22, alignItems: "center", justifyContent: "center" }}>
        <MaterialCommunityIcons name="monitor" size={22} color="#d4af37" style={{ position: "absolute" }} />
        <Ionicons name="restaurant-outline" size={10} color="#d4af37" style={{ position: "absolute", top: 4 }} />
      </View>
    ),
    labelKey: "kds",
  },
  { icon: <MaterialCommunityIcons name="fridge-outline" size={20} color="#d4af37" />, labelKey: "vending" },
];

// --- Ripple on touch ---
type Ripple = { id: number; x: number; y: number; scale: Animated.Value; opacity: Animated.Value };

function RippleLayer({ ripples }: { ripples: Ripple[] }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {ripples.map((r) => (
        <Animated.View
          key={r.id}
          style={{
            position: "absolute",
            left: r.x - 75,
            top: r.y - 75,
            width: 150,
            height: 150,
            borderRadius: 75,
            borderWidth: 1.5,
            borderColor: "rgba(212,175,55,0.3)",
            opacity: r.opacity,
            transform: [{ scale: r.scale }],
          }}
        />
      ))}
    </View>
  );
}

// --- Drifting mesh grid ---
const GRID_SIZE = 40;
const GRID_COLS = Math.ceil(SCREEN_W / GRID_SIZE) + 2;
const GRID_ROWS = Math.ceil(SCREEN_H / GRID_SIZE) + 2;

function DriftingGrid() {
  const driftX = useRef(new Animated.Value(0)).current;
  const driftY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(driftX, { toValue: GRID_SIZE, duration: 12000, useNativeDriver: true }),
    ).start();
    Animated.loop(
      Animated.timing(driftY, { toValue: GRID_SIZE, duration: 18000, useNativeDriver: true }),
    ).start();
  }, [driftX, driftY]);

  const lines: React.ReactNode[] = [];
  // Vertical lines
  for (let c = 0; c < GRID_COLS; c++) {
    lines.push(
      <View
        key={`v${c}`}
        style={{ position: "absolute", left: c * GRID_SIZE, top: -GRID_SIZE, width: StyleSheet.hairlineWidth, height: SCREEN_H + GRID_SIZE * 2, backgroundColor: "rgba(255,255,255,0.025)" }}
      />,
    );
  }
  // Horizontal lines
  for (let r = 0; r < GRID_ROWS; r++) {
    lines.push(
      <View
        key={`h${r}`}
        style={{ position: "absolute", left: -GRID_SIZE, top: r * GRID_SIZE, width: SCREEN_W + GRID_SIZE * 2, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.025)" }}
      />,
    );
  }

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { transform: [{ translateX: driftX }, { translateY: driftY }] }]}
      pointerEvents="none"
    >
      {lines}
    </Animated.View>
  );
}

// --- Floating particle component ---
function FloatingParticle({ x, y, size, duration, delay, opacity }: (typeof particles)[number]) {
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const driftY = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, { toValue: -40 - Math.random() * 30, duration, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration, useNativeDriver: true }),
      ]),
    );
    const driftX = Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, { toValue: 15 + Math.random() * 20, duration: duration * 1.3, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: -(15 + Math.random() * 20), duration: duration * 1.3, useNativeDriver: true }),
      ]),
    );
    const fade = Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 1, duration: duration * 0.5, delay, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: duration * 0.5, useNativeDriver: true }),
      ]),
    );
    driftY.start();
    driftX.start();
    fade.start();
    return () => { driftY.stop(); driftX.stop(); fade.stop(); };
  }, [translateY, translateX, fadeAnim, duration, delay]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#d4af37",
        opacity: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0, opacity] }),
        transform: [{ translateY }, { translateX }],
      }}
    />
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { token, signIn } = useAuth();
  const passwordRef = useRef<TextInput>(null);

  const [lang, setLang] = useState<Lang>("en");
  const t = i18n[lang];

  const cycleLang = useCallback(() => {
    setLang((prev) => {
      const idx = LANG_ORDER.indexOf(prev);
      return LANG_ORDER[(idx + 1) % LANG_ORDER.length];
    });
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [skipAutoRedirect, setSkipAutoRedirect] = useState(false);

  // Ripple on touch
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleId = useRef(0);

  const spawnRipple = useCallback((e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const id = rippleId.current++;
    const scale = new Animated.Value(0.3);
    const opacity = new Animated.Value(0.6);
    const ripple: Ripple = { id, x: locationX, y: locationY, scale, opacity };
    setRipples((prev) => [...prev, ripple]);
    Animated.parallel([
      Animated.timing(scale, { toValue: 2.5, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    });
  }, []);

  // Parallax tilt
  const tiltX = useRef(new Animated.Value(0)).current;
  const tiltY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Accelerometer.setUpdateInterval(80);
    const sub = Accelerometer.addListener(({ x, y }) => {
      Animated.spring(tiltX, { toValue: x * 25, useNativeDriver: true, friction: 8 }).start();
      Animated.spring(tiltY, { toValue: y * 25, useNativeDriver: true, friction: 8 }).start();
    });
    return () => sub.remove();
  }, [tiltX, tiltY]);

  // Module carousel
  const [activeModule, setActiveModule] = useState(0);
  const moduleFade = useRef(new Animated.Value(1)).current;
  const moduleScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      // fade out + scale down
      Animated.parallel([
        Animated.timing(moduleFade, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(moduleScale, { toValue: 0.85, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        setActiveModule((prev) => (prev + 1) % MODULES.length);
        // fade in + scale up
        Animated.parallel([
          Animated.timing(moduleFade, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(moduleScale, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]).start();
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [moduleFade, moduleScale]);

  // Animated label positions
  const emailAnim = useRef(new Animated.Value(0)).current;
  const passwordAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  // Sync floating labels with autofill
  useEffect(() => {
    if (email.length > 0 && !emailFocused) floatLabel(emailAnim, true);
  }, [email, emailFocused, emailAnim]);

  useEffect(() => {
    if (password.length > 0 && !passwordFocused) floatLabel(passwordAnim, true);
  }, [password, passwordFocused, passwordAnim]);

  const floatLabel = (anim: Animated.Value, active: boolean) => {
    Animated.timing(anim, {
      toValue: active ? 1 : 0,
      duration: 170,
      useNativeDriver: false,
    }).start();
  };

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 7, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -7, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  };

  const labelInterp = (anim: Animated.Value) => ({
    top: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 6] }),
    fontSize: anim.interpolate({ inputRange: [0, 1], outputRange: [15, 9] }),
    color: anim.interpolate({
      inputRange: [0, 1],
      outputRange: ["rgba(255,255,255,0.4)", "#d4af37"],
    }),
    letterSpacing: anim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1.2] }),
  });

  useEffect(() => {
    if (token && !skipAutoRedirect) {
      router.replace("/(tabs)");
    }
  }, [token, skipAutoRedirect, router]);

  const triggerError = (msg: string) => {
    setError(msg);
    triggerShake();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const handleSignIn = async () => {
    setError("");

    if (!email || !password) {
      triggerError(t.fillAll);
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      triggerError(t.invalidEmail);
      return;
    }

    setSkipAutoRedirect(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);

    if (!result.ok) {
      setSkipAutoRedirect(false);
      triggerError(result.message ?? t.signInFailed);
      return;
    }

    Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.replace("/(tabs)");
    });
  };

  const handleBiometric = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) {
      triggerError(t.biometricUnavailable);
      return;
    }
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      triggerError(t.biometricNotEnrolled);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t.biometricPrompt,
      fallbackLabel: t.biometricFallback,
      cancelLabel: t.biometricCancel,
    });
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }).start(() => {
        router.replace("/(tabs)");
      });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} onStartShouldSetResponder={() => true} onResponderRelease={spawnRipple}>
      {/* Language selector */}
      <Pressable style={styles.langSelector} onPress={cycleLang} hitSlop={12}>
        <Ionicons name="globe-outline" size={15} color="rgba(255,255,255,0.5)" />
        <Text style={styles.langText}>{LANG_LABELS[lang]}</Text>
      </Pressable>

      {/* Drifting mesh grid */}
      <DriftingGrid />

      {/* Glow orbs with parallax */}
      <Animated.View
        style={[
          styles.glowTop,
          { transform: [{ translateX: Animated.multiply(tiltX, -1.5) }, { translateY: Animated.multiply(tiltY, -1.5) }] },
        ]}
      />
      <Animated.View
        style={[
          styles.glowBottom,
          { transform: [{ translateX: Animated.multiply(tiltX, -1.2) }, { translateY: Animated.multiply(tiltY, -1.2) }] },
        ]}
      />

      {/* Floating particles with parallax */}
      <Animated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          transform: [{ translateX: Animated.multiply(tiltX, -0.8) }, { translateY: Animated.multiply(tiltY, -0.8) }],
        }}
        pointerEvents="none"
      >
        {particles.map((p) => (
          <FloatingParticle key={p.id} {...p} />
        ))}
      </Animated.View>

      {/* Ripple on touch */}
      <RippleLayer ripples={ripples} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.select({ ios: "padding", android: undefined })}
        >
          <Animated.View
            style={[
              styles.contentWrap,
              {
                opacity: screenOpacity,
              },
            ]}
          >
            <View style={styles.brandBlock}>
              <View style={styles.brandRow}>
                <Text style={styles.brandVend}>VEND</Text>
                <Text style={styles.brand88}>88</Text>
              </View>
              <Text style={styles.brandSubtitle}>{t.dashboard}</Text>
            </View>

            <Animated.View
              style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}
            >
              <Text style={styles.welcome}>{t.welcomeBack}</Text>

              {/* Email */}
              <View style={styles.inputGroup}>
                <TextInput
                  style={[
                    styles.input,
                    emailFocused && styles.inputFocused,
                    !!error && styles.inputError,
                  ]}
                  value={email}
                  onChangeText={(v) => { setEmail(v); setError(""); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  onFocus={() => {
                    setEmailFocused(true);
                    floatLabel(emailAnim, true);
                  }}
                  onBlur={() => {
                    setEmailFocused(false);
                    floatLabel(emailAnim, email.length > 0);
                  }}
                />
                <Animated.Text style={[styles.floatingLabel, labelInterp(emailAnim)]}>
                  {emailFocused || email.length > 0 ? t.emailLabelUp : t.emailLabel}
                </Animated.Text>
              </View>

              {/* Password */}
              <View style={styles.inputGroup}>
                <TextInput
                  ref={passwordRef}
                  style={[
                    styles.input,
                    styles.passwordInput,
                    passwordFocused && styles.inputFocused,
                    !!error && styles.inputError,
                  ]}
                  value={password}
                  onChangeText={(v) => { setPassword(v); setError(""); }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={handleSignIn}
                  onFocus={() => {
                    setPasswordFocused(true);
                    floatLabel(passwordAnim, true);
                  }}
                  onBlur={() => {
                    setPasswordFocused(false);
                    floatLabel(passwordAnim, password.length > 0);
                  }}
                />
                <Animated.Text style={[styles.floatingLabel, labelInterp(passwordAnim)]}>
                  {passwordFocused || password.length > 0 ? t.passwordLabelUp : t.passwordLabel}
                </Animated.Text>

                <View style={styles.passwordActions}>
                  <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={10}>
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color={passwordFocused ? "rgba(212,175,55,0.8)" : "#9ca3af"}
                    />
                  </Pressable>
                  <View style={styles.passwordDivider} />
                  <Pressable hitSlop={10}>
                    <Text style={styles.forgotText}>{t.forgot}</Text>
                  </Pressable>
                </View>
              </View>

              {error ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle-outline" size={13} color="#fca5a5" />
                  <Text style={styles.error}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.actionsRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    pressed && styles.buttonPressed,
                    loading && styles.buttonDisabled,
                  ]}
                  onPress={handleSignIn}
                  disabled={loading}
                >
                  {loading ? (
                    <View style={styles.buttonLoadingRow}>
                      <ActivityIndicator color="#181e38" size="small" />
                      <Text style={styles.buttonText}>{t.authenticating}</Text>
                    </View>
                  ) : (
                    <Text style={styles.buttonText}>{t.signIn}</Text>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.faceButton,
                    pressed && styles.faceButtonPressed,
                  ]}
                  onPress={handleBiometric}
                >
                  <Ionicons name="finger-print-outline" size={22} color="#9ca3af" />
                </Pressable>
              </View>
            </Animated.View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t.noAccount}</Text>
              <Pressable hitSlop={8}>
                <Text style={styles.footerLink}>{t.requestAccess}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>

      {/* Module carousel — pinned to bottom */}
      <View style={styles.moduleSection}>
        <Animated.View
          style={[
            styles.moduleCarousel,
            { opacity: moduleFade, transform: [{ scale: moduleScale }] },
          ]}
        >
          <View style={styles.moduleIconWrap}>
            {MODULES[activeModule].icon}
          </View>
          <Text style={styles.moduleLabel}>
            {t[MODULES[activeModule].labelKey]}
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#181e38",
  },
  langSelector: {
    position: "absolute",
    top: Platform.OS === "ios" ? 58 : 16,
    right: 16,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  langText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#d4af37",
  },
  glowTop: {
    position: "absolute",
    top: -140,
    left: -120,
    width: 360,
    height: 360,
    borderRadius: 200,
    backgroundColor: "#d4af37",
    opacity: 0.12,
  },
  glowBottom: {
    position: "absolute",
    bottom: -170,
    right: -120,
    width: 390,
    height: 390,
    borderRadius: 220,
    backgroundColor: "#4064dc",
    opacity: 0.14,
  },
  keyboardWrap: {
    flex: 1,
  },
  contentWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 28,
  },
  brandBlock: {
    alignItems: "flex-start",
    marginBottom: 30,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandVend: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 8,
    color: "rgba(255,255,255,0.9)",
  },
  brand88: {
    fontSize: 32,
    fontWeight: "500",
    color: "#e53e3e",
    marginLeft: 0,
  },
  brandSubtitle: {
    marginTop: 12,
    fontSize: 10,
    letterSpacing: 5,
    color: "rgba(255,255,255,0.35)",
    marginLeft: 0,
  },
  moduleSection: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: 36,
  },
  moduleCarousel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  moduleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.2)",
    backgroundColor: "rgba(212,175,55,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  moduleLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.5)",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 30,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 28,
    elevation: 9,
  },
  welcome: {
    marginBottom: 14,
    textAlign: "left",
    color: "rgba(212,175,55,0.85)",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  inputGroup: {
    marginBottom: 12,
    position: "relative",
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 9,
    fontSize: 15,
    color: "#ffffff",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  inputFocused: {
    borderColor: "rgba(212,175,55,0.55)",
    backgroundColor: "rgba(255,255,255,0.055)",
    shadowColor: "#d4af37",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 3,
  },
  inputError: {
    borderColor: "rgba(252,165,165,0.45)",
  },
  passwordInput: {
    paddingRight: 104,
  },
  floatingLabel: {
    position: "absolute",
    left: 16,
  },
  passwordActions: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  passwordDivider: {
    width: 1,
    height: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  forgotText: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.45)",
  },
  error: {
    marginLeft: 4,
    color: "#fca5a5",
    fontWeight: "600",
    fontSize: 12,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 6,
  },
  actionsRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  button: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d4af37",
    shadowColor: "#d4af37",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 7,
  },
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  buttonLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonText: {
    color: "#181e38",
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  faceButton: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
  },
  faceButtonPressed: {
    borderColor: "rgba(212,175,55,0.4)",
    backgroundColor: "rgba(212,175,55,0.07)",
    transform: [{ scale: 0.94 }],
  },
  footer: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
  },
  footerLink: {
    fontSize: 12,
    fontWeight: "600",
    color: "#d4af37",
  },
});
