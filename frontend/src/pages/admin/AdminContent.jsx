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
import AdminPageShell, { AdminEmptyState, AdminSection } from "../../components/AdminPageShell";

export default function AdminContent() {
  const [topics, setTopics] = useState({});
  const [selectedTopic, setSelectedTopic] = useState("");
  const [coreFiles, setCoreFiles] = useState([]);
  const [highFreq, setHighFreq] = useState("");
  const [topicForm, setTopicForm] = useState({ key: "", name: "", icon: "🔵", dir: "" });
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
    const timer = window.setTimeout(() => loadTopics(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadTopicContent(selectedTopic), 0);
    return () => window.clearTimeout(timer);
  }, [selectedTopic]);

  const handleCreateTopic = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...topicForm,
        key: topicForm.key.trim(),
        name: topicForm.name.trim(),
        icon: topicForm.icon.trim(),
        dir: topicForm.dir.trim(),
      };
      await createTopic(payload);
      setTopicForm({ key: "", name: "", icon: "🔵", dir: "" });
      const data = await loadTopics();
      if (topicForm.key && data[topicForm.key]) setSelectedTopic(topicForm.key);
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

  const topicEntries = Object.entries(topics);

  return (
    <AdminPageShell
      kicker="Phase 3 · Content ops"
      title="内容管理"
      subtitle="管理训练主题、核心知识文件与高频题库。编辑区保持宽松行距，降低长文本维护成本。"
      stats={[{ label: "topics", value: topicEntries.length }, { label: "core files", value: coreFiles.length }, { label: "selected", value: selectedTopic || "--" }]}
    >
      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <AdminSection title="创建 Topic" description="key 用于路由和数据目录，创建后会自动选中新 topic。">
            <form className="grid gap-3" onSubmit={handleCreateTopic}>
              <label><span className="ts-admin-label">topic key</span><input className="ts-admin-field" placeholder="java_backend" value={topicForm.key} onChange={(event) => setTopicForm((prev) => ({ ...prev, key: event.target.value }))} /></label>
              <label><span className="ts-admin-label">display name</span><input className="ts-admin-field" placeholder="显示名称" value={topicForm.name} onChange={(event) => setTopicForm((prev) => ({ ...prev, name: event.target.value }))} /></label>
              <div className="grid grid-cols-[90px_1fr] gap-3">
                <label><span className="ts-admin-label">icon</span><input className="ts-admin-field" placeholder="🔵" value={topicForm.icon} onChange={(event) => setTopicForm((prev) => ({ ...prev, icon: event.target.value }))} /></label>
                <label><span className="ts-admin-label">dir optional</span><input className="ts-admin-field" placeholder="目录名" value={topicForm.dir} onChange={(event) => setTopicForm((prev) => ({ ...prev, dir: event.target.value }))} /></label>
              </div>
              <button className="ts-admin-action ts-admin-action-primary" type="submit">创建 Topic</button>
            </form>
          </AdminSection>

          <AdminSection title="Topic 列表" description="选择一个 topic 后，可维护对应知识文件和高频题库。">
            {topicEntries.length === 0 ? <AdminEmptyState>暂无 topic。</AdminEmptyState> : (
              <div className="grid gap-2">
                {topicEntries.map(([key, info]) => (
                  <button key={key} className={`rounded-2xl border px-4 py-3 text-left text-sm ${selectedTopic === key ? "border-accent/40 bg-accent/10 text-text" : "border-border bg-surface/60 text-dim hover:text-text"}`} onClick={() => setSelectedTopic(key)}>
                    <span className="mr-2">{info.icon}</span>{info.name}<span className="ml-2 font-mono text-xs text-muted">{key}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedTopic && <button className="ts-admin-action ts-admin-action-danger mt-4" onClick={handleDeleteTopic}>删除当前 Topic</button>}
          </AdminSection>
        </div>

        <div className="space-y-6">
          <AdminSection title="新增核心知识文件" description="建议使用 Markdown 文件名，例如 architecture.md。">
            <form className="grid gap-3" onSubmit={handleCreateFile}>
              <label><span className="ts-admin-label">filename</span><input className="ts-admin-field" placeholder="filename.md" value={fileForm.filename} onChange={(event) => setFileForm((prev) => ({ ...prev, filename: event.target.value }))} /></label>
              <label><span className="ts-admin-label">markdown content</span><textarea className="ts-admin-field min-h-[150px]" placeholder="Markdown 内容" value={fileForm.content} onChange={(event) => setFileForm((prev) => ({ ...prev, content: event.target.value }))} /></label>
              <button className="ts-admin-action ts-admin-action-primary w-fit" disabled={!selectedTopic} type="submit">创建文件</button>
            </form>
          </AdminSection>

          <AdminSection title="核心知识文件" description="长文本编辑框已保留原业务逻辑，保存后会重新拉取文件内容。">
            <div className="grid gap-4">
              {coreFiles.map((file) => <EditableFileCard key={file.filename} file={file} onDelete={() => handleDeleteFile(file.filename)} onSave={(content) => handleSaveFile(file.filename, content)} />)}
              {selectedTopic && coreFiles.length === 0 && <AdminEmptyState>当前 topic 暂无核心知识文件。</AdminEmptyState>}
            </div>
          </AdminSection>

          <AdminSection title="高频题库" description="用于专项训练前的高频内容沉淀。">
            <textarea className="ts-admin-field min-h-[260px] leading-7" value={highFreq} onChange={(event) => setHighFreq(event.target.value)} placeholder="请输入当前 topic 的高频题库内容" />
            <button className="ts-admin-action ts-admin-action-primary mt-4" disabled={!selectedTopic} onClick={handleSaveHighFreq}>保存高频题库</button>
          </AdminSection>
        </div>
      </div>
    </AdminPageShell>
  );
}

function EditableFileCard({ file, onSave, onDelete }) {
  const [content, setContent] = useState(file.content || "");

  useEffect(() => {
    const timer = window.setTimeout(() => setContent(file.content || ""), 0);
    return () => window.clearTimeout(timer);
  }, [file.content]);

  return (
    <article className="rounded-2xl border border-border bg-surface/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-mono text-sm font-bold text-accent-light">{file.filename}</div>
        <button className="ts-admin-action ts-admin-action-danger" onClick={onDelete}>删除</button>
      </div>
      <textarea className="ts-admin-field min-h-[220px] leading-7" value={content} onChange={(event) => setContent(event.target.value)} />
      <button className="ts-admin-action mt-3" onClick={() => onSave(content)}>保存文件</button>
    </article>
  );
}
