import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getHistory, deleteSession, getInterviewTopics } from "../api/interview";

const PAGE_SIZE = 15;
const MODE_BADGES = {
  resume: { text: "简历面试", cls: "bg-accent/15 text-accent-light border-accent/25" },
  topic_drill: { text: "专项训练", cls: "bg-green/15 text-green border-green/25" },
};

function getScoreColor(score) {
  if (score >= 8) return { bg: "rgba(16,185,129,0.14)", color: "var(--green)" };
  if (score >= 6) return { bg: "rgba(96,165,250,0.14)", color: "var(--accent-light)" };
  if (score >= 4) return { bg: "rgba(245,158,11,0.14)", color: "var(--orange)" };
  return { bg: "rgba(239,68,68,0.14)", color: "var(--red)" };
}

export default function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [modeFilter, setModeFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [topics, setTopics] = useState([]);

  useEffect(() => { getInterviewTopics().then(setTopics).catch(() => {}); }, []);

  const fetchSessions = useCallback((reset) => {
    const offset = reset ? 0 : sessions.length;
    const setter = reset ? setLoading : setLoadingMore;
    setter(true);
    getHistory(PAGE_SIZE, offset, modeFilter === "all" ? null : modeFilter, topicFilter === "all" ? null : topicFilter)
      .then((data) => {
        setSessions((prev) => (reset ? data.items : [...prev, ...data.items]));
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setter(false));
  }, [modeFilter, topicFilter, sessions.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => fetchSessions(true), 0);
    return () => window.clearTimeout(timer);
  }, [modeFilter, topicFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleModeChange = (mode) => {
    if (mode === "resume") setTopicFilter("all");
    setModeFilter(mode);
  };

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation();
    if (!window.confirm("确定要删除这条记录吗？")) return;
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      setTotal((prev) => prev - 1);
    } catch (err) {
      alert("删除失败: " + err.message);
    }
  };

  return (
    <div className="ts-page-narrow">
      <div className="ts-page-hero">
        <div>
          <div className="ts-kicker">Phase 2 · Timeline</div>
          <h1 className="ts-page-title">历史记录</h1>
          <p className="ts-page-subtitle">按训练模式和领域快速回看复盘，把每一次回答沉淀成下一次提升的线索。</p>
        </div>
        <div className="ts-stat-card min-w-[128px] text-center">
          <div className="ts-stat-value">{total}</div>
          <div className="ts-stat-label">total sessions</div>
        </div>
      </div>

      <div className="ts-data-card mb-5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {[{ key: "all", label: "全部" }, { key: "resume", label: "简历面试" }, { key: "topic_drill", label: "专项训练" }].map((m) => (
            <button key={m.key} className={`ts-chip ${modeFilter === m.key ? "ts-chip-active" : ""}`} onClick={() => handleModeChange(m.key)}>{m.label}</button>
          ))}
          {modeFilter !== "resume" && topics.length > 0 && (
            <select className="ts-chip bg-input outline-none" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
              <option value="all">全部领域</option>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="ts-empty-state">正在加载训练时间线...</div>
      ) : sessions.length === 0 ? (
        <div className="ts-empty-state">{modeFilter !== "all" || topicFilter !== "all" ? "没有匹配记录，换个筛选条件试试。" : "还没有训练记录，先从首页开始一场面试。"}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((s) => {
            const badge = MODE_BADGES[s.mode] || MODE_BADGES.resume;
            const sc = s.avg_score != null ? getScoreColor(s.avg_score) : null;
            return (
              <div key={s.session_id} className="ts-data-card ts-data-card-hover cursor-pointer p-4 md:p-5" onClick={() => navigate(`/review/${s.session_id}`)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badge.cls}`}>{badge.text}</span>
                      {s.topic && <span className="truncate text-sm font-semibold text-text">{s.topic}</span>}
                      <span className="text-xs text-muted">{s.created_at?.slice(0, 10)}</span>
                    </div>
                    <div className="mt-3 truncate font-mono text-xs text-dim">#{s.session_id}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {sc ? <span className="rounded-xl px-3 py-2 text-sm font-extrabold" style={{ background: sc.bg, color: sc.color }}>{s.avg_score}/10</span> : <span className="rounded-xl bg-hover px-3 py-2 text-sm text-dim">--</span>}
                    <button className="rounded-lg px-2 py-1 text-dim opacity-60 hover:bg-red/10 hover:text-red hover:opacity-100" title="删除" onClick={(e) => handleDelete(e, s.session_id)}>✕</button>
                  </div>
                </div>
              </div>
            );
          })}
          {sessions.length < total && <button className="ts-btn ts-btn-secondary w-full" onClick={() => fetchSessions(false)} disabled={loadingMore}>{loadingMore ? "加载中..." : `加载更多 (${sessions.length}/${total})`}</button>}
        </div>
      )}
    </div>
  );
}
