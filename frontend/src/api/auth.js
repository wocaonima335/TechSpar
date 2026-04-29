import { apiJson } from "./client";

export async function login(username, password) {
  return apiJson(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    },
    { skipAuth: true },
  );
}

export async function register(payload) {
  return apiJson(
    "/auth/register",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    { skipAuth: true },
  );
}

export async function requestEmailVerification(email) {
  return apiJson(
    "/auth/email-verification",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    },
    { skipAuth: true },
  );
}

export async function getRegisterOptions() {
  return apiJson("/auth/register/options", {}, { skipAuth: true });
}

export async function getMe() {
  return apiJson("/auth/me");
}
