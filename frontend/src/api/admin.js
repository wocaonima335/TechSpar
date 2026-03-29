import { apiJson } from "./client";

export async function listUsers() {
  return apiJson("/admin/users");
}

export async function createUser(payload) {
  return apiJson("/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateUser(userId, payload) {
  return apiJson(`/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function resetPassword(userId, password) {
  return apiJson(`/admin/users/${userId}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

export async function createTopic(payload) {
  return apiJson("/admin/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteTopic(key) {
  return apiJson(`/admin/topics/${key}`, { method: "DELETE" });
}

export async function createCoreKnowledge(topic, filename, content) {
  return apiJson(`/admin/knowledge/${topic}/core`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, content }),
  });
}

export async function updateCoreKnowledge(topic, filename, content) {
  return apiJson(`/admin/knowledge/${topic}/core/${encodeURIComponent(filename)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export async function deleteCoreKnowledge(topic, filename) {
  return apiJson(`/admin/knowledge/${topic}/core/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
}

export async function updateHighFreq(topic, content) {
  return apiJson(`/admin/knowledge/${topic}/high_freq`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}
