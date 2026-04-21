import { isAxiosError } from "axios";
import { api } from "./api";

const ERROR_MAP: Record<string, string> = {
  "email not belong to an active admin or invalid password":
    "Incorrect email or password. Please try again.",
  "email not belong to an active user":
    "This account is not active or doesn't exist.",
  "invalid password": "Incorrect password. Please try again.",
  "user not found": "No account found with that email address.",
  "account disabled": "Your account has been disabled. Contact support.",
};

function humanizeLoginError(raw: string): string {
  const lower = raw.toLowerCase();
  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (lower.includes(key)) return friendly;
  }
  return raw || "Unable to sign in. Please try again.";
}

type LoginResult = {
  token: string;
  role: string;
};

export async function loginWithEmail(
  email: string,
  password: string
): Promise<LoginResult> {
  try {
    const response = await api.post("/admin/login", { email, password });
    const data = response.data;

    if (data?.status_code !== 200 || !data?.token) {
      throw new Error(data?.message ?? "Login failed");
    }

    return { token: data.token, role: data.role ?? "admin" };
  } catch (error) {
    if (isAxiosError(error)) {
      const body = error.response?.data;
      const raw = typeof body?.message === "string" ? body.message : "";
      throw new Error(humanizeLoginError(raw));
    }

    throw error instanceof Error ? error : new Error("Unable to sign in");
  }
}
