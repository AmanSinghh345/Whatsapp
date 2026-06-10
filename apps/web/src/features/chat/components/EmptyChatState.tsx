interface EmptyChatStateProps {
  title?: string;
  description?: string;
}

export function EmptyChatState({
  title = "Pick a conversation",
  description = "Select a chat from the sidebar or start a direct message to begin.",
}: EmptyChatStateProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-200/10 bg-cyan-200/[0.06] text-2xl text-cyan-100">
          #
        </div>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      </div>
    </div>
  );
}
