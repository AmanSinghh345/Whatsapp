"use client";

export function SentryTestButton() {
  return (
    <button
      type="button"
      onClick={() => {
        throw new Error("Sentry frontend test error");
      }}
      className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-400"
    >
      Trigger frontend Sentry error
    </button>
  );
}
