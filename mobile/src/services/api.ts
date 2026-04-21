import axios from "axios";
import Constants from "expo-constants";

const DEFAULT_OFFICIAL_API_BASE_URL = "https://dev.vend88.com";
const FALLBACK_API_BASE_URL = "http://127.0.0.1:8000/api/v1";
export const API_TARGET = (process.env.EXPO_PUBLIC_API_TARGET ?? "custom").toLowerCase();

function getExpoHostUri(): string | undefined {
  const configHostUri = Constants.expoConfig?.hostUri;

  const manifest2HostUri =
    (
      Constants as unknown as {
        manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
      }
    ).manifest2?.extra?.expoClient?.hostUri;

  const debuggerHostUri =
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } })
      .expoGoConfig?.debuggerHost;

  return configHostUri ?? manifest2HostUri ?? debuggerHostUri;
}

function getAutoDetectedApiBaseUrl(): string | undefined {
  const hostUri = getExpoHostUri();
  if (!hostUri) {
    return undefined;
  }

  const host = hostUri.split(":")[0];
  if (!host) {
    return undefined;
  }

  return `http://${host}:8000/api/v1`;
}

function getCustomApiBaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_CUSTOM_API_BASE_URL ??
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    getAutoDetectedApiBaseUrl() ??
    FALLBACK_API_BASE_URL
  );
}

export const API_BASE_URL =
  API_TARGET === "official"
    ? process.env.EXPO_PUBLIC_OFFICIAL_API_BASE_URL ??
      DEFAULT_OFFICIAL_API_BASE_URL
    : getCustomApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);
