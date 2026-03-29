import { apiForm, apiJson } from "./client";

export async function transcribeAudio(audioBlob) {
  const form = new FormData();
  form.append("file", audioBlob, "recording.webm");
  return apiForm("/transcribe", form, { method: "POST" });
}

export async function getTopics() {
  return apiJson("/topics");
}

export async function getResumeStatus() {
  return apiJson("/resume/status");
}

export async function uploadResume(file) {
  const form = new FormData();
  form.append("file", file);
  return apiForm("/resume/upload", form, { method: "POST" });
}

export async function startInterview(mode, topic = null) {
  return apiJson("/interview/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, topic }),
  });
}

export async function sendMessage(sessionId, message) {
  return apiJson("/interview/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
}

export async function endInterview(sessionId, answers = null) {
  const options = { method: "POST" };
  if (answers) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify({ answers });
  }
  return apiJson(`/interview/end/${sessionId}`, options);
}

export async function getReview(sessionId) {
  return apiJson(`/interview/review/${sessionId}`);
}

export async function getHistory(limit = 20, offset = 0, mode = null, topic = null) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (mode) params.set("mode", mode);
  if (topic) params.set("topic", topic);
  return apiJson(`/interview/history?${params}`);
}

export async function deleteSession(sessionId) {
  return apiJson(`/interview/session/${sessionId}`, { method: "DELETE" });
}

export async function getInterviewTopics() {
  return apiJson("/interview/topics");
}

export async function getGraphData(topic) {
  return apiJson(`/graph/${topic}`);
}

export async function getProfile() {
  return apiJson("/profile");
}

export async function getDueReviews(topic = null) {
  const params = new URLSearchParams();
  if (topic) params.set("topic", topic);
  return apiJson(`/profile/due-reviews${params.toString() ? `?${params}` : ""}`);
}

export async function getTopicRetrospective(topic) {
  return apiJson(`/profile/topic/${topic}/retrospective`, { method: "POST" });
}

export async function getTopicHistory(topic) {
  return apiJson(`/profile/topic/${topic}/history`);
}

export async function getCoreKnowledge(topic) {
  return apiJson(`/knowledge/${topic}/core`);
}

export async function getHighFreq(topic) {
  return apiJson(`/knowledge/${topic}/high_freq`);
}
