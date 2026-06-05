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

  return (
    <div className={`flex flex-col mb-2 ${isOwn ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[70%] px-3 py-2 text-sm leading-relaxed break-words rounded-2xl ${
          isOwn
            ? "rounded-br-sm bg-emerald-600 text-white"
            : "rounded-bl-sm bg-white/10 text-zinc-100"
        }`}
      >
        {message.text}
      </div>
      <span className="mt-1 text-[10px] text-white/30">{time}</span>
    </div>
  );
}