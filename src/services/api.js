import axios from "axios";

const API_URLS = {
  local: "http://localhost:8000/api/v1",
  staging: "https://staging.example.com/api/v1",
  production: "https://api.example.com/api/v1",
};

// Priority: .env value > fallback to local
const baseURL = process.env.REACT_APP_API_URL || API_URLS.local;

const api = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Quick switch helper — call setApiUrl(API_URLS.staging) to change at runtime
export const setApiUrl = (url) => {
  api.defaults.baseURL = url;
};

export { API_URLS };
export default api;
