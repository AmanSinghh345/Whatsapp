import { useEffect } from "react";
import { getSocket } from "./socket.client";
import type { PresenceStatePayload } from "@chat/shared";
import { usePresenceStore } from "./presence.store";

export function usePresence(userIds: string[]) {
  const presenceByUserId = usePresenceStore((state) => state.presenceByUserId);
  const setPresence = usePresenceStore((state) => state.setPresence);
  const setManyPresence = usePresenceStore((state) => state.setManyPresence);

  useEffect(() => {
    if (!userIds.length) return;
    let active = true;
    let cleanup: (() => void) | undefined;

    getSocket().then((socket) => {
      if (!active) return;

      socket.emit("presence:query", { userIds });

      const onPresenceState = (data: PresenceStatePayload[]) => {
        setManyPresence(data);
      };

      const onOnline = (data: PresenceStatePayload) => {
        if (userIds.includes(data.userId)) {
          setPresence(data);
        }
      };

      const onOffline = (data: PresenceStatePayload) => {
        if (userIds.includes(data.userId)) {
          setPresence(data);
        }
      };

      socket.on("presence:state", onPresenceState);
      socket.on("presence:online", onOnline);
      socket.on("presence:offline", onOffline);

      cleanup = () => {
        socket.off("presence:state", onPresenceState);
        socket.off("presence:online", onOnline);
        socket.off("presence:offline", onOffline);
      };
    });

    return () => {
      active = false;
      cleanup?.();
    };
  }, [setManyPresence, setPresence, userIds.join(",")]);

  return {
    getPresence: (userId: string) => presenceByUserId[userId],
    isOnline: (userId: string) => presenceByUserId[userId]?.state === "online",
  };
}
