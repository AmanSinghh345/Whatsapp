export function TypingBubble() {
  return (
    <div className="mb-2 flex items-end gap-2">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-cyan-100/10 bg-slate-950/45 px-4 py-3 shadow-lg shadow-black/20 backdrop-blur-md">
        <span
          className="h-2 w-2 rounded-full bg-white/50 animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-2 w-2 rounded-full bg-white/50 animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-2 w-2 rounded-full bg-white/50 animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    </div>
  );
}
