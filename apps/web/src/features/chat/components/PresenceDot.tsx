interface Props {
  online: boolean;
  size?: "sm" | "md";
}

export function PresenceDot({ online, size = "sm" }: Props) {
  const dim = size === "sm" ? "h-2.5 w-2.5" : "h-4 w-4";
  return (
    <span
      className={`${dim} flex-shrink-0 rounded-full ring-1 ring-black/30 ${
        online
          ? "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.65)]"
          : "bg-slate-600"
      }`}
      title={online ? "Online" : "Offline"}
    />
  );
}
