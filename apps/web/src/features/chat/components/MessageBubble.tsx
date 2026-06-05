// apps/web/src/features/chat/components/MessageBubble.tsx

import { MessageDto } from "../api/messages.api";

interface Props {
  message: MessageDto;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: Props) {
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const ticks =
    message.receiptStatus === "seen"
      ? "✓✓"
      : message.receiptStatus === "delivered"
        ? "✓✓"
        : "✓";
  const tickColor =
    message.receiptStatus === "seen" ? "text-sky-300" : "text-white/45";

  return (
    <div className={`flex flex-col mb-2 ${isOwn ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[70%] px-3 py-2 text-sm leading-relaxed break-words rounded-2xl ${
          isOwn
            ? "rounded-br-sm bg-gradient-to-br from-emerald-600/95 to-cyan-700/95 text-white shadow-lg shadow-emerald-950/20"
            : "rounded-bl-sm border border-cyan-100/10 bg-slate-950/45 text-zinc-100 shadow-lg shadow-black/20 backdrop-blur-md"
        }`}
      >
        {message.text}
      </div>
      <span className="mt-1 flex items-center gap-1 text-[10px] text-white/30">
        {time}
        {isOwn ? <span className={tickColor}>{ticks}</span> : null}
      </span>
    </div>
  );
}
