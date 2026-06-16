import { useEffect, useState } from "react";
import type { UserDto } from "@chat/shared";
import { getInitials } from "./chat-display";

interface ChatAvatarProps {
  label: string;
  user?: UserDto | undefined;
  imageUrl?: string | undefined;
  size?: "sm" | "md" | "lg";
}

export function ChatAvatar({
  label,
  user,
  imageUrl,
  size = "md",
}: ChatAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const dimensions =
    size === "lg" ? "h-12 w-12" : size === "sm" ? "h-9 w-9" : "h-10 w-10";
  const src = imageUrl ?? user?.avatarUrl;
  const fallback = getInitials(label) || label.slice(0, 1).toUpperCase() || "U";

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 via-teal-500 to-emerald-500 text-sm font-bold text-white shadow-lg shadow-black/20",
        dimensions,
      ].join(" ")}
    >
      {src && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        fallback
      )}
    </div>
  );
}
