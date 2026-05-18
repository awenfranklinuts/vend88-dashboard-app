import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/context/AuthContext";
import { useI18n } from "../src/context/I18nContext";

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
const BIOMETRIC_ASKED_KEY = "vend88-biometric-asked";

const C = {
  bg: "#0F1427",
  gold: "#D4AF37",
  red: "#E53E3E",
  textHi: "#FFFFFF",
  textMid: "rgba(255,255,255,0.60)",
  textLow: "rgba(255,255,255,0.40)",
  textFaint: "rgba(255,255,255,0.28)",
  border: "rgba(255,255,255,0.10)",
  borderFocus: "rgba(212,175,55,0.5)",
  errorBorder: "rgba(252,165,165,0.4)",
  errorText: "#FCA5A5",
};

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

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
  const [biometricKind, setBiometricKind] = useState<"face" | "fingerprint" | "biometric">(
    "biometric"
  );

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(0)).current;
  const screenTranslate = useRef(new Animated.Value(16)).current;
  const emailBorderAnim = useRef(new Animated.Value(0)).current;
  const passwordBorderAnim = useRef(new Animated.Value(0)).current;

  const animateBorder = (anim: Animated.Value, toValue: number) => {
    Animated.timing(anim, {
      toValue,
      duration: 180,
      useNativeDriver: false,
    }).start();
  };

  const emailBorderColor = emailBorderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [C.border, C.borderFocus],
  });
  const passwordBorderColor = passwordBorderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [C.border, C.borderFocus],
  });

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 5,
        duration: 45,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -5,
        duration: 45,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
      }),
      Animated.timing(screenTranslate, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [screenOpacity, screenTranslate]);

  useEffect(() => {
    if (token && !skipAutoRedirect) {
      router.replace("/(tabs)");
    }
  }, [token, skipAutoRedirect, router]);

  const refreshBiometricState = useCallback(async () => {
    if (!LocalAuth) {
      setBiometricKind("biometric");
      setBiometricAvailable(false);
      return;
    }

    const [compatible, enrolled, hasStoredToken, userEnabled, supportedTypes] =
      await Promise.all([
        LocalAuth.hasHardwareAsync(),
        LocalAuth.isEnrolledAsync(),
        SecureStore.getItemAsync(AUTH_TOKEN_KEY).then(Boolean),
        SecureStore.getItemAsync(BIOMETRIC_KEY).then((v) => v === "1"),
        LocalAuth.supportedAuthenticationTypesAsync().catch(() => [] as number[]),
      ]);

    const authTypes = LocalAuth.AuthenticationType;
    const supportsFace =
      authTypes?.FACIAL_RECOGNITION !== undefined &&
      supportedTypes.includes(authTypes.FACIAL_RECOGNITION);
    const supportsFingerprint =
      authTypes?.FINGERPRINT !== undefined &&
      supportedTypes.includes(authTypes.FINGERPRINT);

    if (supportsFace) {
      setBiometricKind("face");
    } else if (supportsFingerprint) {
      setBiometricKind("fingerprint");
    } else {
      setBiometricKind("biometric");
    }

    setBiometricAvailable(compatible && enrolled && hasStoredToken && userEnabled);
  }, []);

  useEffect(() => {
    void refreshBiometricState();
  }, [refreshBiometricState]);

  useFocusEffect(
    useCallback(() => {
      void refreshBiometricState();
    }, [refreshBiometricState])
  );

  const biometricButtonLabel =
    biometricKind === "face"
      ? "Use Face ID"
      : biometricKind === "fingerprint"
        ? "Use Fingerprint"
        : "Use Biometric";

  const biometricIcon: keyof typeof Ionicons.glyphMap =
    biometricKind === "face" ? "scan-outline" : "finger-print";

  const triggerError = (msg: string) => {
    setError(msg);
    triggerShake();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

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
      duration: 160,
      useNativeDriver: true,
    }).start(() => router.replace("/(tabs)"));
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

    // First-time biometric onboarding: ask the user whether to enable biometric
    // sign-in, instead of silently triggering the OS prompt later. Only ask
    // once, and only when hardware is available + enrolled + not already on.
    await maybeOfferBiometricSetup();

    Animated.timing(screenOpacity, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(() => router.replace("/(tabs)"));
  };

  // Prompt the user (in-app Alert) on their first successful login to decide
  // whether to enable biometric unlock. We persist a "asked" flag so we never
  // ask again — they can always toggle it later from Settings.
  const maybeOfferBiometricSetup = useCallback(async (): Promise<void> => {
    if (!LocalAuth) return;
    try {
      const [asked, alreadyOn, compatible, enrolled, supportedTypes] = await Promise.all([
        SecureStore.getItemAsync(BIOMETRIC_ASKED_KEY),
        SecureStore.getItemAsync(BIOMETRIC_KEY),
        LocalAuth.hasHardwareAsync(),
        LocalAuth.isEnrolledAsync(),
        LocalAuth.supportedAuthenticationTypesAsync(),
      ]);
      if (asked === "1") return;
      if (alreadyOn === "1") {
        await SecureStore.setItemAsync(BIOMETRIC_ASKED_KEY, "1");
        return;
      }
      if (!compatible || !enrolled) {
        // Don't pester users on devices without biometrics.
        await SecureStore.setItemAsync(BIOMETRIC_ASKED_KEY, "1");
        return;
      }

      const FACIAL = LocalAuth.AuthenticationType.FACIAL_RECOGNITION;
      const FINGER = LocalAuth.AuthenticationType.FINGERPRINT;
      const hasFace = supportedTypes.includes(FACIAL);
      const hasFinger = supportedTypes.includes(FINGER);
      const message = hasFace
        ? t("login_biometric_setup_face")
        : hasFinger
        ? t("login_biometric_setup_fingerprint")
        : t("login_biometric_setup_generic");

      await new Promise<void>((resolve) => {
        Alert.alert(
          t("login_biometric_setup_title"),
          message,
          [
            {
              text: t("login_biometric_setup_skip"),
              style: "cancel",
              onPress: async () => {
                await SecureStore.setItemAsync(BIOMETRIC_ASKED_KEY, "1");
                resolve();
              },
            },
            {
              text: t("login_biometric_setup_enable"),
              onPress: async () => {
                try {
                  const auth = await LocalAuth!.authenticateAsync({
                    promptMessage: t("login_biometric_setup_title"),
                    cancelLabel: t("login_biometric_setup_skip"),
                    disableDeviceFallback: true,
                  });
                  if (auth.success) {
                    await SecureStore.setItemAsync(BIOMETRIC_KEY, "1");
                  }
                } catch {
                  // Swallow — user can enable later from Settings.
                } finally {
                  await SecureStore.setItemAsync(BIOMETRIC_ASKED_KEY, "1");
                  resolve();
                }
              },
            },
          ],
          { cancelable: false, onDismiss: () => resolve() }
        );
      });
    } catch {
      // Non-fatal — never block sign-in on the onboarding prompt.
    }
  }, [t]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.select({ ios: "padding", android: undefined })}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Animated.View
              style={[
                styles.contentWrap,
                {
                  opacity: screenOpacity,
                  transform: [{ translateY: screenTranslate }],
                },
              ]}
            >
              {/* Brand */}
              <View style={styles.brandBlock}>
                <View style={styles.brandRow}>
                  <Text style={styles.brandVend}>VEND</Text>
                  <Text style={styles.brand88}>88</Text>
                </View>
                <Text style={styles.brandSubtitle}>DASHBOARD</Text>
              </View>

              {/* Form */}
              <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                {/* Email */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Email</Text>
                  </View>
                  <View style={styles.inputWrap}>
                    <View style={styles.inputIconLeft} pointerEvents="none">
                      <Ionicons
                        name="mail-outline"
                        size={18}
                        color={emailFocused ? C.gold : C.textLow}
                      />
                    </View>
                    <AnimatedTextInput
                      style={[
                        styles.input,
                        styles.inputWithIcon,
                        !!error && styles.inputError,
                        !error && { borderColor: emailBorderColor },
                      ]}
                      value={email}
                      onChangeText={(v) => setEmail(v)}
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
                        animateBorder(emailBorderAnim, 1);
                        Haptics.selectionAsync();
                      }}
                      onBlur={() => {
                        setEmailFocused(false);
                        animateBorder(emailBorderAnim, 0);
                      }}
                      placeholder="you@example.com"
                      placeholderTextColor={C.textFaint}
                    />
                  </View>
                </View>

                {/* Password */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Password</Text>
                    <Pressable hitSlop={8}>
                      <Text style={styles.forgotText}>Forgot?</Text>
                    </Pressable>
                  </View>
                  <View style={styles.passwordWrap}>
                    <View style={styles.inputIconLeft} pointerEvents="none">
                      <Ionicons
                        name="lock-closed-outline"
                        size={18}
                        color={passwordFocused ? C.gold : C.textLow}
                      />
                    </View>
                    <AnimatedTextInput
                      ref={passwordRef}
                      style={[
                        styles.input,
                        styles.inputWithIcon,
                        styles.passwordInput,
                        !!error && styles.inputError,
                        !error && { borderColor: passwordBorderColor },
                      ]}
                      value={password}
                      onChangeText={(v) => setPassword(v)}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="password"
                      returnKeyType="go"
                      onSubmitEditing={handleSignIn}
                      onFocus={() => {
                        setPasswordFocused(true);
                        animateBorder(passwordBorderAnim, 1);
                        Haptics.selectionAsync();
                      }}
                      onBlur={() => {
                        setPasswordFocused(false);
                        animateBorder(passwordBorderAnim, 0);
                      }}
                      placeholder="Enter password"
                      placeholderTextColor={C.textFaint}
                    />
                    <Pressable
                      style={styles.eyeBtn}
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={showPassword ? "eye" : "eye-off"}
                        size={18}
                        color={C.textMid}
                      />
                    </Pressable>
                  </View>
                </View>

                {error ? (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle" size={14} color={C.errorText} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {/* Sign In Button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    pressed && styles.buttonPressed,
                    loading && styles.buttonDisabled,
                  ]}
                  onPress={handleSignIn}
                  disabled={loading}
                >
                  <View style={styles.buttonInner}>
                    {loading && (
                      <ActivityIndicator color="#0F1427" size="small" />
                    )}
                    <Text style={styles.buttonText}>
                      {loading ? "Signing in..." : "Sign in"}
                    </Text>
                  </View>
                </Pressable>

                {/* Biometric Button */}
                {biometricAvailable ? (
                  <>
                    <View style={styles.divider}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>OR</Text>
                      <View style={styles.dividerLine} />
                    </View>
                    <Pressable
                      style={({ pressed }) => [
                        styles.biometricBtn,
                        pressed && styles.biometricBtnPressed,
                      ]}
                      onPress={handleBiometric}
                    >
                      <Ionicons name={biometricIcon} size={16} color={C.gold} />
                      <Text style={styles.biometricText}>{biometricButtonLabel}</Text>
                    </Pressable>
                  </>
                ) : null}
              </Animated.View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>Don't have access?</Text>
                <Pressable hitSlop={8}>
                  <Text style={styles.footerLink}> Request access</Text>
                </Pressable>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  keyboardWrap: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  contentWrap: {
    paddingHorizontal: 28,
    paddingVertical: 32,
  },

  // Brand
  brandBlock: {
    alignItems: "flex-start",
    marginBottom: 48,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandVend: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 6,
    color: C.textHi,
  },
  brand88: {
    fontSize: 28,
    fontWeight: "500",
    color: C.red,
    marginLeft: 4,
  },
  brandSubtitle: {
    marginTop: 10,
    fontSize: 10,
    letterSpacing: 4,
    color: C.textLow,
    fontWeight: "500",
  },

  // Inputs
  inputGroup: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: C.textMid,
    marginBottom: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 16 : 14,
    fontSize: 15,
    color: C.textHi,
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  inputWrap: {
    position: "relative",
  },
  inputIconLeft: {
    position: "absolute",
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 1,
  },
  inputWithIcon: {
    paddingLeft: 40,
  },
  inputFocused: {
    borderColor: C.borderFocus,
  },
  inputError: {
    borderColor: C.errorBorder,
  },
  passwordWrap: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 44,
  },
  eyeBtn: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  forgotText: {
    fontSize: 12,
    fontWeight: "500",
    color: C.textMid,
  },

  // Error
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: -6,
    marginBottom: 14,
  },
  errorText: {
    color: C.errorText,
    fontSize: 12,
    fontWeight: "500",
  },

  // Button
  button: {
    marginTop: 6,
    minHeight: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.gold,
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  buttonText: {
    color: "#0F1427",
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.8,
  },

  // Biometric
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 24,
    marginBottom: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },
  dividerText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 2,
    color: C.textLow,
  },
  biometricBtn: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "transparent",
  },
  biometricBtnPressed: {
    backgroundColor: "rgba(212,175,55,0.06)",
    borderColor: "rgba(212,175,55,0.3)",
  },
  biometricText: {
    color: C.gold,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.4,
  },

  // Footer
  footer: {
    marginTop: 36,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    color: C.textLow,
  },
  footerLink: {
    fontSize: 12,
    fontWeight: "600",
    color: C.gold,
  },
});
