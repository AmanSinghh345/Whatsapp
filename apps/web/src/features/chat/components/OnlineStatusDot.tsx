interface OnlineStatusDotProps {
  online: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function OnlineStatusDot({
  online,
  size = "sm",
  className = "",
}: OnlineStatusDotProps) {
  const dimensions = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";

  return (
    <span
      title={online ? "Online" : "Offline"}
      className={[
        "inline-flex shrink-0 rounded-full ring-2 ring-[#111827]",
        dimensions,
        online
          ? "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.7)]"
          : "bg-slate-500",
        className,
      ].join(" ")}
    />
  );
}
