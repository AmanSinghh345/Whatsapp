// apps/web/src/features/chat/components/MessageBubble.tsx

import type { UserDto } from "@chat/shared";
import { MessageDto } from "../api/messages.api";

interface Props {
  message: MessageDto;
  isOwn: boolean;
  highlighted?: boolean;
  groupedWithPrevious?: boolean;
  senderLabel?: string;
  senderUser?: UserDto;
}

export function MessageBubble({
  message,
  isOwn,
  highlighted = false,
  groupedWithPrevious = false,
  senderLabel,
  senderUser,
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
  const avatarLabel = senderLabel?.slice(0, 1).toUpperCase() || "M";

  return (
    <div
      className={[
        "flex",
        groupedWithPrevious ? "mb-1" : "mb-5 mt-1",
        isOwn ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <div className={`flex max-w-[min(86%,760px)] gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
        {!isOwn ? (
          <div className={`${groupedWithPrevious ? "invisible" : ""} mt-1 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-sm font-bold text-white ring-1 ring-white/10`}>
            {senderUser?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={senderUser.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              avatarLabel
            )}
          </div>
        ) : null}

        <div className={`flex min-w-0 flex-col ${isOwn ? "items-end" : "items-start"}`}>
          {!isOwn && !groupedWithPrevious && senderLabel ? (
            <span className="mb-1.5 ml-1 text-xs font-bold text-cyan-400">
              {senderLabel}
            </span>
          ) : null}
          <div
            className={`break-words rounded-[22px] px-5 py-4 text-[15px] leading-7 shadow-lg ${
              isOwn
                ? "rounded-br-md bg-emerald-500 text-white shadow-emerald-950/20"
                : "rounded-bl-md border border-white/5 bg-[#23262e] text-white shadow-black/25"
            } ${highlighted ? "ring-2 ring-amber-300/80" : ""}`}
          >
            {attachments.length > 0 && (
              <div className="mb-3 space-y-2">
                {attachments.map((attachment) => {
                  if (attachment.resourceType === "image") {
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={attachment.id}
                        src={attachment.url}
                        alt=""
                        className="max-h-80 rounded-2xl object-cover"
                      />
                    );
                  }

                  if (attachment.resourceType === "video") {
                    return (
                      <video
                        key={attachment.id}
                        src={attachment.url}
                        controls
                        className="max-h-80 rounded-2xl"
                      />
                    );
                  }

                  return (
                    <a
                      key={attachment.id}
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-white/15 bg-black/15 px-3 py-2 text-xs font-medium underline-offset-2 hover:underline"
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
            <span className="mt-2 flex items-center gap-1 px-1 text-[11px] text-slate-400">
              {time}
              {isOwn ? <span className={tickColor}>{ticks}</span> : null}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
