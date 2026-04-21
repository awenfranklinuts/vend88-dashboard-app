import axios from "axios";

const DEFAULT_OFFICIAL_API_URL = "https://dev.vend88.com";
const DEFAULT_CUSTOM_API_URL = "http://localhost:8000/api/v1";

const API_TARGET = (process.env.REACT_APP_API_TARGET || "custom").toLowerCase();

const API_URLS = {
  official: process.env.REACT_APP_OFFICIAL_API_URL || DEFAULT_OFFICIAL_API_URL,
  custom: process.env.REACT_APP_CUSTOM_API_URL || DEFAULT_CUSTOM_API_URL,
};

// Backward compatibility: REACT_APP_API_URL has highest priority.
const baseURL =
  process.env.REACT_APP_API_URL ||
  (API_TARGET === "official" ? API_URLS.official : API_URLS.custom);

const api = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Runtime switch helper for temporary overrides.
export const setApiUrl = (url) => {
  api.defaults.baseURL = url;
};

export { API_TARGET, API_URLS };
export default api;
