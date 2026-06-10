import Link from "next/link";
import type { UserDto } from "@chat/shared";
import { getInitials, getUserLabel } from "./chat-display";
import { OnlineStatusDot } from "./OnlineStatusDot";

interface WorkspaceRailProps {
  user: UserDto | null;
  active?: "chats" | "profile";
}

export function WorkspaceRail({ user, active = "chats" }: WorkspaceRailProps) {
  const label = getUserLabel(user ?? undefined, "Me");

  return (
    <aside className="hidden w-[76px] shrink-0 flex-col items-center gap-4 border-r border-white/10 bg-[#0b0f17] px-3 py-4 md:flex">
      <Link
        href="/chats"
        aria-label="Chats"
        className={[
          "flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black transition",
          active === "chats"
            ? "bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/40"
            : "bg-white/[0.06] text-slate-300 hover:rounded-xl hover:bg-white/[0.1]",
        ].join(" ")}
      >
        C
      </Link>

      <button
        type="button"
        aria-label="Add workspace"
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-2xl text-slate-400 transition hover:rounded-xl hover:border-cyan-300/40 hover:text-cyan-200"
      >
        +
      </button>

      <div className="h-px w-10 bg-white/10" />

      <button
        type="button"
        aria-label="Friends"
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.05] text-sm font-semibold text-slate-300 transition hover:rounded-xl hover:bg-white/[0.1]"
      >
        DM
      </button>

      <div className="mt-auto">
        <Link
          href="/profile"
          aria-label="Profile"
          className={[
            "relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl transition hover:rounded-xl",
            active === "profile" ? "bg-white/[0.12]" : "bg-white/[0.06]",
          ].join(" ")}
        >
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-slate-100">
              {getInitials(label) || "U"}
            </span>
          )}
          <OnlineStatusDot online size="sm" className="absolute bottom-1 right-1" />
        </Link>
      </div>
    </aside>
  );
}
