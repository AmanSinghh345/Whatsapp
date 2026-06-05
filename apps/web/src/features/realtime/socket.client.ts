import { io, Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ?? "http://localhost:4000";

declare global {
  interface Window { __socket?: Socket; }
}

function getExistingSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  return window.__socket ?? null;
}

function storeSocket(socket: Socket): void {
  if (typeof window !== "undefined") window.__socket = socket;
}

export async function getSocket(): Promise<Socket> {
  const existing = getExistingSocket();
  if (existing?.connected) {
    console.log("[socket] reusing existing connection:", existing.id);
    return existing;
  }

  if (existing) {
    existing.removeAllListeners();
    existing.disconnect();
    window.__socket = undefined;
  }

  const { getAuth } = await import("firebase/auth");
  const token = await getAuth().currentUser?.getIdToken();

  console.log("[socket] connecting to", SOCKET_URL, "| has token:", !!token);

  const socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["polling", "websocket"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  storeSocket(socket);

  socket.on("connect", () => {
    console.log("[socket] ✅ connected:", socket.id);
  });

  socket.on("connect_error", (err) => {
    console.warn("[socket] connect attempt failed:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("[socket] disconnected:", reason);
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Socket connection timed out after 5s"));
    }, 5000);

    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  return socket;
}

export function disconnectSocket() {
  const existing = getExistingSocket();
  existing?.removeAllListeners();
  existing?.disconnect();
  if (typeof window !== "undefined") window.__socket = undefined;
}