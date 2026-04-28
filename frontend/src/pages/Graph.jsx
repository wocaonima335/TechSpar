import { useState, useEffect, useRef, useCallback } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { getTopics, getGraphData } from "../api/interview";

const SIMILARITY_THRESHOLD = 0.65;

function scoreToColor(score) {
  if (score >= 8) return "#10b981";
  if (score >= 6) return "#60a5fa";
  if (score >= 4) return "#f59e0b";
  return "#ef4444";
}

export default function Graph() {
  const [topics, setTopics] = useState({});
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);
  const containerRef = useRef(null);
  const fgRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 560 });

  useEffect(() => {
    getTopics().then(setTopics).catch(() => {});
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDimensions({ width, height: Math.max(430, Math.min(width * 0.66, 680)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleSelectTopic = async (key) => {
    setSelectedTopic(key);
    setGraphData(null);
    setLoading(true);
    try {
      const data = await getGraphData(key);
      setGraphData(data);
      setTimeout(() => fgRef.current?.zoomToFit(450, 48), 300);
    } catch {
      setGraphData({ nodes: [], links: [] });
    } finally {
      setLoading(false);
    }
  };

  const paintNode = useCallback((node, ctx) => {
    const r = 5 + (node.difficulty || 3) * 1.25;
    const color = scoreToColor(node.score);
    ctx.shadowColor = color;
    ctx.shadowBlur = hoveredNode === node ? 20 : 8;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (hoveredNode === node) {
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const label = node.focus_area || node.question.slice(0, 20);
      ctx.font = "12px DM Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(label, node.x, node.y - r - 8);
    }
  }, [hoveredNode]);

  const paintLink = useCallback((link, ctx) => {
    const alpha = Math.max(0.08, (link.similarity - SIMILARITY_THRESHOLD) * 3);
    ctx.strokeStyle = `rgba(148, 163, 184, ${alpha})`;
    ctx.lineWidth = 0.5 + link.similarity * 1.45;
    ctx.beginPath();
    ctx.moveTo(link.source.x, link.source.y);
    ctx.lineTo(link.target.x, link.target.y);
    ctx.stroke();
  }, []);

  const topicEntries = Object.entries(topics);
  const nodeCount = graphData?.nodes?.length || 0;
  const linkCount = graphData?.links?.length || 0;

  return (
    <div className="ts-page-wide">
      <div className="ts-page-hero">
        <div>
          <div className="ts-kicker">Phase 2 · Knowledge graph</div>
          <h1 className="ts-page-title">题目图谱</h1>
          <p className="ts-page-subtitle">用节点、颜色和关联线快速定位薄弱知识点。桌面端支持拖拽、缩放和悬浮查看详情。</p>
        </div>
        <div className="ts-stat-grid min-w-[320px]">
          <div className="ts-stat-card text-center"><div className="ts-stat-value">{nodeCount}</div><div className="ts-stat-label">nodes</div></div>
          <div className="ts-stat-card text-center"><div className="ts-stat-value">{linkCount}</div><div className="ts-stat-label">links</div></div>
          <div className="ts-stat-card text-center"><div className="ts-stat-value">{topicEntries.length}</div><div className="ts-stat-label">topics</div></div>
        </div>
      </div>

      <div className="ts-data-card mb-5 p-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {topicEntries.map(([key, info]) => (
            <button key={key} className={`ts-chip shrink-0 ${selectedTopic === key ? "ts-chip-active" : ""}`} onClick={() => handleSelectTopic(key)}>{info.icon} {info.name}</button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="ts-data-card relative overflow-hidden" style={{ minHeight: 430 }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_35%_15%,rgba(59,130,246,0.16),transparent_36%),radial-gradient(circle_at_80%_80%,rgba(45,212,191,0.10),transparent_32%)]" />
        {!selectedTopic && <div className="relative flex h-[430px] items-center justify-center text-sm text-dim">选择一个领域查看题目关联图谱</div>}
        {loading && <div className="relative flex h-[430px] items-center justify-center text-sm text-dim">正在构建图谱...</div>}
        {selectedTopic && !loading && graphData && graphData.nodes.length === 0 && <div className="relative flex h-[430px] items-center justify-center text-sm text-dim">该领域暂无已评分的训练记录</div>}
        {selectedTopic && !loading && graphData && graphData.nodes.length > 0 && (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="transparent"
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={(node, color, ctx) => {
              const r = 5 + (node.difficulty || 3) * 1.2;
              ctx.beginPath(); ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
            }}
            linkCanvasObject={paintLink}
            onNodeHover={setHoveredNode}
            cooldownTicks={80}
            d3AlphaDecay={0.03}
            d3VelocityDecay={0.3}
          />
        )}
        {hoveredNode && (
          <div className="absolute right-4 top-4 z-10 max-w-[320px] rounded-2xl border border-border bg-bg-surface/90 px-4 py-3 text-sm shadow-soft backdrop-blur-xl pointer-events-none animate-fade-in">
            <div className="mb-2 font-semibold leading-snug text-text">{hoveredNode.question}</div>
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-dim">
              <span style={{ color: scoreToColor(hoveredNode.score) }}>{hoveredNode.score}/10</span>
              {hoveredNode.focus_area && <span>{hoveredNode.focus_area}</span>}
              {hoveredNode.date && <span>{hoveredNode.date}</span>}
            </div>
          </div>
        )}
      </div>

      {selectedTopic && graphData && graphData.nodes.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface/60 px-4 py-3 text-[13px] text-dim">
          {[['bg-green','8+'], ['bg-accent-light','6-8'], ['bg-orange','4-6'], ['bg-red','<4']].map(([cls, label]) => <div key={label} className="flex items-center gap-1.5"><span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} /><span>{label}</span></div>)}
          <span className="ml-auto">共 {graphData.nodes.length} 题</span>
        </div>
      )}
    </div>
  );
}
