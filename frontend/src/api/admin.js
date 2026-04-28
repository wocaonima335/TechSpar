import { apiJson } from "./client";

export async function getAdminSettings() {
  return apiJson("/admin/settings");
}

export async function testAdminSettings(payload) {
  return apiJson("/admin/settings/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateAdminSettings(payload) {
  return apiJson("/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateAdminProfile(payload) {
  return apiJson("/admin/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function changeAdminPassword(current_password, new_password) {
  return apiJson("/admin/me/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password, new_password }),
  });
}

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
