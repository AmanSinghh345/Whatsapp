"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";

interface MessageComposerProps {
  onSend: (text: string) => void;
  onAttach?: ((file: File) => void) | undefined;
  onKeyStroke?: (() => void) | undefined;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
}

export function MessageComposer({
  onSend,
  onAttach,
  onKeyStroke,
  disabled = false,
  placeholder = "Message this conversation",
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
    if (!file || disabled) return;

    onAttach?.(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="sticky bottom-0 border-t border-white/10 bg-[#101722]/90 px-3 py-3 shadow-2xl shadow-black/35 backdrop-blur-xl sm:px-5">
      <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 transition focus-within:border-cyan-300/45 focus-within:bg-black/30">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => handleFileChange(event.target.files?.[0])}
          disabled={disabled}
        />

        <button
          type="button"
          aria-label="Attach file"
          title="Attach file"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-slate-400 transition hover:bg-white/[0.07] hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          +
        </button>

        <button
          type="button"
          aria-label="Add emoji"
          title="Add emoji"
          disabled={disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-slate-400 transition hover:bg-white/[0.07] hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          :)
        </button>

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
          className="max-h-36 min-h-10 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-2 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500"
        />

        <button
          type="button"
          aria-label="Send message"
          title="Send message"
          onClick={handleSend}
          disabled={!canSend}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-slate-600"
        >
          &gt;
        </button>
      </div>
    </div>
  );
}
