export function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-400">
      <div className="flex h-8 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.2s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.1s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300" />
      </div>
      <span>typing</span>
    </div>
  );
}
