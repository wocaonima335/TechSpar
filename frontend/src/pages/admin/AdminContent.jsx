import { useEffect, useState } from "react";

import {
  createCoreKnowledge,
  createTopic,
  deleteCoreKnowledge,
  deleteTopic,
  updateCoreKnowledge,
  updateHighFreq,
} from "../../api/admin";
import { getCoreKnowledge, getHighFreq, getTopics } from "../../api/interview";

export default function AdminContent() {
  const [topics, setTopics] = useState({});
  const [selectedTopic, setSelectedTopic] = useState("");
  const [coreFiles, setCoreFiles] = useState([]);
  const [highFreq, setHighFreq] = useState("");
  const [topicForm, setTopicForm] = useState({ key: "", name: "", icon: "🔵" });
  const [fileForm, setFileForm] = useState({ filename: "", content: "" });

  const loadTopics = async () => {
    const data = await getTopics();
    setTopics(data);
    const firstKey = Object.keys(data)[0] || "";
    setSelectedTopic((current) => current || firstKey);
    return data;
  };

  const loadTopicContent = async (topic) => {
    if (!topic) return;
    const [files, highFreqData] = await Promise.all([getCoreKnowledge(topic), getHighFreq(topic)]);
    setCoreFiles(files);
    setHighFreq(highFreqData.content || "");
  };

  useEffect(() => {
    loadTopics();
  }, []);

  useEffect(() => {
    loadTopicContent(selectedTopic);
  }, [selectedTopic]);

  const handleCreateTopic = async (event) => {
    event.preventDefault();
    try {
      await createTopic(topicForm);
      setTopicForm({ key: "", name: "", icon: "🔵" });
      const data = await loadTopics();
      if (topicForm.key && data[topicForm.key]) {
        setSelectedTopic(topicForm.key);
      }
    } catch (err) {
      alert(`创建 topic 失败: ${err.message}`);
    }
  };

  const handleDeleteTopic = async () => {
    if (!selectedTopic) return;
    if (!window.confirm(`确定删除 topic ${selectedTopic} 吗？`)) return;
    try {
      await deleteTopic(selectedTopic);
      setSelectedTopic("");
      await loadTopics();
    } catch (err) {
      alert(`删除 topic 失败: ${err.message}`);
    }
  };

  const handleCreateFile = async (event) => {
    event.preventDefault();
    if (!selectedTopic) return;
    try {
      await createCoreKnowledge(selectedTopic, fileForm.filename, fileForm.content);
      setFileForm({ filename: "", content: "" });
      await loadTopicContent(selectedTopic);
    } catch (err) {
      alert(`创建文件失败: ${err.message}`);
    }
  };

  const handleSaveFile = async (filename, content) => {
    try {
      await updateCoreKnowledge(selectedTopic, filename, content);
      await loadTopicContent(selectedTopic);
    } catch (err) {
      alert(`保存文件失败: ${err.message}`);
    }
  };

  const handleDeleteFile = async (filename) => {
    if (!window.confirm(`确定删除 ${filename} 吗？`)) return;
    try {
      await deleteCoreKnowledge(selectedTopic, filename);
      await loadTopicContent(selectedTopic);
    } catch (err) {
      alert(`删除文件失败: ${err.message}`);
    }
  };

  const handleSaveHighFreq = async () => {
    try {
      await updateHighFreq(selectedTopic, highFreq);
      alert("高频题库已保存");
    } catch (err) {
      alert(`保存高频题库失败: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 px-4 py-8 md:px-6 md:py-10 max-w-5xl mx-auto w-full">
      <div className="text-2xl md:text-[28px] font-display font-bold mb-6">内容管理</div>

      <form className="bg-card border border-border rounded-2xl p-5 md:p-6 mb-6" onSubmit={handleCreateTopic}>
        <div className="text-base font-semibold mb-4">创建 Topic</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            className="px-4 py-3 rounded-xl border border-border bg-input text-text"
            placeholder="topic key"
            value={topicForm.key}
            onChange={(event) => setTopicForm((prev) => ({ ...prev, key: event.target.value }))}
          />
          <input
            className="px-4 py-3 rounded-xl border border-border bg-input text-text"
            placeholder="显示名称"
            value={topicForm.name}
            onChange={(event) => setTopicForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <input
            className="px-4 py-3 rounded-xl border border-border bg-input text-text"
            placeholder="图标"
            value={topicForm.icon}
            onChange={(event) => setTopicForm((prev) => ({ ...prev, icon: event.target.value }))}
          />
        </div>
        <button className="mt-4 px-5 py-2.5 rounded-xl bg-accent text-white" type="submit">
          创建 Topic
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-6">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-base font-semibold mb-3">Topic 列表</div>
          <div className="flex flex-col gap-2">
            {Object.entries(topics).map(([key, info]) => (
              <button
                key={key}
                className={`px-3 py-2 rounded-lg text-left text-sm ${
                  selectedTopic === key ? "bg-hover text-text" : "text-dim hover:bg-hover hover:text-text"
                }`}
                onClick={() => setSelectedTopic(key)}
              >
                {info.icon} {info.name}
              </button>
            ))}
          </div>
          {selectedTopic && (
            <button className="mt-4 px-4 py-2 rounded-lg bg-red/15 text-red text-sm" onClick={handleDeleteTopic}>
              删除当前 Topic
            </button>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <form className="bg-card border border-border rounded-2xl p-5 md:p-6" onSubmit={handleCreateFile}>
            <div className="text-base font-semibold mb-4">新增核心知识文件</div>
            <input
              className="w-full px-4 py-3 rounded-xl border border-border bg-input text-text mb-3"
              placeholder="filename.md"
              value={fileForm.filename}
              onChange={(event) => setFileForm((prev) => ({ ...prev, filename: event.target.value }))}
            />
            <textarea
              className="w-full min-h-[140px] px-4 py-3 rounded-xl border border-border bg-input text-text"
              placeholder="Markdown 内容"
              value={fileForm.content}
              onChange={(event) => setFileForm((prev) => ({ ...prev, content: event.target.value }))}
            />
            <button className="mt-4 px-5 py-2.5 rounded-xl bg-accent text-white" disabled={!selectedTopic} type="submit">
              创建文件
            </button>
          </form>

          <div className="bg-card border border-border rounded-2xl p-5 md:p-6">
            <div className="text-base font-semibold mb-4">核心知识文件</div>
            <div className="flex flex-col gap-4">
              {coreFiles.map((file) => (
                <EditableFileCard
                  key={file.filename}
                  file={file}
                  onDelete={() => handleDeleteFile(file.filename)}
                  onSave={(content) => handleSaveFile(file.filename, content)}
                />
              ))}
              {selectedTopic && coreFiles.length === 0 && <div className="text-dim text-sm">当前 topic 暂无核心知识文件。</div>}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 md:p-6">
            <div className="text-base font-semibold mb-4">高频题库</div>
            <textarea
              className="w-full min-h-[220px] px-4 py-3 rounded-xl border border-border bg-input text-text"
              value={highFreq}
              onChange={(event) => setHighFreq(event.target.value)}
              placeholder="请输入当前 topic 的高频题库内容"
            />
            <button className="mt-4 px-5 py-2.5 rounded-xl bg-accent text-white" disabled={!selectedTopic} onClick={handleSaveHighFreq}>
              保存高频题库
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditableFileCard({ file, onSave, onDelete }) {
  const [content, setContent] = useState(file.content || "");

  useEffect(() => {
    setContent(file.content || "");
  }, [file.content]);

  return (
    <div className="border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium">{file.filename}</div>
        <button className="px-3 py-1.5 rounded-lg bg-red/15 text-red text-sm" onClick={onDelete}>
          删除
        </button>
      </div>
      <textarea
        className="w-full min-h-[180px] px-4 py-3 rounded-xl border border-border bg-input text-text"
        value={content}
        onChange={(event) => setContent(event.target.value)}
      />
      <button className="mt-3 px-4 py-2 rounded-lg bg-hover text-sm" onClick={() => onSave(content)}>
        保存文件
      </button>
    </div>
  );
}
