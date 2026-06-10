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

export const usePresenceStore = create<PresenceStore>((set) => ({
  presenceByUserId: {},
  setPresence: (presence) =>
    set((state) => ({
      presenceByUserId: {
        ...state.presenceByUserId,
        [presence.userId]: toPresenceRecord(presence),
      },
    })),
  setManyPresence: (presenceList) =>
    set((state) => {
      const next = { ...state.presenceByUserId };

      for (const presence of presenceList) {
        next[presence.userId] = toPresenceRecord(presence);
      }

      return { presenceByUserId: next };
    }),
}));
