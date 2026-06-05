interface Props {
  online: boolean;
  size?: "sm" | "md";
}

export function PresenceDot({ online, size = "sm" }: Props) {
  const dim = size === "sm" ? "h-2 w-2" : "h-3 w-3";
  return (
    <span
      className={`${dim} rounded-full flex-shrink-0 ${
        online ? "bg-emerald-400" : "bg-white/20"
      }`}
      title={online ? "Online" : "Offline"}
    />
  );
}