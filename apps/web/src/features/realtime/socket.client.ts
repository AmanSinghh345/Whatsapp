import { io, type Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace("/api", "") ??
  "http://localhost:4000";

declare global {
  interface Window {
    __socket?: Socket;
    __socketCreatePromise?: Promise<Socket>;
    __socketConnectPromise?: Promise<Socket>;
    __socketJoinedChatIds?: Set<string>;
  }
}

function getExistingSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  return window.__socket ?? null;
}

function storeSocket(socket: Socket): void {
  if (typeof window !== "undefined") window.__socket = socket;
}

function getCreatePromise(): Promise<Socket> | undefined {
  if (typeof window === "undefined") return undefined;
  return window.__socketCreatePromise;
}

function storeCreatePromise(promise: Promise<Socket> | undefined): void {
  if (typeof window === "undefined") return;

  if (promise) {
    window.__socketCreatePromise = promise;
  } else {
    delete window.__socketCreatePromise;
  }
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

function getJoinedChatIds(): Set<string> {
  if (typeof window === "undefined") return new Set<string>();

  window.__socketJoinedChatIds ??= new Set<string>();
  return window.__socketJoinedChatIds;
}

function attachSocketDiagnostics(socket: Socket): void {
  socket.on("connect", () => {
    console.log("[socket] connected:", socket.id);

    for (const chatId of getJoinedChatIds()) {
      socket.emit("chat:join", { chatId });
    }
  });

  socket.on("connect_error", (err) => {
    console.warn("[socket] connect attempt failed:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("[socket] disconnected:", reason);
  });
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

    const handleConnectError = () => {
      // Socket.IO may recover from transient connection errors; keep waiting.
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
    return existing;
  }

  if (existing) {
    if (!existing.active) {
      const { getAuth } = await import("firebase/auth");
      const token = await getAuth().currentUser?.getIdToken();
      existing.auth = { token };
      existing.connect();
    }
    return waitForConnect(existing);
  }

  const pendingCreate = getCreatePromise();
  if (pendingCreate) {
    return pendingCreate;
  }

  const createPromise = createSocket();
  storeCreatePromise(createPromise);

  try {
    return await createPromise;
  } finally {
    storeCreatePromise(undefined);
  }
}

async function createSocket(): Promise<Socket> {
  const { getAuth } = await import("firebase/auth");
  const token = await getAuth().currentUser?.getIdToken();

  const existing = getExistingSocket();
  if (existing) {
    return existing.connected ? existing : waitForConnect(existing);
  }

  console.log("[socket] connecting to", SOCKET_URL, "| has token:", !!token);

  const socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket"],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  storeSocket(socket);
  attachSocketDiagnostics(socket);
  socket.connect();

  return waitForConnect(socket);
}

export async function joinChatOnce(chatId: string): Promise<void> {
  if (!chatId) return;

  const socket = await getSocket();
  const joinedChatIds = getJoinedChatIds();

  if (joinedChatIds.has(chatId)) {
    return;
  }

  joinedChatIds.add(chatId);
  socket.emit("chat:join", { chatId });
}

export function disconnectSocket() {
  const existing = getExistingSocket();
  existing?.removeAllListeners();
  existing?.disconnect();
  storeCreatePromise(undefined);
  storeConnectPromise(undefined);
  if (typeof window !== "undefined") {
    delete window.__socket;
    delete window.__socketJoinedChatIds;
  }
}
