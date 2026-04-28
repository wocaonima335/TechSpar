import { useEffect, useState } from "react";

import { getCoreKnowledge, getHighFreq, getTopics } from "../api/interview";

export default function Knowledge() {
  const [topics, setTopics] = useState({});
  const [selectedTopic, setSelectedTopic] = useState("");
  const [coreFiles, setCoreFiles] = useState([]);
  const [highFreq, setHighFreq] = useState("");
  const [tab, setTab] = useState("core");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTopics = async () => {
      setLoading(true);
      try {
        const data = await getTopics();
        setTopics(data);
        const firstKey = Object.keys(data)[0] || "";
        setSelectedTopic((current) => current || firstKey);
      } finally {
        setLoading(false);
      }
    };
    loadTopics();
  }, []);

  useEffect(() => {
    const loadContent = async () => {
      if (!selectedTopic) return;
      try {
        const [files, highFreqData] = await Promise.all([
          getCoreKnowledge(selectedTopic),
          getHighFreq(selectedTopic),
        ]);
        setCoreFiles(files);
        setHighFreq(highFreqData.content || "");
      } catch {
        setCoreFiles([]);
        setHighFreq("");
      }
    };
    loadContent();
  }, [selectedTopic]);

  const topicEntries = Object.entries(topics);
  const selectedInfo = topics[selectedTopic];

  return (
    <div className="ts-page-wide">
      <div className="ts-page-hero">
        <div>
          <div className="ts-kicker">Phase 2 · Knowledge base</div>
          <h1 className="ts-page-title">知识库</h1>
          <p className="ts-page-subtitle">把共享知识、高频题库和专项领域统一到一个低噪音阅读空间，训练前快速建立上下文。</p>
        </div>
        <div className="ts-stat-card min-w-[150px] text-center">
          <div className="ts-stat-value">{topicEntries.length}</div>
          <div className="ts-stat-label">available topics</div>
        </div>
      </div>

      {loading ? (
        <div className="ts-empty-state">正在加载知识主题...</div>
      ) : (
        <>
          <div className="ts-data-card mb-5 p-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {topicEntries.map(([key, info]) => (
                <button key={key} className={`ts-chip shrink-0 ${selectedTopic === key ? "ts-chip-active" : ""}`} onClick={() => setSelectedTopic(key)}>
                  <span>{info.icon}</span><span>{info.name}</span>
                </button>
              ))}
            </div>
          </div>

          {!selectedTopic ? (
            <div className="ts-empty-state">暂无可用 topic。</div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
              <aside className="ts-data-card h-fit p-5">
                <div className="text-4xl">{selectedInfo?.icon || "◈"}</div>
                <div className="mt-4 text-xl font-extrabold tracking-tight text-text">{selectedInfo?.name || selectedTopic}</div>
                <div className="mt-2 font-mono text-xs text-muted">{selectedTopic}</div>
                <div className="mt-5 space-y-3 text-sm text-dim">
                  <div className="flex justify-between"><span>核心文件</span><strong className="text-text">{coreFiles.length}</strong></div>
                  <div className="flex justify-between"><span>高频题库</span><strong className="text-text">{highFreq ? "已收录" : "暂无"}</strong></div>
                </div>
              </aside>

              <section className="ts-data-card overflow-hidden">
                <div className="flex border-b border-border bg-surface/60 px-2 pt-2">
                  {[{ key: "core", label: "核心知识" }, { key: "high_freq", label: "高频题库" }].map((item) => (
                    <button key={item.key} className={`rounded-t-xl px-5 py-3 text-sm font-bold ${tab === item.key ? "bg-hover text-text" : "text-dim hover:text-text"}`} onClick={() => setTab(item.key)}>{item.label}</button>
                  ))}
                </div>

                <div className="p-5 md:p-6">
                  {tab === "core" ? (
                    coreFiles.length === 0 ? (
                      <div className="ts-empty-state">当前 topic 暂无核心知识文件。</div>
                    ) : (
                      <div className="grid gap-4">
                        {coreFiles.map((file) => (
                          <article key={file.filename} className="rounded-2xl border border-border bg-surface/70 overflow-hidden">
                            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                              <div className="font-mono text-xs font-bold text-accent-light">{file.filename}</div>
                              <span className="rounded-full bg-hover px-2.5 py-1 text-xs text-dim">core</span>
                            </div>
                            <pre className="max-h-[520px] overflow-auto p-4 text-sm leading-7 whitespace-pre-wrap text-text">{file.content}</pre>
                          </article>
                        ))}
                      </div>
                    )
                  ) : (
                    <article className="rounded-2xl border border-border bg-surface/70 p-4">
                      <pre className="max-h-[620px] overflow-auto text-sm leading-7 whitespace-pre-wrap text-text">{highFreq || "当前 topic 暂无高频题库内容。"}</pre>
                    </article>
                  )}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
