import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { isAxiosError } from "axios";
import { loginWithEmail } from "../services/authService";
import { api, setAuthFailureHandler } from "../services/api";

const AUTH_TOKEN_KEY = "vend88-auth-token";
const AUTH_EMAIL_KEY = "vend88-auth-email";
const AUTH_FIRST_KEY = "vend88-auth-first-name";
const AUTH_LAST_KEY = "vend88-auth-last-name";
const BIOMETRIC_KEY = "vend88-biometric-enabled";
const BIOMETRIC_ASKED_KEY = "vend88-biometric-asked";

type SignInResult = {
  ok: boolean;
  message?: string;
};

type AuthContextType = {
  token: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
};

type AdminProfileResponse = {
  status_code?: number;
  email?: string;
  first_name?: string;
  last_name?: string;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const activeTokenRef = useRef<string | null>(null);

  const clearSession = useCallback(async () => {
    activeTokenRef.current = null;
    setToken(null);
    setEmail(null);
    setFirstName(null);
    setLastName(null);
    await Promise.all([
      SecureStore.deleteItemAsync(AUTH_TOKEN_KEY),
      SecureStore.deleteItemAsync(AUTH_EMAIL_KEY),
      SecureStore.deleteItemAsync(AUTH_FIRST_KEY),
      SecureStore.deleteItemAsync(AUTH_LAST_KEY),
      // Reset biometric lock onboarding/state so next login must re-enable it.
      SecureStore.deleteItemAsync(BIOMETRIC_KEY),
      SecureStore.deleteItemAsync(BIOMETRIC_ASKED_KEY),
    ]);
  }, []);

  const refreshProfile = useCallback(async (authToken: string): Promise<"ok" | "auth-failed" | "unknown"> => {
    try {
      const response = await api.post<AdminProfileResponse>("/admin/profile", {
        token: authToken,
      });
      if (activeTokenRef.current !== authToken) {
        return "unknown";
      }
      const data = response.data;
      if (data?.status_code === 401 || data?.status_code === 403) {
        return "auth-failed";
      }
      if (data?.status_code !== 200) return "unknown";
      const nextFirst = data.first_name?.trim() || null;
      const nextLast = data.last_name?.trim() || null;
      const nextEmail = data.email?.trim();
      setFirstName(nextFirst);
      setLastName(nextLast);
      if (nextEmail) setEmail(nextEmail);
      await Promise.all([
        nextFirst
          ? SecureStore.setItemAsync(AUTH_FIRST_KEY, nextFirst)
          : SecureStore.deleteItemAsync(AUTH_FIRST_KEY),
        nextLast
          ? SecureStore.setItemAsync(AUTH_LAST_KEY, nextLast)
          : SecureStore.deleteItemAsync(AUTH_LAST_KEY),
        nextEmail ? SecureStore.setItemAsync(AUTH_EMAIL_KEY, nextEmail) : Promise.resolve(),
      ]);
      return "ok";
    } catch (error) {
      // Only clear session on true auth failures; keep session on transient network issues.
      if (isAxiosError(error)) {
        const status = error.response?.status;
        const statusCode = error.response?.data?.status_code;
        if (status === 401 || status === 403 || statusCode === 401 || statusCode === 403) {
          return "auth-failed";
        }
      }
      return "unknown";
    }
  }, []);

  useEffect(() => {
    setAuthFailureHandler(async () => {
      if (!activeTokenRef.current) {
        return;
      }
      await clearSession();
    });

    return () => {
      setAuthFailureHandler(null);
    };
  }, [clearSession]);

  useEffect(() => {
    let mounted = true;

    const restoreAuth = async () => {
      try {
        const [storedToken, storedEmail, storedFirst, storedLast] = await Promise.all([
          SecureStore.getItemAsync(AUTH_TOKEN_KEY),
          SecureStore.getItemAsync(AUTH_EMAIL_KEY),
          SecureStore.getItemAsync(AUTH_FIRST_KEY),
          SecureStore.getItemAsync(AUTH_LAST_KEY),
        ]);
        if (mounted) {
          if (storedToken) setToken(storedToken);
          if (storedEmail) setEmail(storedEmail);
          if (storedFirst) setFirstName(storedFirst);
          if (storedLast) setLastName(storedLast);
        }
        activeTokenRef.current = storedToken;
        if (storedToken) {
          const refreshState = await refreshProfile(storedToken);
          if (refreshState === "auth-failed") {
            await clearSession();
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    restoreAuth();

    return () => {
      mounted = false;
    };
  }, [clearSession, refreshProfile]);

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    try {
      const result = await loginWithEmail(email, password);
      activeTokenRef.current = result.token;
      setToken(result.token);
      setEmail(email);
      await Promise.all([
        SecureStore.setItemAsync(AUTH_TOKEN_KEY, result.token),
        SecureStore.setItemAsync(AUTH_EMAIL_KEY, email),
      ]);
      refreshProfile(result.token);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to sign in",
      };
    }
  };

  const signOut = async () => {
    await clearSession();
  };

  const value = useMemo(
    () => ({
      token,
      email,
      firstName,
      lastName,
      loading,
      signIn,
      signOut,
    }),
    [token, email, firstName, lastName, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
