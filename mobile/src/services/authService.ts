import { isAxiosError } from "axios";
import { api } from "./api";

type LoginResult = {
  token: string;
  demo?: boolean;
};

export async function loginWithEmail(
  email: string,
  password: string
): Promise<LoginResult> {
  try {
    const response = await api.post("/auth/login", { email, password });

    if (!response.data?.token) {
      throw new Error("Login response missing token");
    }

    return { token: response.data.token };
  } catch (error) {
    // Backend does not expose /auth/login yet. Allow development login.
    if (__DEV__ && password.length >= 6) {
      return {
        token: `dev-token-${Date.now()}`,
        demo: true,
      };
    }

    if (isAxiosError(error)) {
      const serverMessage =
        typeof error.response?.data?.detail === "string"
          ? error.response.data.detail
          : "Unable to sign in";
      throw new Error(serverMessage);
    }

    throw new Error("Unable to sign in");
  }
}
