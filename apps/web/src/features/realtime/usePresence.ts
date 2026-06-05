import { useEffect, useState } from "react";
import { getSocket } from "./socket.client";

interface PresenceStatePayload {
  userId: string;
  state: "online" | "offline";
  updatedAt: string;
}

export function usePresence(userIds: string[]) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userIds.length) return;
    let active = true;

    getSocket().then((socket) => {
      if (!active) return;

      // Query current presence state on mount
      socket.emit("presence:query", { userIds });

      // Handle query response
      const onPresenceState = (data: PresenceStatePayload[]) => {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          data.forEach((p) => {
            if (p.state === "online") next.add(p.userId);
            else next.delete(p.userId);
          });
          return next;
        });
      };

      // Handle live presence changes
      const onOnline = (data: PresenceStatePayload) => {
        if (userIds.includes(data.userId)) {
          setOnlineUsers((prev) => new Set(prev).add(data.userId));
        }
      };

      const onOffline = (data: PresenceStatePayload) => {
        if (userIds.includes(data.userId)) {
          setOnlineUsers((prev) => {
            const next = new Set(prev);
            next.delete(data.userId);
            return next;
          });
        }
      };

      socket.on("presence:state", onPresenceState);
      socket.on("presence:online", onOnline);
      socket.on("presence:offline", onOffline);

      return () => {
        socket.off("presence:state", onPresenceState);
        socket.off("presence:online", onOnline);
        socket.off("presence:offline", onOffline);
      };
    });

    return () => { active = false; };
  }, [userIds.join(",")]);

  return {
    isOnline: (userId: string) => onlineUsers.has(userId),
  };
}