import { isAxiosError } from "axios";
import { api } from "./api";

const ERROR_MAP: Record<string, string> = {
  "email not belong to an active admin or invalid password":
    "The email address or password you entered is incorrect. Please try again.",
  "email not belong to an active user":
    "This account is inactive or unavailable. Please contact support.",
  "invalid password": "The password you entered is incorrect. Please try again.",
  "user not found": "No account was found for this email address.",
  "account disabled": "This account has been disabled. Please contact support.",
};

function humanizeLoginError(raw: string): string {
  const lower = raw.toLowerCase();
  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (lower.includes(key)) return friendly;
  }
  return raw || "We were unable to sign you in. Please verify your details and try again.";
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
      const raw = typeof data?.message === "string" ? data.message : "";
      throw new Error(humanizeLoginError(raw));
    }

    return { token: data.token, role: data.role ?? "admin" };
  } catch (error) {
    if (isAxiosError(error)) {
      const body = error.response?.data;
      const raw = typeof body?.message === "string" ? body.message : "";
      throw new Error(humanizeLoginError(raw));
    }

    if (error instanceof Error) {
      throw new Error(humanizeLoginError(error.message));
    }

    throw new Error("We were unable to sign you in. Please verify your details and try again.");
  }
}
