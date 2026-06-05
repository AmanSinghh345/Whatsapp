export function TypingBubble() {
  return (
    <div className="flex items-end gap-2 mb-2">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white/10 px-4 py-3">
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