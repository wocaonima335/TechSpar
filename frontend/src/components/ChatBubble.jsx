import ReactMarkdown from "react-markdown";

export default function ChatBubble({ role, content }) {
  if (role === "user") {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[86%] rounded-[1.25rem] rounded-tr-md border border-accent/30 bg-gradient-to-br from-accent to-accent-light px-4 py-3 text-[15px] leading-[1.75] text-white shadow-[0_18px_42px_rgba(37,99,235,0.22)] md:max-w-[72%] whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-dim">
        <span className="h-1.5 w-1.5 rounded-full bg-teal" />
        Interviewer
      </div>
      <div className="ts-data-card px-4 py-4 text-[15px] leading-[1.85] text-text md:px-5">
        <div className="md-content">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
