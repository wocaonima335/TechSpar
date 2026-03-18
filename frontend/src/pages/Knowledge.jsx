import { useState, useEffect, useCallback } from "react";
import {
  getTopics,
  getCoreKnowledge,
  updateCoreKnowledge,
  createCoreKnowledge,
  deleteCoreKnowledge,
  getHighFreq,
  updateHighFreq,
  createTopic,
  deleteTopic,
} from "../api/interview";

const styles = {
  page: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
    height: "calc(100vh - 65px)",
  },
  sidebar: {
    width: 200,
    borderRight: "1px solid var(--border)",
    padding: "16px 12px",
    overflowY: "auto",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
  },
  sidebarHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    padding: "0 8px",
  },
  sidebarTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-dim)",
  },
  sidebarAddBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-dim)",
    fontSize: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s",
    lineHeight: 1,
  },
  topicList: {
    flex: 1,
    overflowY: "auto",
  },
  topicItem: {
    position: "relative",
    marginBottom: 2,
  },
  topicBtn: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "var(--text-dim)",
    fontSize: 14,
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    transition: "all 0.15s",
  },
  topicBtnActive: {
    background: "var(--bg-hover)",
    color: "var(--text)",
  },
  // Modal overlay
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "28px 32px",
    width: 380,
    maxWidth: "90vw",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 20,
  },
  modalField: {
    marginBottom: 14,
  },
  modalLabel: {
    fontSize: 13,
    color: "var(--text-dim)",
    marginBottom: 6,
    display: "block",
  },
  modalInput: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: 14,
    boxSizing: "border-box",
  },
  modalBtnRow: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 24,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  tabs: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid var(--border)",
    padding: "0 24px",
    background: "var(--bg-card)",
  },
  tab: {
    padding: "12px 20px",
    fontSize: 14,
    background: "transparent",
    color: "var(--text-dim)",
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  tabActive: {
    color: "var(--text)",
    borderBottomColor: "var(--accent)",
  },
  content: {
    flex: 1,
    overflowY: "auto",
    padding: 24,
  },
  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  fileCard: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    overflow: "hidden",
  },
  fileHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  },
  fileContent: {
    borderTop: "1px solid var(--border)",
    padding: 16,
  },
  textarea: {
    width: "100%",
    minHeight: 300,
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: 13,
    fontFamily: "monospace",
    lineHeight: 1.6,
    resize: "vertical",
    boxSizing: "border-box",
  },
  btnRow: {
    display: "flex",
    gap: 8,
    marginTop: 12,
    justifyContent: "flex-end",
  },
  btn: {
    padding: "8px 20px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
    color: "var(--text)",
    fontSize: 13,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  btnPrimary: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
  },
  empty: {
    textAlign: "center",
    padding: 60,
    color: "var(--text-dim)",
    fontSize: 14,
  },
  saving: {
    fontSize: 12,
    color: "var(--green)",
    marginRight: 12,
    alignSelf: "center",
  },
  addBar: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: 13,
  },
};

export default function Knowledge() {
  const [topics, setTopics] = useState({});
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("core");

  // Core knowledge state
  const [coreFiles, setCoreFiles] = useState([]);
  const [expandedFile, setExpandedFile] = useState(null);
  const [editContent, setEditContent] = useState({});
  const [coreSaving, setCoreSaving] = useState(null);

  // High freq state
  const [highFreq, setHighFreq] = useState("");
  const [highFreqDraft, setHighFreqDraft] = useState("");
  const [hfSaving, setHfSaving] = useState(false);

  // New file
  const [newFileName, setNewFileName] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);

  // Add topic
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [newTopicKey, setNewTopicKey] = useState("");
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicIcon, setNewTopicIcon] = useState("📝");

  const refreshTopics = useCallback(async () => {
    const t = await getTopics();
    setTopics(t);
    return t;
  }, []);

  useEffect(() => {
    refreshTopics().then((t) => {
      const keys = Object.keys(t);
      if (keys.length > 0) setSelected(keys[0]);
    });
  }, [refreshTopics]);

  const loadCore = useCallback(async (topic) => {
    try {
      const files = await getCoreKnowledge(topic);
      setCoreFiles(files);
      setExpandedFile(null);
      const buf = {};
      files.forEach((f) => { buf[f.filename] = f.content; });
      setEditContent(buf);
    } catch { setCoreFiles([]); }
  }, []);

  const loadHighFreq = useCallback(async (topic) => {
    try {
      const data = await getHighFreq(topic);
      setHighFreq(data.content || "");
      setHighFreqDraft(data.content || "");
    } catch { setHighFreq(""); setHighFreqDraft(""); }
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadCore(selected);
    loadHighFreq(selected);
  }, [selected, loadCore, loadHighFreq]);

  const handleSaveCore = async (filename) => {
    setCoreSaving(filename);
    try {
      await updateCoreKnowledge(selected, filename, editContent[filename] || "");
      setCoreFiles((prev) =>
        prev.map((f) => f.filename === filename ? { ...f, content: editContent[filename] } : f)
      );
    } catch (e) {
      alert("保存失败: " + e.message);
    }
    setTimeout(() => setCoreSaving(null), 1500);
  };

  const handleSaveHighFreq = async () => {
    setHfSaving(true);
    try {
      await updateHighFreq(selected, highFreqDraft);
      setHighFreq(highFreqDraft);
    } catch (e) {
      alert("保存失败: " + e.message);
    }
    setTimeout(() => setHfSaving(false), 1500);
  };

  const handleCreateFile = async () => {
    const name = newFileName.trim();
    if (!name) return;
    const fname = name.endsWith(".md") ? name : name + ".md";
    try {
      await createCoreKnowledge(selected, fname, "");
      setNewFileName("");
      setShowNewFile(false);
      loadCore(selected);
    } catch (e) {
      alert("创建失败: " + e.message);
    }
  };

  const handleDeleteFile = async (filename) => {
    if (!confirm(`确定删除「${filename}」？此操作不可撤销。`)) return;
    try {
      await deleteCoreKnowledge(selected, filename);
      setCoreFiles((prev) => prev.filter((f) => f.filename !== filename));
      if (expandedFile === filename) setExpandedFile(null);
    } catch (e) {
      alert("删除失败: " + e.message);
    }
  };

  const handleAddTopic = async () => {
    const key = newTopicKey.trim();
    const name = newTopicName.trim();
    if (!key || !name) return;
    try {
      await createTopic(key, name, newTopicIcon);
      setNewTopicKey("");
      setNewTopicName("");
      setNewTopicIcon("📝");
      setShowAddTopic(false);
      const t = await refreshTopics();
      setSelected(key);
    } catch (e) {
      alert("添加失败: " + e.message);
    }
  };

  const handleDeleteTopic = async (key) => {
    if (!confirm(`确定删除「${topics[key]?.name || key}」？`)) return;
    try {
      await deleteTopic(key);
      const t = await refreshTopics();
      const keys = Object.keys(t);
      if (selected === key) {
        setSelected(keys.length > 0 ? keys[0] : null);
      }
    } catch (e) {
      alert("删除失败: " + e.message);
    }
  };

  const topicKeys = Object.keys(topics);

  return (
    <div style={styles.page}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.sidebarTitle}>专项领域</div>
          <button
            style={styles.sidebarAddBtn}
            title="新增领域"
            onClick={() => setShowAddTopic(true)}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-dim)"; }}
          >+</button>
        </div>
        <div style={styles.topicList}>
          {topicKeys.map((key) => (
            <div
              key={key}
              className="topic-item"
              style={styles.topicItem}
              onMouseEnter={(e) => { const d = e.currentTarget.querySelector(".del-btn"); if (d) d.style.opacity = 1; }}
              onMouseLeave={(e) => { const d = e.currentTarget.querySelector(".del-btn"); if (d) d.style.opacity = 0; }}
            >
              <div
                style={{
                  ...styles.topicBtn,
                  ...(selected === key ? styles.topicBtnActive : {}),
                }}
                onClick={() => setSelected(key)}
              >
                <span>{topics[key]?.icon || "📝"}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {topics[key]?.name || key}
                </span>
              </div>
              <button
                className="del-btn"
                title="删除领域"
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "var(--text-dim)",
                  cursor: "pointer", fontSize: 14, padding: "4px 6px", borderRadius: 4,
                  opacity: 0, transition: "all 0.15s",
                }}
                onClick={() => handleDeleteTopic(key)}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#e74c3c"; e.currentTarget.style.background = "rgba(231,76,60,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add topic modal */}
      {showAddTopic && (
        <div style={styles.modalOverlay} onClick={() => setShowAddTopic(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>新增训练领域</div>
            <div style={styles.modalField}>
              <label style={styles.modalLabel}>标识（英文，用于 API 路径）</label>
              <input
                style={styles.modalInput}
                placeholder="docker"
                value={newTopicKey}
                onChange={(e) => setNewTopicKey(e.target.value)}
                autoFocus
              />
            </div>
            <div style={styles.modalField}>
              <label style={styles.modalLabel}>显示名称</label>
              <input
                style={styles.modalInput}
                placeholder="Docker 容器化"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
              />
            </div>
            <div style={styles.modalField}>
              <label style={styles.modalLabel}>图标 Emoji</label>
              <input
                style={{ ...styles.modalInput, width: 80 }}
                value={newTopicIcon}
                onChange={(e) => setNewTopicIcon(e.target.value)}
                maxLength={4}
              />
            </div>
            <div style={styles.modalBtnRow}>
              <button
                style={styles.btn}
                onClick={() => { setShowAddTopic(false); setNewTopicKey(""); setNewTopicName(""); setNewTopicIcon("📝"); }}
              >
                取消
              </button>
              <button
                style={{ ...styles.btn, ...styles.btnPrimary }}
                onClick={handleAddTopic}
                disabled={!newTopicKey.trim() || !newTopicName.trim()}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main area */}
      <div style={styles.main}>
        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === "core" ? styles.tabActive : {}) }}
            onClick={() => setTab("core")}
          >
            核心知识库
          </button>
          <button
            style={{ ...styles.tab, ...(tab === "high_freq" ? styles.tabActive : {}) }}
            onClick={() => setTab("high_freq")}
          >
            高频题库
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {!selected ? (
            <div style={styles.empty}>选择一个领域</div>
          ) : tab === "core" ? (
            <div>
              <div style={styles.addBar}>
                {showNewFile ? (
                  <>
                    <input
                      style={styles.input}
                      placeholder="文件名 (例: 装饰器.md)"
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateFile()}
                    />
                    <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={handleCreateFile}>
                      创建
                    </button>
                    <button style={styles.btn} onClick={() => { setShowNewFile(false); setNewFileName(""); }}>
                      取消
                    </button>
                  </>
                ) : (
                  <button style={styles.btn} onClick={() => setShowNewFile(true)}>
                    + 新增文件
                  </button>
                )}
              </div>

              {coreFiles.length === 0 ? (
                <div style={styles.empty}>该领域暂无知识文件</div>
              ) : (
                <div style={styles.fileList}>
                  {coreFiles.map((f) => (
                    <div key={f.filename} style={styles.fileCard}>
                      <div
                        style={styles.fileHeader}
                        onClick={() => setExpandedFile(expandedFile === f.filename ? null : f.filename)}
                      >
                        <span>{f.filename}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                            {expandedFile === f.filename ? "▼" : "▶"} {(f.content?.length || 0)} 字
                          </span>
                          <button
                            title="删除文件"
                            style={{
                              background: "none", border: "none", color: "var(--text-dim)",
                              cursor: "pointer", fontSize: 14, padding: "2px 6px", borderRadius: 4,
                              opacity: 0.5, transition: "all 0.15s",
                            }}
                            onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.filename); }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "#e74c3c"; e.currentTarget.style.opacity = 1; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.opacity = 0.5; }}
                          >
                            &#x2715;
                          </button>
                        </div>
                      </div>
                      {expandedFile === f.filename && (
                        <div style={styles.fileContent}>
                          <textarea
                            style={styles.textarea}
                            value={editContent[f.filename] ?? f.content}
                            onChange={(e) =>
                              setEditContent((prev) => ({ ...prev, [f.filename]: e.target.value }))
                            }
                          />
                          <div style={styles.btnRow}>
                            {coreSaving === f.filename && <span style={styles.saving}>已保存</span>}
                            <button
                              style={{ ...styles.btn, ...styles.btnPrimary }}
                              onClick={() => handleSaveCore(f.filename)}
                            >
                              保存
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
                记录该领域高频面试题，出题时会优先覆盖这些考点。支持 Markdown 格式。
              </div>
              <textarea
                style={{ ...styles.textarea, minHeight: 500 }}
                value={highFreqDraft}
                onChange={(e) => setHighFreqDraft(e.target.value)}
                placeholder={"# 高频题\n\n## 1. xxx原理是什么？为什么这样设计？\n\n## 2. 实际项目中遇到xxx问题怎么解决？"}
              />
              <div style={styles.btnRow}>
                {hfSaving && <span style={styles.saving}>已保存</span>}
                {highFreqDraft !== highFreq && (
                  <button style={styles.btn} onClick={() => setHighFreqDraft(highFreq)}>
                    撤销修改
                  </button>
                )}
                <button
                  style={{ ...styles.btn, ...styles.btnPrimary }}
                  onClick={handleSaveHighFreq}
                  disabled={highFreqDraft === highFreq}
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
