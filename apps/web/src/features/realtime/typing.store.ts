import { create } from "zustand";

type TypingStore = {
  typingByChatId: Record<string, string[]>;
  setTyping: (chatId: string, userId: string, isTyping: boolean) => void;
  replaceTypingUsers: (chatId: string, userIds: string[]) => void;
  clearChat: (chatId: string) => void;
};

const TYPING_TTL_MS = 3000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function timerKey(chatId: string, userId: string) {
  return `${chatId}:${userId}`;
}

function removeUser(
  typingByChatId: Record<string, string[]>,
  chatId: string,
  userId: string,
) {
  const current = typingByChatId[chatId] ?? [];
  const next = current.filter((id) => id !== userId);

  if (next.length === current.length) {
    return typingByChatId;
  }

  const updated = { ...typingByChatId };

  if (next.length === 0) {
    delete updated[chatId];
  } else {
    updated[chatId] = next;
  }

  return updated;
}

function scheduleExpiry(chatId: string, userId: string, clearUser: () => void) {
  const key = timerKey(chatId, userId);
  const existing = timers.get(key);

  if (existing) {
    clearTimeout(existing);
  }

  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      clearUser();
    }, TYPING_TTL_MS),
  );
}

function clearTimer(chatId: string, userId: string) {
  const key = timerKey(chatId, userId);
  const existing = timers.get(key);

  if (existing) {
    clearTimeout(existing);
    timers.delete(key);
  }
}

export const useTypingStore = create<TypingStore>((set) => ({
  typingByChatId: {},

  setTyping: (chatId, userId, isTyping) => {
    if (!chatId || !userId) return;

    if (!isTyping) {
      clearTimer(chatId, userId);
      set((state) => ({
        typingByChatId: removeUser(state.typingByChatId, chatId, userId),
      }));
      return;
    }

    set((state) => {
      const current = state.typingByChatId[chatId] ?? [];

      if (current.includes(userId)) {
        return state;
      }

      return {
        typingByChatId: {
          ...state.typingByChatId,
          [chatId]: [...current, userId],
        },
      };
    });

    scheduleExpiry(chatId, userId, () => {
      set((state) => ({
        typingByChatId: removeUser(state.typingByChatId, chatId, userId),
      }));
    });
  },

  replaceTypingUsers: (chatId, userIds) => {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

    set((state) => {
      const updated = { ...state.typingByChatId };

      if (uniqueUserIds.length === 0) {
        delete updated[chatId];
      } else {
        updated[chatId] = uniqueUserIds;
      }

      return { typingByChatId: updated };
    });

    uniqueUserIds.forEach((userId) => {
      scheduleExpiry(chatId, userId, () => {
        set((state) => ({
          typingByChatId: removeUser(state.typingByChatId, chatId, userId),
        }));
      });
    });
  },

  clearChat: (chatId) => {
    const keysToClear = Array.from(timers.keys()).filter((key) =>
      key.startsWith(`${chatId}:`),
    );
    keysToClear.forEach((key) => {
      const timer = timers.get(key);
      if (timer) clearTimeout(timer);
      timers.delete(key);
    });

    set((state) => {
      const updated = { ...state.typingByChatId };
      delete updated[chatId];
      return { typingByChatId: updated };
    });
  },
}));
