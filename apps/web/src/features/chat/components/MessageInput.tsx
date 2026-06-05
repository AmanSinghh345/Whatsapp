"use client";

import { useState, KeyboardEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  onKeyStroke?: () => void;   // ← add this
  disabled?: boolean;
}

export function MessageInput({ onSend, onKeyStroke, disabled }: Props) {
  const [value, setValue] = useState("");

  const handleSend = () => {
    if (!value.trim()) return;
    onSend(value);
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    onKeyStroke?.();  // ← emit typing on every keystroke
  };

  return (
    <div className="flex items-end gap-2 border-t border-white/10 bg-zinc-900 px-4 py-3">
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onKeyStroke?.();   // ← also emit on paste/autocomplete
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Type a message…"
        rows={1}
        className="flex-1 resize-none rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-zinc-100 placeholder:text-white/30 outline-none focus:border-emerald-500 max-h-28 overflow-y-auto"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? "…" : "Send"}
      </button>
    </div>
  );
}