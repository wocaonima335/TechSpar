import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TopicCard from "../components/TopicCard";
import { getProfile, getResumeStatus, getTopics, startInterview, uploadResume } from "../api/interview";

const CAPABILITIES = [
  { title: "真实追问", desc: "围绕简历和专项主题持续追问，逼近真实面试压力。" },
  { title: "结构复盘", desc: "每轮训练沉淀评分、亮点、风险点和下一步建议。" },
  { title: "成长画像", desc: "长期追踪领域掌握度，让训练从感觉变成数据。" },
];

export default function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState(null);
  const [topics, setTopics] = useState({});
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    getTopics().then(setTopics).catch(() => {});
    getResumeStatus().then((s) => {
      if (s.has_resume) setResumeFile({ filename: s.filename, size: s.size });
    }).catch(() => {});
    getProfile().then(setProfile).catch(() => {});
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = await uploadResume(file);
      setResumeFile({ filename: data.filename, size: data.size });
      setMode("resume");
    } catch (err) {
      alert("上传失败: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleStart = async () => {
    if (!mode) return;
    if (mode === "topic_drill" && !selectedTopic) return;
    setLoading(true);
    try {
      const data = await startInterview(mode, selectedTopic);
      navigate(`/interview/${data.session_id}`, { state: data });
    } catch (err) {
      alert("启动失败: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const canStart = (mode === "resume" && resumeFile) || (mode === "topic_drill" && selectedTopic);
  const stats = profile?.stats;
  const lastEntry = (stats?.score_history || []).slice(-1)[0];

  return (
    <div className="ts-page">
      <div className="ts-container flex flex-col gap-7 md:gap-8">
        <section className="glass-card relative overflow-hidden rounded-[2rem] px-5 py-7 md:px-9 md:py-10 lg:px-12 lg:py-12">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(59,130,246,0.12),transparent_42%),radial-gradient(circle_at_84%_12%,rgba(45,212,191,0.12),transparent_30%)]" />
          <div className="relative grid gap-9 lg:grid-cols-[1.18fr_0.82fr] lg:items-center">
            <div>
              <div className="ts-kicker">Phase 1 · Minimal workspace</div>
              <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-[-0.04em] text-text md:text-6xl md:leading-[1.02]">
                AI 模拟面试，
                <span className="block bg-gradient-to-r from-accent-light via-teal to-text bg-clip-text text-transparent">越练越强。</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-dim md:text-lg">
                TechSpar 把简历模拟、专项强化、知识沉淀和成长画像收束到一个安静的训练工作台。界面少一点噪音，复盘多一点确定性。
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <button className="ts-btn ts-btn-primary" onClick={() => setMode("resume")} type="button">
                  开始简历模拟
                  <span aria-hidden="true">→</span>
                </button>
                <button className="ts-btn ts-btn-secondary" onClick={() => setMode("topic_drill")} type="button">
                  选择专项训练
                </button>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="soft-panel rounded-[1.5rem] p-5">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Training snapshot</div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-2xl bg-hover/60 px-3 py-4">
                    <div className="text-2xl font-bold text-accent-light">{stats?.total_sessions || 0}</div>
                    <div className="mt-1 text-xs text-muted">总练习</div>
                  </div>
                  <div className="rounded-2xl bg-hover/60 px-3 py-4">
                    <div className="text-2xl font-bold text-green">{stats?.avg_score || "-"}</div>
                    <div className="mt-1 text-xs text-muted">平均分</div>
                  </div>
                  <div className="rounded-2xl bg-hover/60 px-3 py-4">
                    <div className="text-2xl font-bold text-orange">{lastEntry?.avg_score || "-"}</div>
                    <div className="mt-1 text-xs text-muted">最近</div>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {CAPABILITIES.map((item) => (
                  <div key={item.title} className="soft-panel rounded-[1.25rem] p-4">
                    <div className="text-sm font-semibold text-text">{item.title}</div>
                    <div className="mt-1 text-xs leading-6 text-dim">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <button
            className={`group glass-card rounded-[1.75rem] p-6 text-left ${
              mode === "resume" ? "ring-2 ring-accent/55" : "hover:-translate-y-1"
            }`}
            onClick={() => { setMode("resume"); setSelectedTopic(null); }}
            type="button"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="ts-kicker">Resume interview</div>
                <div className="mt-5 text-2xl font-bold tracking-tight text-text">简历模拟面试</div>
                <div className="mt-3 max-w-xl text-sm leading-7 text-dim">
                  上传 PDF 简历后，AI 按真实面试路径推进：自我介绍、项目深挖、技术追问和综合复盘。
                </div>
              </div>
              <span className="rounded-full border border-border bg-surface px-3 py-2 text-sm text-dim group-hover:translate-x-1">→</span>
            </div>
          </button>

          <button
            className={`group glass-card rounded-[1.75rem] p-6 text-left ${
              mode === "topic_drill" ? "ring-2 ring-green/55" : "hover:-translate-y-1"
            }`}
            onClick={() => setMode("topic_drill")}
            type="button"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="ts-kicker border-green/25 bg-green/10 text-green">Focused drill</div>
                <div className="mt-5 text-2xl font-bold tracking-tight text-text">专项强化训练</div>
                <div className="mt-3 max-w-xl text-sm leading-7 text-dim">
                  围绕单个主题集中练习，适合考前冲刺、短板修复和高频面试题快速迭代。
                </div>
              </div>
              <span className="rounded-full border border-border bg-surface px-3 py-2 text-sm text-dim group-hover:translate-x-1">→</span>
            </div>
          </button>
        </section>

        {mode === "resume" && (
          <section className="glass-card rounded-[1.75rem] p-5 md:p-6">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Step 01</div>
                <div className="mt-1 text-xl font-bold text-text">准备你的简历</div>
              </div>
              <div className="text-sm text-dim">仅支持 PDF，建议上传最新版本。</div>
            </div>
            {resumeFile ? (
              <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-xl">📄</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-text">{resumeFile.filename}</div>
                    <div className="text-xs text-muted">{(resumeFile.size / 1024).toFixed(0)} KB · 已就绪</div>
                  </div>
                </div>
                <label className={`ts-btn ts-btn-secondary min-h-10 cursor-pointer px-4 py-2 text-sm ${uploading ? "opacity-40" : ""}`}>
                  {uploading ? "上传中..." : "重新上传"}
                  <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
              </div>
            ) : (
              <label className={`flex cursor-pointer flex-col items-center gap-3 rounded-3xl border border-dashed border-border bg-surface px-5 py-10 text-center hover:border-accent/50 ${uploading ? "opacity-50" : ""}`}>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-hover text-2xl">📄</span>
                <span className="text-base font-semibold text-text">{uploading ? "正在上传..." : "点击上传简历 PDF"}</span>
                <span className="max-w-md text-sm leading-7 text-dim">上传后即可开始完整模拟，系统会根据项目经历和技能栈进行追问。</span>
                <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            )}
          </section>
        )}

        {mode === "topic_drill" && (
          <section className="glass-card rounded-[1.75rem] p-5 md:p-6">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Step 01</div>
                <div className="mt-1 text-xl font-bold text-text">选择训练领域</div>
              </div>
              <div className="text-sm text-dim">选择一个主题，开始更聚焦的专项问答。</div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(topics).map(([key, info]) => (
                <TopicCard
                  key={key}
                  topicKey={key}
                  name={info.name || key}
                  icon={info.icon}
                  selected={selectedTopic === key}
                  onClick={() => setSelectedTopic(key)}
                />
              ))}
            </div>
          </section>
        )}

        {mode && (
          <div className="sticky bottom-4 z-20 mx-auto w-full max-w-3xl">
            <button
              className={`ts-btn ts-btn-primary w-full rounded-2xl py-4 text-base ${!canStart || loading ? "cursor-not-allowed opacity-45" : ""}`}
              disabled={!canStart || loading}
              onClick={handleStart}
              type="button"
            >
              {loading ? "正在初始化面试..." : "开始面试"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
