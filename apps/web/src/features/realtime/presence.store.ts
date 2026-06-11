import { create } from "zustand";
import type { PresenceStatePayload } from "@chat/shared";

export type PresenceRecord = {
  userId: string;
  state: "online" | "offline";
  lastSeenAt?: string;
  updatedAt: string;
};

type PresenceStore = {
  presenceByUserId: Record<string, PresenceRecord>;
  setPresence: (presence: PresenceStatePayload) => void;
  setManyPresence: (presence: PresenceStatePayload[]) => void;
};

function toPresenceRecord(payload: PresenceStatePayload): PresenceRecord {
  return {
    userId: payload.userId,
    state: payload.state,
    ...(payload.lastSeenAt ? { lastSeenAt: payload.lastSeenAt } : {}),
    updatedAt: payload.updatedAt,
  };
}

function shouldApplyPresence(
  current: PresenceRecord | undefined,
  next: PresenceRecord,
): boolean {
  if (!current) {
    return true;
  }

  const currentTime = new Date(current.updatedAt).getTime();
  const nextTime = new Date(next.updatedAt).getTime();

  if (Number.isNaN(currentTime) || Number.isNaN(nextTime)) {
    return true;
  }

  return nextTime >= currentTime;
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  presenceByUserId: {},
  setPresence: (presence) =>
    set((state) => {
      const nextPresence = toPresenceRecord(presence);

      if (!shouldApplyPresence(state.presenceByUserId[presence.userId], nextPresence)) {
        return state;
      }

      return {
        presenceByUserId: {
          ...state.presenceByUserId,
          [presence.userId]: nextPresence,
        },
      };
    }),
  setManyPresence: (presenceList) =>
    set((state) => {
      const next = { ...state.presenceByUserId };

      for (const presence of presenceList) {
        const nextPresence = toPresenceRecord(presence);

        if (shouldApplyPresence(next[presence.userId], nextPresence)) {
          next[presence.userId] = nextPresence;
        }
      }

      return { presenceByUserId: next };
    }),
}));
