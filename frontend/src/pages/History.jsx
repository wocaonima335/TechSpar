import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getHistory, deleteSession, getInterviewTopics } from "../api/interview";

const PAGE_SIZE = 15;

function getScoreColor(score) {
  if (score >= 8) return { bg: "rgba(0,184,148,0.15)", color: "var(--green)" };
  if (score >= 6) return { bg: "rgba(108,92,231,0.15)", color: "var(--accent-light)" };
  if (score >= 4) return { bg: "rgba(253,203,110,0.2)", color: "#e2b93b" };
  return { bg: "rgba(225,112,85,0.15)", color: "var(--red)" };
}

const styles = {
  page: {
    flex: 1,
    padding: "40px 24px",
    maxWidth: 800,
    margin: "0 auto",
    width: "100%",
  },
  titleRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
  },
  totalText: {
    fontSize: 14,
    color: "var(--text-dim)",
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  filterBtn: {
    padding: "6px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    background: "transparent",
    color: "var(--text-dim)",
    border: "1px solid var(--border)",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  filterBtnActive: {
    background: "var(--bg-hover)",
    color: "var(--text)",
    borderColor: "var(--accent)",
  },
  filterSelect: {
    padding: "6px 14px",
    borderRadius: 8,
    fontSize: 13,
    background: "var(--bg-input)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    outline: "none",
    cursor: "pointer",
  },
  divider: {
    width: 1,
    height: 20,
    background: "var(--border)",
    margin: "0 4px",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 20px",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    flex: 1,
  },
  badge: {
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    flexShrink: 0,
  },
  topicText: {
    fontSize: 14,
    color: "var(--text)",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sessionId: {
    fontSize: 12,
    color: "var(--text-dim)",
    flexShrink: 0,
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },
  scoreTag: {
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    minWidth: 52,
    textAlign: "center",
  },
  noScore: {
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 13,
    color: "var(--text-dim)",
    background: "var(--bg-hover)",
    minWidth: 52,
    textAlign: "center",
  },
  date: {
    fontSize: 13,
    color: "var(--text-dim)",
    whiteSpace: "nowrap",
  },
  deleteBtn: {
    padding: "4px 8px",
    borderRadius: 6,
    background: "transparent",
    border: "none",
    color: "var(--text-dim)",
    cursor: "pointer",
    fontSize: 15,
    transition: "color 0.2s",
    flexShrink: 0,
    opacity: 0.5,
  },
  loadMoreBtn: {
    display: "block",
    width: "100%",
    padding: "12px",
    marginTop: 16,
    borderRadius: "var(--radius)",
    background: "var(--bg-hover)",
    color: "var(--text-dim)",
    fontSize: 14,
    border: "1px solid var(--border)",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  empty: {
    textAlign: "center",
    padding: 60,
    color: "var(--text-dim)",
  },
  loading: {
    textAlign: "center",
    padding: 60,
    color: "var(--text-dim)",
  },
};

const MODE_BADGES = {
  resume: { text: "简历面试", bg: "rgba(108,92,231,0.15)", color: "var(--accent-light)" },
  topic_drill: { text: "专项训练", bg: "rgba(0,184,148,0.15)", color: "var(--green)" },
};

export default function History() {
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [modeFilter, setModeFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [topics, setTopics] = useState([]);

  // Load topic list for dropdown
  useEffect(() => {
    getInterviewTopics().then(setTopics).catch(() => {});
  }, []);

  // Fetch sessions (reset=true for filter change, false for load more)
  const fetchSessions = useCallback(
    (reset) => {
      const offset = reset ? 0 : sessions.length;
      const setter = reset ? setLoading : setLoadingMore;
      setter(true);

      const mode = modeFilter === "all" ? null : modeFilter;
      const topic = topicFilter === "all" ? null : topicFilter;

      getHistory(PAGE_SIZE, offset, mode, topic)
        .then((data) => {
          setSessions((prev) => (reset ? data.items : [...prev, ...data.items]));
          setTotal(data.total);
        })
        .catch(() => {})
        .finally(() => setter(false));
    },
    [modeFilter, topicFilter, sessions.length],
  );

  // Reset on filter change
  useEffect(() => {
    fetchSessions(true);
  }, [modeFilter, topicFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset topic filter when switching to resume mode
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

  if (loading) {
    return <div style={styles.loading}>加载中...</div>;
  }

  const hasFilters = modeFilter !== "all" || topicFilter !== "all";

  return (
    <div style={styles.page}>
      {/* Title row */}
      <div style={styles.titleRow}>
        <div style={styles.title}>历史记录</div>
        <div style={styles.totalText}>共 {total} 条记录</div>
      </div>

      {/* Filter bar */}
      <div style={styles.filterBar}>
        {[
          { key: "all", label: "全部" },
          { key: "resume", label: "简历面试" },
          { key: "topic_drill", label: "专项训练" },
        ].map((m) => (
          <button
            key={m.key}
            style={{
              ...styles.filterBtn,
              ...(modeFilter === m.key ? styles.filterBtnActive : {}),
            }}
            onClick={() => handleModeChange(m.key)}
          >
            {m.label}
          </button>
        ))}

        {modeFilter !== "resume" && topics.length > 0 && (
          <>
            <div style={styles.divider} />
            <select
              style={styles.filterSelect}
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
            >
              <option value="all">全部领域</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Session list */}
      {sessions.length === 0 ? (
        <div style={styles.empty}>
          {hasFilters
            ? "没有匹配的记录，试试调整筛选条件"
            : "还没有面试记录，去首页开始一场面试吧"}
        </div>
      ) : (
        <>
          <div style={styles.list}>
            {sessions.map((s) => {
              const badge = MODE_BADGES[s.mode] || MODE_BADGES.resume;
              const hasScore =
                s.avg_score !== null && s.avg_score !== undefined;
              const sc = hasScore ? getScoreColor(s.avg_score) : null;

              return (
                <div
                  key={s.session_id}
                  style={styles.item}
                  onClick={() => navigate(`/review/${s.session_id}`)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = "var(--accent)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = "var(--border)")
                  }
                >
                  <div style={styles.left}>
                    <span
                      style={{
                        ...styles.badge,
                        background: badge.bg,
                        color: badge.color,
                      }}
                    >
                      {badge.text}
                    </span>
                    {s.topic && (
                      <span style={styles.topicText}>{s.topic}</span>
                    )}
                    <span style={styles.sessionId}>#{s.session_id}</span>
                  </div>
                  <div style={styles.right}>
                    {hasScore ? (
                      <span
                        style={{
                          ...styles.scoreTag,
                          background: sc.bg,
                          color: sc.color,
                        }}
                      >
                        {s.avg_score}/10
                      </span>
                    ) : (
                      <span style={styles.noScore}>--</span>
                    )}
                    <span style={styles.date}>
                      {s.created_at?.slice(0, 10)}
                    </span>
                    <button
                      style={styles.deleteBtn}
                      title="删除"
                      onClick={(e) => handleDelete(e, s.session_id)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--red)";
                        e.currentTarget.style.opacity = 1;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-dim)";
                        e.currentTarget.style.opacity = 0.5;
                      }}
                    >
                      &#x2715;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load more */}
          {sessions.length < total && (
            <button
              style={styles.loadMoreBtn}
              onClick={() => fetchSessions(false)}
              disabled={loadingMore}
            >
              {loadingMore
                ? "加载中..."
                : `加载更多 (${sessions.length}/${total})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
