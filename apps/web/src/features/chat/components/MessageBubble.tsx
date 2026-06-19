// apps/web/src/features/chat/components/MessageBubble.tsx

import { useEffect, useRef, useState } from "react";
import type { UserDto } from "@chat/shared";
import {
  MessageDto,
  type MessageReactionEmoji,
  type RpsChoice,
  type TicTacToeCell,
} from "../api/messages.api";

const REACTION_EMOJIS: MessageReactionEmoji[] = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏",
  "🔥",
  "👏",
  "🎉",
  "💯",
  "😎",
  "😭",
  "🤔",
  "👀",
];

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function getAttachmentName(url: string) {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "Attachment");
  } catch {
    return url.split("/").filter(Boolean).pop() ?? "Attachment";
  }
}

function choiceLabel(choice: RpsChoice) {
  return choice === "rock" ? "Rock" : choice === "paper" ? "Paper" : "Scissors";
}

function choiceIcon(choice: RpsChoice) {
  return choice === "rock" ? "✊" : choice === "paper" ? "✋" : "✌";
}

function isGameBotLabel(label?: string) {
  return label?.toLowerCase() === "gamebot";
}

function SenderAvatar({
  avatarUrl,
  label,
  hidden,
}: {
  avatarUrl?: string | undefined;
  label: string;
  hidden?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <div
      className={`${hidden ? "invisible" : ""} mt-1 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-sm font-bold text-white ring-1 ring-white/10 shadow-lg shadow-black/20 transition group-hover/message:ring-white/20`}
    >
      {avatarUrl && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        label
      )}
    </div>
  );
}

interface Props {
  message: MessageDto;
  isOwn: boolean;
  highlighted?: boolean;
  groupedWithPrevious?: boolean;
  groupedWithNext?: boolean;
  senderLabel?: string;
  senderUser?: UserDto;
  currentUserId: string;
  onReact?: (messageId: string, emoji: MessageReactionEmoji) => void;
  onEdit?: (messageId: string, text: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: (message: MessageDto) => void;
  onRetry?: (message: MessageDto) => void;
  onCopy?: (text: string) => void;
  onPreviewImage?: (image: {
    url: string;
    name: string;
    size: string;
  }) => void;
  onGameAction?: (
    messageId: string,
    action:
      | { action: "choose"; choice: RpsChoice }
      | { action: "place"; cell: TicTacToeCell },
  ) => void;
  playerLabels?: Record<string, string>;
  replyToLabel?: string;
  reactionPending?: boolean;
  editing?: boolean;
  deleting?: boolean;
}

export function MessageBubble({
  message,
  isOwn,
  highlighted = false,
  groupedWithPrevious = false,
  groupedWithNext = false,
  senderLabel,
  senderUser,
  currentUserId,
  onReact,
  onEdit,
  onDelete,
  onReply,
  onRetry,
  onCopy,
  onPreviewImage,
  onGameAction,
  playerLabels = {},
  replyToLabel,
  reactionPending = false,
  editing = false,
  deleting = false,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.text ?? "");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const localStatus = message.receiptStatus;
  const isSending = localStatus === "sending";
  const isFailed = localStatus === "failed";
  const ticks =
    isFailed
      ? "!"
      : isSending
        ? "..."
        : localStatus === "seen"
          ? "✓✓"
          : localStatus === "delivered"
            ? "✓✓"
            : "✓";
  const tickColor = isFailed
    ? "text-red-200"
    : isSending
      ? "text-white/35"
      : localStatus === "seen"
        ? "text-sky-300"
        : "text-white/45";
  const attachments = message.attachments ?? [];
  const hasAttachments = attachments.length > 0;
  const avatarLabel = senderLabel?.slice(0, 1).toUpperCase() || "M";
  const reactions = message.reactions ?? [];
  const currentUserReaction = reactions.find((reaction) =>
    reaction.userIds.includes(currentUserId),
  )?.emoji;
  const canEdit =
    isOwn &&
    !isSending &&
    !isFailed &&
    message.contentType === "text" &&
    !message.deletedAt &&
    Boolean(onEdit) &&
    !message.id.startsWith("demo-");
  const canDelete =
    isOwn &&
    !isSending &&
    !isFailed &&
    !message.deletedAt &&
    Boolean(onDelete) &&
    !message.id.startsWith("demo-");
  const canReply =
    !isSending &&
    !isFailed &&
    !message.deletedAt &&
    message.contentType !== "system" &&
    Boolean(onReply) &&
    !message.id.startsWith("demo-");
  const canRetry =
    isOwn &&
    isFailed &&
    message.contentType === "text" &&
    Boolean(onRetry);
  const canCopy = Boolean(message.text?.trim()) && Boolean(onCopy);
  const quotePreview = message.replyTo?.deletedAt
    ? "This message was deleted"
    : message.replyTo?.contentType === "attachment"
      ? (message.replyTo.text ?? "Attachment")
      : (message.replyTo?.text ?? "Message");

  const getPlayerLabel = (userId: string) =>
    userId === currentUserId ? "You" : (playerLabels[userId] ?? `Player ${userId.slice(0, 4)}`);
  const messageSpacing = groupedWithNext
    ? "mb-1"
    : groupedWithPrevious
      ? "mb-2"
      : "mb-3 mt-1";
  const bubbleShapeClass = isOwn
    ? [
        groupedWithPrevious ? "rounded-tr-[6px]" : "",
        groupedWithNext ? "rounded-br-[6px]" : "rounded-br-[5px]",
      ].join(" ")
    : [
        groupedWithPrevious ? "rounded-tl-[6px]" : "",
        groupedWithNext ? "rounded-bl-[6px]" : "rounded-bl-[5px]",
      ].join(" ");

  useEffect(() => {
    if (!isEditing) {
      setEditValue(message.text ?? "");
    }
  }, [isEditing, message.text]);

  useEffect(() => {
    if (isEditing) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const saveEdit = () => {
    const trimmedValue = editValue.trim();

    if (!trimmedValue || trimmedValue === (message.text ?? "").trim()) {
      setIsEditing(false);
      setEditValue(message.text ?? "");
      return;
    }

    onEdit?.(message.id, trimmedValue);
    setIsEditing(false);
  };

  const deleteCurrentMessage = () => {
    if (!window.confirm("Delete this message for everyone?")) {
      return;
    }

    onDelete?.(message.id);
  };

  const openContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(canReply || canCopy || canEdit || canDelete || canRetry)) {
      return;
    }

    event.preventDefault();
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 180),
      y: Math.min(event.clientY, window.innerHeight - 240),
    });
  };

  const runMenuAction = (action: () => void) => {
    setContextMenu(null);
    action();
  };

  if (
    message.contentType === "text" &&
    !message.deletedAt &&
    !isOwn &&
    isGameBotLabel(senderLabel)
  ) {
    const lines = (message.text ?? "").split("\n").filter(Boolean);
    const title = lines[0] ?? "GameBot";
    const details = lines.slice(1);

    return (
      <div
        className={`my-4 flex justify-start ${
          highlighted ? "rounded-2xl ring-2 ring-amber-300/80" : ""
        }`}
      >
        <div className="w-[min(92%,390px)] overflow-hidden rounded-3xl border border-cyan-300/20 bg-[#141b24] shadow-2xl shadow-black/25">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-cyan-500/10 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200">
                GameBot
              </p>
              <h3 className="mt-1 truncate text-base font-black text-white">
                {title}
              </h3>
            </div>
            <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-100">
              Bot
            </span>
          </div>

          {details.length > 0 ? (
            <div className="space-y-2 p-4">
              {details.map((line) => {
                const isCommand = line.startsWith("/");
                const [command, ...description] = line.split(" - ");

                return (
                  <div
                    key={line}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm"
                  >
                    <span
                      className={`min-w-0 truncate ${
                        isCommand
                          ? "font-mono text-cyan-100"
                          : "font-semibold text-slate-200"
                      }`}
                    >
                      {command}
                    </span>
                    {description.length > 0 ? (
                      <span className="shrink-0 text-xs text-slate-400">
                        {description.join(" - ")}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="flex items-center justify-end border-t border-white/10 px-4 py-2 text-[11px] text-slate-500">
            {time}
          </div>
        </div>
      </div>
    );
  }

  if (message.contentType === "game" && message.gameData?.kind === "rps") {
    const game = message.gameData;
    const choiceEntries = Object.entries(game.choices);
    const currentChoice = game.choices[currentUserId]?.choice;
    const isFinished = game.status === "finished";
    const playedCount = choiceEntries.length;
    const resultLabel =
      game.result?.status === "tie"
        ? "Tie round. Both players picked the same move."
        : game.result?.status === "winner" && game.result.winnerUserId
          ? `${getPlayerLabel(game.result.winnerUserId)} wins the round.`
          : playedCount === 0
            ? "Choose a move. Your opponent will not see it until the reveal."
            : playedCount === 1
              ? "One move locked. Waiting for the second player."
              : "Revealing result.";

    return (
      <div
        className={`my-4 flex ${isOwn ? "justify-end" : "justify-start"} ${
          highlighted ? "rounded-2xl ring-2 ring-amber-300/80" : ""
        }`}
      >
        <div className="w-[min(92%,420px)] overflow-hidden rounded-3xl border border-emerald-300/20 bg-[#141d20] shadow-2xl shadow-black/30">
          <div className="border-b border-white/10 bg-emerald-500/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-200">
                  GameBot
                </p>
                <h3 className="mt-1 truncate text-lg font-black text-white">
                  Rock Paper Scissors
                </h3>
              </div>
              <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-100">
                {isFinished ? "Finished" : `${playedCount}/2`}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">{resultLabel}</p>
          </div>

          <div className="space-y-3 p-4">
            <div className="grid grid-cols-3 gap-2">
              {(["rock", "paper", "scissors"] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() =>
                    onGameAction?.(message.id, { action: "choose", choice })
                  }
                  disabled={isFinished || !onGameAction}
                  className={`rounded-2xl border px-3 py-3 text-center transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    currentChoice === choice
                      ? "border-emerald-300/50 bg-emerald-500/20 text-emerald-50"
                      : "border-white/10 bg-white/[0.045] text-slate-100 hover:border-emerald-300/30 hover:bg-emerald-500/10"
                  }`}
                >
                  <span className="block text-xl">{choiceIcon(choice)}</span>
                  <span className="mt-1 block text-xs font-bold">
                    {choiceLabel(choice)}
                  </span>
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2">
              {choiceEntries.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No moves locked yet.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {choiceEntries.map(([userId, value]) => (
                    <div
                      key={userId}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="truncate font-semibold text-slate-200">
                        {getPlayerLabel(userId)}
                      </span>
                      <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-slate-300">
                        {isFinished || userId === currentUserId
                          ? `${choiceIcon(value.choice)} ${choiceLabel(value.choice)}`
                          : "Move locked"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[11px] text-slate-500">
            <span>{isFinished ? "Result posted" : "Waiting for moves"}</span>
            <span>{time}</span>
          </div>
        </div>
      </div>
    );
  }

  if (
    message.contentType === "game" &&
    message.gameData?.kind === "tic-tac-toe"
  ) {
    const game = message.gameData;
    const isFinished = game.status === "finished";
    const currentMark =
      game.players.x === currentUserId
        ? "x"
        : game.players.o === currentUserId
          ? "o"
          : undefined;
    const currentTurnUserId = game.players[game.nextTurn];
    const winningCells = new Set(game.result?.winningCells ?? []);
    const openMark = !game.players.x ? "X" : !game.players.o ? "O" : null;
    const resultLabel =
      game.result?.status === "tie"
        ? "Draw. No winning line this time."
        : game.result?.status === "winner" && game.result.winnerUserId
          ? `${getPlayerLabel(game.result.winnerUserId)} completed a line.`
          : currentTurnUserId
            ? `${getPlayerLabel(currentTurnUserId)} to move.`
            : openMark
              ? `Tap any cell to join as ${openMark}.`
              : "Waiting for the next move.";
    const hasSeat = Boolean(currentMark || !game.players.x || !game.players.o);
    const canPlay =
      Boolean(onGameAction) &&
      !isFinished &&
      hasSeat &&
      (!currentMark || currentMark === game.nextTurn);

    return (
      <div
        className={`my-4 flex ${isOwn ? "justify-end" : "justify-start"} ${
          highlighted ? "rounded-2xl ring-2 ring-amber-300/80" : ""
        }`}
      >
        <div className="w-[min(92%,390px)] overflow-hidden rounded-3xl border border-cyan-300/20 bg-[#141b24] shadow-2xl shadow-black/30">
          <div className="border-b border-white/10 bg-cyan-500/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200">
                  GameBot
                </p>
                <h3 className="mt-1 truncate text-lg font-black text-white">
                  Tic Tac Toe
                </h3>
              </div>
              <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-100">
                {isFinished ? "Finished" : `${game.nextTurn.toUpperCase()} turn`}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">{resultLabel}</p>
          </div>

          <div className="space-y-3 p-4">
            <div className="grid grid-cols-3 gap-2">
              {game.board.map((mark, index) => {
                const cell = index as TicTacToeCell;
                const isWinningCell = winningCells.has(cell);

                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() =>
                      onGameAction?.(message.id, { action: "place", cell })
                    }
                    disabled={!canPlay || Boolean(mark)}
                    className={`flex aspect-square items-center justify-center rounded-2xl border text-3xl font-black transition disabled:cursor-not-allowed ${
                      isWinningCell
                        ? "border-emerald-300/60 bg-emerald-500/20 text-emerald-100"
                        : mark
                          ? "border-white/10 bg-white/[0.06] text-white"
                          : "border-white/10 bg-white/[0.035] text-slate-500 hover:border-cyan-300/40 hover:bg-cyan-500/10 hover:text-cyan-100 disabled:opacity-60"
                    }`}
                  >
                    {mark ? mark.toUpperCase() : ""}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2">
                <p className="font-bold uppercase tracking-wide text-slate-500">
                  X
                </p>
                <p className="mt-1 truncate font-semibold text-slate-200">
                  {game.players.x ? getPlayerLabel(game.players.x) : "Open"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2">
                <p className="font-bold uppercase tracking-wide text-slate-500">
                  O
                </p>
                <p className="mt-1 truncate font-semibold text-slate-200">
                  {game.players.o ? getPlayerLabel(game.players.o) : "Open"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[11px] text-slate-500">
            <span>{isFinished ? "Result posted" : "Board is live"}</span>
            <span>{time}</span>
          </div>
        </div>
      </div>
    );
  }

  if (message.contentType === "system") {
    return (
      <div
        className={`my-4 flex justify-center ${
          highlighted ? "rounded-2xl ring-2 ring-amber-300/80" : ""
        }`}
      >
        <div className="inline-flex max-w-[85%] items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-center text-[11px] font-semibold text-slate-300 shadow-lg shadow-black/15 md:max-w-[70%]">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-emerald-300"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          >
            <path d="m16 13 5 3V8l-5 3" />
            <rect x="3" y="6" width="13" height="12" rx="2" />
          </svg>
          <span className="min-w-0 break-words">{message.text}</span>
          <span className="shrink-0 text-slate-500">{time}</span>
        </div>
      </div>
    );
  }

  if (message.deletedAt) {
    return (
      <div
        className={[
          "group/message flex",
          messageSpacing,
          isOwn ? "justify-end" : "justify-start",
        ].join(" ")}
      >
        <div
          className={`flex max-w-[85%] gap-3 md:max-w-[70%] ${
            isOwn ? "flex-row-reverse" : ""
          }`}
        >
        {!isOwn ? (
            <SenderAvatar
              avatarUrl={senderUser?.avatarUrl}
              label={avatarLabel}
              hidden={groupedWithPrevious}
            />
          ) : null}

          <div className={`flex min-w-0 flex-col ${isOwn ? "items-end" : "items-start"}`}>
            {!isOwn && !groupedWithPrevious && senderLabel ? (
              <span className="mb-1.5 ml-1 text-xs font-bold text-cyan-400">
                {senderLabel}
              </span>
            ) : null}
            <div
              className={`rounded-[16px] border border-dashed px-4 py-2.5 text-sm italic leading-6 shadow-lg ${bubbleShapeClass} ${
                isOwn
                  ? "border-emerald-200/30 bg-emerald-500/20 text-emerald-50/85"
                  : "border-white/10 bg-[#23262e]/70 text-slate-300"
              } ${highlighted ? "ring-2 ring-amber-300/80" : ""}`}
            >
              This message was deleted
            </div>
            {!groupedWithPrevious ? (
              <span className="mt-1.5 flex items-center gap-1 px-1 text-[11px] text-slate-500">
                {time}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onContextMenu={openContextMenu}
      className={[
        "group/message flex rounded-3xl px-1 transition-colors duration-200 hover:bg-white/[0.012]",
        messageSpacing,
        isOwn ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <div className={`flex max-w-[85%] gap-3 md:max-w-[70%] ${isOwn ? "flex-row-reverse" : ""}`}>
        {!isOwn ? (
          <SenderAvatar
            avatarUrl={senderUser?.avatarUrl}
            label={avatarLabel}
            hidden={groupedWithPrevious}
          />
        ) : null}

        <div className={`relative flex min-w-0 flex-col ${isOwn ? "items-end" : "items-start"}`}>
          {!isOwn && !groupedWithPrevious && senderLabel ? (
            <span className="mb-1.5 ml-1 text-xs font-bold text-cyan-400">
              {senderLabel}
            </span>
          ) : null}
          <div
            className={`relative overflow-hidden break-words rounded-[16px] px-3.5 py-2.5 text-[15px] leading-6 shadow-lg ring-1 transition duration-200 group-hover/message:-translate-y-0.5 group-hover/message:shadow-2xl ${bubbleShapeClass} ${
              isOwn && hasAttachments
                ? "bg-[#1f242d]/95 text-white shadow-black/25 ring-emerald-300/20 group-hover/message:bg-[#242a34] group-hover/message:ring-emerald-300/30"
                : isOwn
                ? "bg-[#18352e]/95 text-emerald-50 shadow-black/25 ring-emerald-300/20 group-hover/message:bg-[#1c4037] group-hover/message:ring-emerald-300/30"
                : "bg-[#23262e]/95 text-white shadow-black/25 ring-white/5 backdrop-blur group-hover/message:bg-[#282c35] group-hover/message:ring-white/12"
            } ${highlighted ? "ring-2 ring-amber-300/80" : ""}`}
          >
            <span
              className={`pointer-events-none absolute inset-x-0 top-0 h-px ${
                isOwn && hasAttachments
                  ? "bg-emerald-300/30"
                  : isOwn
                    ? "bg-emerald-300/25"
                    : "bg-white/10"
              }`}
            />
            {message.replyTo ? (
              <div
                className={`mb-2 overflow-hidden rounded-[12px] border px-2.5 py-2 shadow-inner shadow-black/10 ${
                  isOwn
                    ? "border-white/10 bg-emerald-950/20"
                    : "border-white/10 bg-black/15"
                }`}
              >
                <div className="flex gap-2">
                  <span className="mt-0.5 h-9 w-1 shrink-0 rounded-full bg-emerald-200/80" />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-black uppercase tracking-wide text-emerald-100/90">
                      {replyToLabel ?? "Message"}
                    </span>
                    <span className="mt-0.5 block truncate text-xs leading-5 text-white/70">
                      {quotePreview}
                    </span>
                  </span>
                </div>
              </div>
            ) : null}
            {attachments.length > 0 && (
              <div className="mb-2.5 space-y-2">
                {attachments.map((attachment) => {
                  const attachmentName = getAttachmentName(attachment.url);
                  const attachmentSize = formatBytes(attachment.bytes);

                  if (attachment.resourceType === "image") {
                    return (
                      <button
                        key={attachment.id}
                        type="button"
                        onClick={() =>
                          onPreviewImage?.({
                            url: attachment.url,
                            name: attachmentName,
                            size: attachmentSize,
                          })
                        }
                        className="group/attachment relative block overflow-hidden rounded-2xl border border-white/10 bg-black/15 shadow-lg shadow-black/15 transition hover:border-white/20"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={attachment.url}
                          alt=""
                          className="max-h-80 w-full object-cover transition duration-200 group-hover/attachment:scale-[1.01]"
                        />
                        <span className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/45 px-2 py-1 text-[10px] font-bold text-white/80 opacity-0 backdrop-blur transition group-hover/attachment:opacity-100">
                          Open
                        </span>
                        <span className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#151a22]/95 px-3 py-2 text-left text-[11px] text-slate-300">
                          <span className="truncate">Image attachment</span>
                          <span className="shrink-0">{attachmentSize}</span>
                        </span>
                      </button>
                    );
                  }

                  if (attachment.resourceType === "video") {
                    return (
                      <div
                        key={attachment.id}
                        className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                      >
                        <video
                          src={attachment.url}
                          controls
                          className="max-h-80 w-full bg-black"
                        />
                        <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-white/65">
                          <span className="truncate">Video attachment</span>
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 font-bold text-emerald-100 hover:underline"
                          >
                            Open
                          </a>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <a
                      key={attachment.id}
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-black/15 px-3 py-3 text-left shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:border-emerald-300/25 hover:bg-black/25"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-emerald-100">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                          <path d="M12 18v-6" />
                          <path d="m9 15 3 3 3-3" />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-white/90">
                          {attachmentName}
                        </span>
                        <span className="mt-1 block text-[11px] text-white/50">
                          {attachment.mimeType || "File"}{attachmentSize ? ` - ${attachmentSize}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-100">
                        Download
                      </span>
                    </a>
                  );
                })}
              </div>
            )}
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  ref={editRef}
                  value={editValue}
                  rows={2}
                  onChange={(event) => setEditValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      saveEdit();
                    }

                    if (event.key === "Escape") {
                      setIsEditing(false);
                      setEditValue(message.text ?? "");
                    }
                  }}
                  className="min-h-20 w-full resize-none rounded-2xl border border-white/15 bg-black/15 px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/45 focus:border-white/35"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditValue(message.text ?? "");
                    }}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/80 transition hover:bg-white/15"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={editing}
                    className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <span className="whitespace-pre-wrap">{message.text}</span>
            )}
            {!groupedWithPrevious ? (
              <span
                className={`ml-2 inline-flex translate-y-1 items-center gap-1 align-baseline text-[11px] leading-none ${
                  isOwn ? "text-emerald-50/75" : "text-slate-400"
                }`}
              >
                {isFailed ? "Failed" : isSending ? "Sending" : time}
                {message.editedAt ? <span>edited</span> : null}
                {isOwn ? <span className={tickColor}>{ticks}</span> : null}
              </span>
            ) : null}
          </div>

          {canRetry ? (
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={() => onRetry?.(message)}
                className="rounded-full border border-red-300/25 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-100 transition hover:bg-red-500/20"
              >
                Retry
              </button>
            </div>
          ) : null}

          {reactions.length > 0 ? (
            <div
              className={`mt-1.5 flex flex-wrap gap-1.5 ${
                isOwn ? "justify-end" : "justify-start"
              }`}
            >
              {reactions.map((reaction) => {
                const reactedByCurrentUser =
                  currentUserReaction === reaction.emoji;

                return (
                  <button
                  key={reaction.emoji}
                  type="button"
                  disabled={reactionPending}
                  onClick={() => onReact?.(message.id, reaction.emoji)}
                  className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs leading-none shadow-lg shadow-black/10 backdrop-blur transition hover:-translate-y-0.5 ${
                    reactedByCurrentUser
                      ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-100"
                      : "border-white/10 bg-[#20232b] text-slate-200 hover:border-white/20 hover:bg-[#2a2d36]"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                    title={
                      reactedByCurrentUser
                        ? "Click to remove your reaction"
                        : "React"
                    }
                  >
                    <span>{reaction.emoji}</span>
                    <span className="text-[11px] font-semibold text-slate-300">
                      {reaction.count}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {onReact ? (
            <div
              className={`pointer-events-auto relative mt-1.5 flex gap-1.5 opacity-100 transition sm:pointer-events-none sm:absolute sm:top-1/2 sm:mt-0 sm:-translate-y-1/2 sm:opacity-0 sm:group-hover/message:pointer-events-auto sm:group-hover/message:opacity-100 sm:group-focus-within/message:pointer-events-auto sm:group-focus-within/message:opacity-100 ${
                isOwn ? "self-end sm:right-full sm:mr-2" : "self-start sm:left-full sm:ml-2"
              }`}
            >
              <button
                type="button"
                className="peer flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#20232b]/95 text-slate-400 shadow-lg shadow-black/20 backdrop-blur transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#2a2d36] hover:text-slate-100"
                title="Add reaction"
                aria-label="Add reaction"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <path d="M9 9h.01" />
                  <path d="M15 9h.01" />
                  <path d="M19 5v4" />
                  <path d="M21 7h-4" />
                </svg>
              </button>

              <div
                className={`absolute bottom-9 z-20 hidden w-56 rounded-2xl border border-white/10 bg-[#20232b]/95 p-2 shadow-2xl shadow-black/40 backdrop-blur peer-hover:block hover:block peer-focus:block focus-within:block ${
                  isOwn ? "right-0" : "left-0"
                }`}
              >
                <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  React
                </p>
                <div className="grid grid-cols-7 gap-1">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      disabled={reactionPending}
                      onClick={() => onReact(message.id, emoji)}
                      className={`flex h-8 w-8 items-center justify-center rounded-xl text-base transition hover:scale-110 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 ${
                        currentUserReaction === emoji
                          ? "bg-emerald-500/25 ring-1 ring-emerald-300/30"
                          : ""
                      }`}
                      title={
                        currentUserReaction === emoji
                          ? "Remove reaction"
                          : `React ${emoji}`
                      }
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          ) : null}
        </div>
      </div>
      {contextMenu ? (
        <div
          className="fixed z-50 w-44 overflow-hidden rounded-2xl border border-white/10 bg-[#20232b]/95 p-1 text-sm shadow-2xl shadow-black/50 backdrop-blur"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {canReply ? (
            <button
              type="button"
              onClick={() => runMenuAction(() => onReply?.(message))}
              className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Reply
            </button>
          ) : null}
          {canRetry ? (
            <button
              type="button"
              onClick={() => runMenuAction(() => onRetry?.(message))}
              className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-100 transition hover:bg-red-500/10"
            >
              Retry send
            </button>
          ) : null}
          {canCopy ? (
            <button
              type="button"
              onClick={() =>
                runMenuAction(() => onCopy?.(message.text?.trim() ?? ""))
              }
              className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Copy
            </button>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              disabled={editing}
              onClick={() => runMenuAction(() => setIsEditing(true))}
              className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              disabled={deleting}
              onClick={() => runMenuAction(deleteCurrentMessage)}
              className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
