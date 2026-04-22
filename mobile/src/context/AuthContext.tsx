import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { loginWithEmail } from "../services/authService";
import { api } from "../services/api";

const AUTH_TOKEN_KEY = "vend88-auth-token";
const AUTH_EMAIL_KEY = "vend88-auth-email";
const AUTH_FIRST_KEY = "vend88-auth-first-name";
const AUTH_LAST_KEY = "vend88-auth-last-name";

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

  const refreshProfile = useCallback(async (authToken: string) => {
    try {
      const response = await api.post<AdminProfileResponse>("/admin/profile", {
        token: authToken,
      });
      if (activeTokenRef.current !== authToken) {
        return;
      }
      const data = response.data;
      if (data?.status_code !== 200) return;
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
    } catch {
      // Silent: fall back to cached or email-derived values.
    }
  }, []);

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
          refreshProfile(storedToken);
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
  }, [refreshProfile]);

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
    ]);
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
