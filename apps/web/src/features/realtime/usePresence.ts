import { useEffect } from "react";
import { getSocket } from "./socket.client";
import type { PresenceStatePayload } from "@chat/shared";
import { usePresenceStore } from "./presence.store";

export function usePresence(userIds: string[]) {
  const presenceUserIds = Array.from(new Set(userIds.filter(Boolean))).sort();
  const presenceUserKey = presenceUserIds.join(",");
  const presenceByUserId = usePresenceStore((state) => state.presenceByUserId);
  const setPresence = usePresenceStore((state) => state.setPresence);
  const setManyPresence = usePresenceStore((state) => state.setManyPresence);

  useEffect(() => {
    if (!presenceUserIds.length) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    let queryInterval: ReturnType<typeof setInterval> | undefined;

    getSocket().then((socket) => {
      if (!active) return;
      const watchedUserIds = new Set(presenceUserIds);

      const queryPresence = () => {
        socket.emit("presence:query", { userIds: presenceUserIds });
      };

      const onPresenceState = (data: PresenceStatePayload[]) => {
        setManyPresence(data.filter((item) => watchedUserIds.has(item.userId)));
      };

      const onOnline = (data: PresenceStatePayload) => {
        if (watchedUserIds.has(data.userId)) {
          setPresence(data);
        }
      };

      const onOffline = (data: PresenceStatePayload) => {
        if (watchedUserIds.has(data.userId)) {
          setPresence(data);
        }
      };

      socket.on("connect", queryPresence);
      socket.on("presence:state", onPresenceState);
      socket.on("presence:online", onOnline);
      socket.on("presence:offline", onOffline);
      queryPresence();
      queryInterval = setInterval(queryPresence, 15000);

      cleanup = () => {
        socket.off("connect", queryPresence);
        socket.off("presence:state", onPresenceState);
        socket.off("presence:online", onOnline);
        socket.off("presence:offline", onOffline);
        if (queryInterval) {
          clearInterval(queryInterval);
        }
      };
    }).catch((error) => {
      console.warn("[presence] setup failed:", error);
    });

    return () => {
      active = false;
      if (queryInterval) {
        clearInterval(queryInterval);
      }
      cleanup?.();
    };
  }, [setManyPresence, setPresence, presenceUserKey]);

  return {
    getPresence: (userId: string) => presenceByUserId[userId],
    isOnline: (userId: string) => presenceByUserId[userId]?.state === "online",
  };
}
