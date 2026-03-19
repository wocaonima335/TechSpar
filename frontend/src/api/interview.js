const API_BASE = "/api";

// ── Speech-to-text ──

export async function transcribeAudio(audioBlob) {
  const form = new FormData();
  form.append("file", audioBlob, "recording.webm");
  const res = await fetch(`${API_BASE}/transcribe`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTopics() {
  const res = await fetch(`${API_BASE}/topics`);
  return res.json();
}

export async function createTopic(key, name, icon = "📝") {
  const res = await fetch(`${API_BASE}/topics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, name, icon }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteTopic(key) {
  const res = await fetch(`${API_BASE}/topics/${key}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Resume ──

export async function getResumeStatus() {
  const res = await fetch(`${API_BASE}/resume/status`);
  return res.json();
}

export async function uploadResume(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/resume/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startInterview(mode, topic = null) {
  const res = await fetch(`${API_BASE}/interview/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, topic }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function sendMessage(sessionId, message) {
  const res = await fetch(`${API_BASE}/interview/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function endInterview(sessionId, answers = null) {
  const options = { method: "POST" };
  if (answers) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify({ answers });
  }
  const res = await fetch(`${API_BASE}/interview/end/${sessionId}`, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getReview(sessionId) {
  const res = await fetch(`${API_BASE}/interview/review/${sessionId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getHistory(limit = 20, offset = 0, mode = null, topic = null) {
  const params = new URLSearchParams({ limit, offset });
  if (mode) params.set("mode", mode);
  if (topic) params.set("topic", topic);
  const res = await fetch(`${API_BASE}/interview/history?${params}`);
  return res.json();
}

export async function deleteSession(sessionId) {
  const res = await fetch(`${API_BASE}/interview/session/${sessionId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getInterviewTopics() {
  const res = await fetch(`${API_BASE}/interview/topics`);
  return res.json();
}

// ── Graph ──

export async function getGraphData(topic) {
  const res = await fetch(`${API_BASE}/graph/${topic}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Profile & Retrospective ──

export async function getProfile() {
  const res = await fetch(`${API_BASE}/profile`);
  return res.json();
}

export async function getTopicRetrospective(topic) {
  const res = await fetch(`${API_BASE}/profile/topic/${topic}/retrospective`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTopicHistory(topic) {
  const res = await fetch(`${API_BASE}/profile/topic/${topic}/history`);
  return res.json();
}

// ── Knowledge management ──

export async function getCoreKnowledge(topic) {
  const res = await fetch(`${API_BASE}/knowledge/${topic}/core`);
  return res.json();
}

export async function updateCoreKnowledge(topic, filename, content) {
  const res = await fetch(`${API_BASE}/knowledge/${topic}/core/${encodeURIComponent(filename)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteCoreKnowledge(topic, filename) {
  const res = await fetch(`${API_BASE}/knowledge/${topic}/core/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createCoreKnowledge(topic, filename, content) {
  const res = await fetch(`${API_BASE}/knowledge/${topic}/core`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, content }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getHighFreq(topic) {
  const res = await fetch(`${API_BASE}/knowledge/${topic}/high_freq`);
  return res.json();
}

export async function updateHighFreq(topic, content) {
  const res = await fetch(`${API_BASE}/knowledge/${topic}/high_freq`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
