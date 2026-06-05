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
    <div className="flex items-end gap-3 border-t border-cyan-200/10 bg-[#0b1720]/85 px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur-md">
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
        className="max-h-28 flex-1 resize-none overflow-y-auto rounded-2xl border border-cyan-100/15 bg-white/[0.07] px-4 py-2 text-sm text-zinc-100 outline-none placeholder:text-white/35 focus:border-cyan-400"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="rounded-2xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-4 py-2 text-sm font-medium text-white hover:from-emerald-500 hover:to-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? "…" : "Send"}
      </button>
    </div>
  );
}
