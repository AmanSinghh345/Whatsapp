import { io, type Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace("/api", "") ??
  "http://localhost:4000";

declare global {
  interface Window {
    __socket?: Socket;
    __socketConnectPromise?: Promise<Socket>;
  }
}

function getExistingSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  return window.__socket ?? null;
}

function storeSocket(socket: Socket): void {
  if (typeof window !== "undefined") window.__socket = socket;
}

function getConnectPromise(): Promise<Socket> | undefined {
  if (typeof window === "undefined") return undefined;
  return window.__socketConnectPromise;
}

function storeConnectPromise(promise: Promise<Socket> | undefined): void {
  if (typeof window === "undefined") return;

  if (promise) {
    window.__socketConnectPromise = promise;
  } else {
    delete window.__socketConnectPromise;
  }
}

function waitForConnect(socket: Socket): Promise<Socket> {
  if (socket.connected) {
    storeConnectPromise(undefined);
    return Promise.resolve(socket);
  }

  const pending = getConnectPromise();
  if (pending) {
    return pending;
  }

  const promise = new Promise<Socket>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      storeConnectPromise(undefined);
    };

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const handleConnect = () => {
      settle(() => resolve(socket));
    };

    const handleConnectError = (error: Error) => {
      settle(() => reject(error));
    };

    const timeout = setTimeout(() => {
      settle(() => reject(new Error("Socket connection timed out after 5s")));
    }, 5000);

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
  });

  storeConnectPromise(promise);
  return promise;
}

export async function getSocket(): Promise<Socket> {
  const existing = getExistingSocket();
  if (existing?.connected) {
    console.log("[socket] reusing existing connection:", existing.id);
    return existing;
  }

  if (existing) {
    console.log("[socket] reusing existing socket while connecting");
    if (!existing.active) {
      existing.connect();
    }
    return waitForConnect(existing);
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

  return waitForConnect(socket);
}

export function disconnectSocket() {
  const existing = getExistingSocket();
  existing?.removeAllListeners();
  existing?.disconnect();
  storeConnectPromise(undefined);
  if (typeof window !== "undefined") delete window.__socket;
}
