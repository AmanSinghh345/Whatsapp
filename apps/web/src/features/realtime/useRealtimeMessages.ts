import { useEffect, useRef } from "react";
import { getSocket } from "./socket.client";
import type { MessageDto } from "../chat/api/messages.api";

interface Options {
  chatId: string | null;
  onMessage: (msg: MessageDto) => void;
}

export function useRealtimeMessages({ chatId, onMessage }: Options) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!chatId) return;

    let active = true;

    async function setup() {
      try {
        const socket = await getSocket();
        if (!active) return;

        console.log("[socket] joining chat room:", chatId);
        socket.emit("chat:join", { chatId });

        const handler = (msg: MessageDto) => {
          console.log("[socket] message:new received:", msg);
          onMessageRef.current(msg);
        };

        socket.on("message:new", handler);

        // Cleanup
        return () => {
          socket.off("message:new", handler);
          socket.emit("chat:leave", { chatId });
          console.log("[socket] left chat room:", chatId);
        };
      } catch (err) {
        console.error("[socket] setup failed:", err);
      }
    }

    const cleanupPromise = setup();

    return () => {
      active = false;
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [chatId]);
}