// apps/web/src/features/chat/components/MessageBubble.tsx

import { MessageDto } from "../api/messages.api";

interface Props {
  message: MessageDto;
  isOwn: boolean;
  highlighted?: boolean;
  groupedWithPrevious?: boolean;
  senderLabel?: string;
}

export function MessageBubble({
  message,
  isOwn,
  highlighted = false,
  groupedWithPrevious = false,
  senderLabel,
}: Props) {
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
  const attachments = message.attachments ?? [];

  return (
    <div
      className={[
        "flex flex-col",
        groupedWithPrevious ? "mb-1" : "mb-3 mt-2",
        isOwn ? "items-end" : "items-start",
      ].join(" ")}
    >
      {!isOwn && !groupedWithPrevious && senderLabel ? (
        <span className="mb-1 ml-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {senderLabel}
        </span>
      ) : null}
      <div
        className={`max-w-[min(72%,680px)] px-3 py-2 text-sm leading-relaxed break-words rounded-2xl ${
          isOwn
            ? "rounded-br-md bg-gradient-to-br from-emerald-600/95 to-cyan-700/95 text-white shadow-lg shadow-emerald-950/20"
            : "rounded-bl-md border border-cyan-100/10 bg-slate-950/55 text-zinc-100 shadow-lg shadow-black/20 backdrop-blur-md"
        } ${highlighted ? "ring-2 ring-amber-300/80" : ""}`}
      >
        {attachments.length > 0 && (
          <div className="mb-2 space-y-2">
            {attachments.map((attachment) => {
              if (attachment.resourceType === "image") {
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={attachment.id}
                    src={attachment.url}
                    alt=""
                    className="max-h-72 rounded-md object-cover"
                  />
                );
              }

              if (attachment.resourceType === "video") {
                return (
                  <video
                    key={attachment.id}
                    src={attachment.url}
                    controls
                    className="max-h-72 rounded-md"
                  />
                );
              }

              return (
                <a
                  key={attachment.id}
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md border border-white/15 bg-black/15 px-3 py-2 text-xs font-medium underline-offset-2 hover:underline"
                >
                  Download attachment
                </a>
              );
            })}
          </div>
        )}
        {message.text}
      </div>
      {!groupedWithPrevious ? (
        <span className="mt-1 flex items-center gap-1 text-[10px] text-white/30">
          {time}
          {isOwn ? <span className={tickColor}>{ticks}</span> : null}
        </span>
      ) : null}
    </div>
  );
}
