export default function TopicCard({ topicKey, name, icon, onClick, selected }) {
  return (
    <button
      className={`group flex items-center gap-4 rounded-3xl border p-4 text-left backdrop-blur-xl ${
        selected
          ? "border-accent/60 bg-accent/10 shadow-[0_18px_40px_rgba(37,99,235,0.16)]"
          : "border-border bg-surface hover:-translate-y-0.5 hover:border-accent/40 hover:bg-hover hover:shadow-[0_16px_34px_rgba(2,8,23,0.12)]"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-2xl ${selected ? "border-accent/30 bg-accent/12" : "border-border bg-card group-hover:border-accent/30"}`}>
        {icon || "📝"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-text">{name}</span>
        <span className="mt-1 block truncate text-[11px] font-bold uppercase tracking-[0.18em] text-muted">{topicKey}</span>
      </span>
      <span className="text-dim opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100">→</span>
    </button>
  );
}
