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

  if (loading) {
    return <div className="text-center py-15 text-dim">加载中...</div>;
  }

  const topicEntries = Object.entries(topics);

  return (
    <div className="flex-1 px-4 py-8 md:px-6 md:py-10 max-w-5xl mx-auto w-full">
      <div className="text-2xl md:text-[28px] font-display font-bold mb-2">知识库</div>
      <div className="text-sm text-dim mb-6">普通用户在这里查看共享知识内容；内容维护入口已迁移到管理员后台。</div>

      <div className="flex flex-wrap gap-2 mb-6">
        {topicEntries.map(([key, info]) => (
          <button
            key={key}
            className={`px-4 py-2 rounded-lg text-sm border ${
              selectedTopic === key
                ? "bg-accent/15 border-accent text-accent-light"
                : "bg-card border-border text-dim hover:text-text"
            }`}
            onClick={() => setSelectedTopic(key)}
          >
            {info.icon} {info.name}
          </button>
        ))}
      </div>

      {!selectedTopic ? (
        <div className="text-center py-15 text-dim">暂无可用 topic。</div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex border-b border-border">
            <button
              className={`px-5 py-3 text-sm ${tab === "core" ? "text-text border-b-2 border-b-accent" : "text-dim"}`}
              onClick={() => setTab("core")}
            >
              核心知识
            </button>
            <button
              className={`px-5 py-3 text-sm ${tab === "high_freq" ? "text-text border-b-2 border-b-accent" : "text-dim"}`}
              onClick={() => setTab("high_freq")}
            >
              高频题库
            </button>
          </div>

          <div className="p-5 md:p-6">
            {tab === "core" ? (
              coreFiles.length === 0 ? (
                <div className="text-dim text-sm">当前 topic 暂无核心知识文件。</div>
              ) : (
                <div className="flex flex-col gap-4">
                  {coreFiles.map((file) => (
                    <div key={file.filename} className="border border-border rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-border font-medium">{file.filename}</div>
                      <pre className="p-4 text-sm whitespace-pre-wrap overflow-x-auto">{file.content}</pre>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <pre className="text-sm whitespace-pre-wrap overflow-x-auto">{highFreq || "当前 topic 暂无高频题库内容。"}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
