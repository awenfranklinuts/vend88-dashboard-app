import { useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
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
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "@/src/context/AuthContext";
import { useI18n } from "@/src/context/I18nContext";

type LocalAuthModule = typeof import("expo-local-authentication");
let LocalAuth: LocalAuthModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LocalAuth = require("expo-local-authentication");
} catch {
  LocalAuth = null;
}

const AUTH_TOKEN_KEY = "vend88-auth-token";
const BIOMETRIC_KEY = "vend88-biometric-enabled";

export default function LoginScreen() {
  const router = useRouter();
  const { token, signIn } = useAuth();
  const { t } = useI18n();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [skipAutoRedirect, setSkipAutoRedirect] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // Animated label positions
  const emailAnim = useRef(new Animated.Value(0)).current;
  const passwordAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

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

  useEffect(() => {
    (async () => {
      const compatible = LocalAuth ? await LocalAuth.hasHardwareAsync() : false;
      const enrolled = LocalAuth ? await LocalAuth.isEnrolledAsync() : false;
      const hasStoredToken = !!(await SecureStore.getItemAsync(AUTH_TOKEN_KEY));
      const userEnabled = (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === "1";
      setBiometricAvailable(compatible && enrolled && hasStoredToken && userEnabled);
    })();
  }, []);

  const handleBiometric = async () => {
    if (!LocalAuth) {
      triggerError(t("login_biometric_unavailable"));
      return;
    }

    if (!biometricAvailable) {
      triggerError(t("login_enable_biometric_first"));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await LocalAuth.authenticateAsync({
      promptMessage: t("login_prompt_sign_in"),
      fallbackLabel: t("login_use_password"),
      cancelLabel: t("common_cancel"),
      disableDeviceFallback: false,
    });
    if (!result.success) return;

    const storedToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    if (!storedToken) {
      triggerError(t("login_session_expired"));
      return;
    }
    Animated.timing(screenOpacity, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(() => router.replace("/(tabs)"));
  };

  const triggerError = (msg: string) => {
    setError(msg);
    triggerShake();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const handleSignIn = async () => {
    setError("");

    if (!email || !password) {
      triggerError(t("login_fill_fields"));
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      triggerError(t("login_invalid_email"));
      return;
    }

    setSkipAutoRedirect(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);

    if (!result.ok) {
      setSkipAutoRedirect(false);
      triggerError(result.message ?? t("login_sign_in_failed"));
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

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
              <Text style={styles.brandSubtitle}>{t("login_brand_subtitle")}</Text>
            </View>

            <Animated.View
              style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}
            >
              <Text style={styles.welcome}>{t("login_welcome_back")}</Text>

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
                  {emailFocused || email.length > 0
                    ? t("login_email_address_caps")
                    : t("login_email_address")}
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
                  {passwordFocused || password.length > 0
                    ? t("login_password_caps")
                    : t("login_password")}
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
                    <Text style={styles.forgotText}>{t("login_forgot")}</Text>
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
                      <Text style={styles.buttonText}>{t("login_authenticating")}</Text>
                    </View>
                  ) : (
                    <Text style={styles.buttonText}>{t("login_sign_in")}</Text>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.faceButton,
                    pressed && styles.faceButtonPressed,
                    !biometricAvailable && styles.faceButtonDimmed,
                  ]}
                  onPress={handleBiometric}
                >
                  <Ionicons
                    name="scan-outline"
                    size={22}
                    color={biometricAvailable ? "#d4af37" : "#9ca3af"}
                  />
                </Pressable>
              </View>
            </Animated.View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t("login_no_account")}</Text>
              <Pressable hitSlop={8}>
                <Text style={styles.footerLink}>{t("login_request_access")}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#181e38",
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
    marginLeft: 4,
  },
  brandSubtitle: {
    marginTop: 12,
    fontSize: 10,
    letterSpacing: 5,
    color: "rgba(255,255,255,0.35)",
    marginLeft: 0,
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
  faceButtonDimmed: {
    opacity: 0.45,
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
