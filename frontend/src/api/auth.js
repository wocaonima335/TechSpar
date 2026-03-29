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

export async function getMe() {
  return apiJson("/auth/me");
}
