"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import type { MessageDto } from "../api/messages.api";

interface MessageComposerProps {
  onSend: (text: string) => void;
  onAttach?: ((file: File) => void) | undefined;
  onKeyStroke?: (() => void) | undefined;
  replyTo?: MessageDto | null | undefined;
  replyToLabel?: string | undefined;
  onCancelReply?: (() => void) | undefined;
  disabled?: boolean | undefined;
  attachDisabled?: boolean | undefined;
  placeholder?: string | undefined;
}

export function MessageComposer({
  onSend,
  onAttach,
  onKeyStroke,
  replyTo = null,
  replyToLabel,
  onCancelReply,
  disabled = false,
  attachDisabled = disabled,
  placeholder = "Type a message...",
}: MessageComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = value.trim().length > 0 && !disabled;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [value]);

  const handleSend = () => {
    const text = value.trim();
    if (!text || disabled) return;

    onSend(text);
    setValue("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
      return;
    }

    onKeyStroke?.();
  };

  const handleFileChange = (file: File | undefined) => {
    if (!file || attachDisabled) return;

    onAttach?.(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  const replyPreview = replyTo?.deletedAt
    ? "This message was deleted"
    : replyTo?.contentType === "attachment"
      ? (replyTo.text ?? "Attachment")
      : (replyTo?.text ?? "");

  return (
    <div className="shrink-0 border-t border-white/10 bg-[#15171c]/95 px-3 py-3 shadow-2xl shadow-black/35 sm:px-5">
      {replyTo ? (
        <div className="mb-2 flex items-start justify-between gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3.5 py-2.5">
          <div className="min-w-0 border-l-2 border-emerald-300/70 pl-3">
            <p className="truncate text-xs font-bold text-emerald-200">
              Replying to {replyToLabel ?? "message"}
            </p>
            <p className="mt-1 truncate text-sm text-slate-300">
              {replyPreview || "Message"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Cancel reply"
            title="Cancel reply"
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
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      ) : null}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => handleFileChange(event.target.files?.[0])}
          disabled={attachDisabled}
        />

        <button
          type="button"
          aria-label="Attach file"
          title="Attach file"
          onClick={() => fileInputRef.current?.click()}
          disabled={attachDisabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#20232b] text-slate-400 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 0 1-2.8-2.8l8.9-8.9" />
          </svg>
        </button>

        <div className="flex min-w-0 flex-1 items-center rounded-full border border-white/10 bg-[#20232b] px-4 py-2 transition focus-within:border-emerald-400/50 focus-within:bg-[#242832] sm:px-5">
          <textarea
            ref={textareaRef}
            value={value}
            rows={1}
            onChange={(event) => {
              setValue(event.target.value);
              onKeyStroke?.();
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className="max-h-28 min-h-7 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[15px] leading-6 text-slate-100 outline-none placeholder:text-slate-400 sm:max-h-32"
          />
        </div>

        <button
          type="button"
          aria-label="Send message"
          title="Send message"
          onClick={handleSend}
          disabled={!canSend}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm font-black text-white shadow-lg shadow-emerald-950/25 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-[#20232b] disabled:text-slate-600 disabled:shadow-none"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
