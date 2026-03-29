const API_BASE = "/api";
export const ACCESS_TOKEN_KEY = "techspar_access_token";

export class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function getStoredToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || "";
}

export function setStoredToken(token) {
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

async function parseErrorPayload(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    const text = await response.text();
    return text ? { detail: text } : null;
  } catch {
    return null;
  }
}

function extractErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  if (typeof payload.detail === "string") return payload.detail;
  return fallback;
}

export async function apiRequest(path, options = {}, config = {}) {
  const { skipAuth = false, raw = false } = config;
  const headers = new Headers(options.headers || {});
  const token = getStoredToken();
  if (!skipAuth && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const payload = await parseErrorPayload(response);
    if (response.status === 401 && !skipAuth) {
      setStoredToken("");
      window.dispatchEvent(new CustomEvent("auth:logout"));
    }
    throw new ApiError(
      extractErrorMessage(payload, `Request failed with status ${response.status}`),
      response.status,
      payload,
    );
  }

  if (raw) return response;
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export async function apiJson(path, options = {}, config = {}) {
  return apiRequest(path, options, config);
}

export async function apiForm(path, formData, options = {}, config = {}) {
  return apiRequest(
    path,
    {
      ...options,
      body: formData,
    },
    config,
  );
}
