import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { loginWithEmail } from "../services/authService";

const AUTH_TOKEN_KEY = "vend88-auth-token";

type SignInResult = {
  ok: boolean;
  message?: string;
  demo?: boolean;
};

type AuthContextType = {
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const restoreAuth = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
        if (mounted && storedToken) {
          setToken(storedToken);
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
  }, []);

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    try {
      const result = await loginWithEmail(email, password);
      setToken(result.token);
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, result.token);
      return { ok: true, demo: result.demo };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to sign in",
      };
    }
  };

  const signOut = async () => {
    setToken(null);
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  };

  const value = useMemo(
    () => ({
      token,
      loading,
      signIn,
      signOut,
    }),
    [token, loading]
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
