import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchMessages,
  deleteMessage,
  editMessage,
  sendAttachmentMessage,
  sendMessage,
  toggleMessageReaction,
  upsertMessageReceipt,
  MessageDto,
  type MessageReceiptUpdatedDto,
  type MessageReactionEmoji,
  type MessageReactionSummaryDto,
} from "../api/messages.api";
import { uploadChatMedia } from "../api/media.api";

export function useMessages(chatId: string | null, currentUserId: string) {
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<MessageDto | null>(null);
  const [pendingReactionMessageIds, setPendingReactionMessageIds] = useState<
    Set<string>
  >(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pendingReactionMessageIdsRef = useRef<Set<string>>(new Set());

  const getOptimisticReactions = useCallback(
    (
      reactions: MessageReactionSummaryDto[] | undefined,
      emoji: MessageReactionEmoji,
    ): MessageReactionSummaryDto[] => {
      const currentReactions = reactions ?? [];
      const existingReaction = currentReactions.find((reaction) =>
        reaction.userIds.includes(currentUserId),
      );
      const shouldRemoveReaction = existingReaction?.emoji === emoji;
      const nextByEmoji = new Map<
        MessageReactionEmoji,
        MessageReactionSummaryDto
      >();

      for (const reaction of currentReactions) {
        const nextUserIds = reaction.userIds.filter(
          (userId) => userId !== currentUserId,
        );

        if (nextUserIds.length > 0) {
          nextByEmoji.set(reaction.emoji, {
            emoji: reaction.emoji,
            count: nextUserIds.length,
            userIds: nextUserIds,
          });
        }
      }

      if (!shouldRemoveReaction) {
        const target = nextByEmoji.get(emoji);
        const userIds = target?.userIds ?? [];
        const nextUserIds = userIds.includes(currentUserId)
          ? userIds
          : [...userIds, currentUserId];

        nextByEmoji.set(emoji, {
          emoji,
          count: nextUserIds.length,
          userIds: nextUserIds,
        });
      }

      return ["👍", "❤️", "😂", "😮", "😢"].flatMap((allowedEmoji) => {
        const reaction = nextByEmoji.get(allowedEmoji as MessageReactionEmoji);
        return reaction ? [reaction] : [];
      });
    },
    [currentUserId],
  );

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchMessages(chatId)
      .then(({ messages }) => {
        if (cancelled) return;

        setMessages(messages);
        const incomingMessages = messages.filter(
          (message) => message.senderId !== currentUserId,
        );
        void Promise.allSettled(
          incomingMessages.map((message) =>
            upsertMessageReceipt(chatId, message.id, "seen"),
          ),
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chatId, currentUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      if (!chatId || !text.trim()) return;
      setSending(true);
      setError(null);
      try {
        const msg = await sendMessage(
          chatId,
          text.trim(),
          replyToMessage?.id,
        );
        setReplyToMessage(null);
        // Dedup — socket broadcast may have already added this message
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSending(false);
      }
    },
    [chatId, replyToMessage?.id]
  );

  const appendMessage = useCallback((msg: MessageDto) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const updateMessage = useCallback((msg: MessageDto) => {
    setMessages((prev) =>
      prev.map((message) => (message.id === msg.id ? msg : message)),
    );
  }, []);

  const updateQuotedMessage = useCallback((msg: MessageDto) => {
    setMessages((prev) =>
      prev.map((message) => {
        if (message.replyTo?.id !== msg.id) {
          return message;
        }

        return {
          ...message,
          replyTo: {
            id: msg.id,
            senderId: msg.senderId,
            contentType: msg.contentType,
            ...(msg.deletedAt ? { deletedAt: msg.deletedAt } : {}),
            ...(!msg.deletedAt && msg.text ? { text: msg.text } : {}),
          },
        };
      }),
    );
  }, []);

  const updateReceiptStatus = useCallback(
    (receiptUpdate: MessageReceiptUpdatedDto) => {
      setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== receiptUpdate.messageId) {
            return message;
          }

          const receipts = [...(message.receipts ?? [])];
          const receiptIndex = receipts.findIndex(
            (receipt) => receipt.recipientId === receiptUpdate.recipientId,
          );
          const currentReceipt =
            receiptIndex >= 0 ? receipts[receiptIndex] : undefined;
          const nextReceipt = {
            recipientId: receiptUpdate.recipientId,
            ...(currentReceipt?.deliveredAt
              ? { deliveredAt: currentReceipt.deliveredAt }
              : {}),
            ...(currentReceipt?.seenAt ? { seenAt: currentReceipt.seenAt } : {}),
            ...(receiptUpdate.deliveredAt
              ? { deliveredAt: receiptUpdate.deliveredAt }
              : {}),
            ...(receiptUpdate.seenAt ? { seenAt: receiptUpdate.seenAt } : {}),
          };

          if (receiptIndex >= 0) {
            receipts[receiptIndex] = nextReceipt;
          } else {
            receipts.push(nextReceipt);
          }

          const nextStatus =
            receipts.length > 0 &&
            receipts.every((receipt) => Boolean(receipt.seenAt))
              ? "seen"
              : receipts.length > 0 &&
                  receipts.every((receipt) =>
                    Boolean(receipt.deliveredAt || receipt.seenAt),
                  )
                ? "delivered"
                : message.receiptStatus ?? "sent";

          return { ...message, receipts, receiptStatus: nextStatus };
        }),
      );
    },
    [],
  );

  const updateMessageReactions = useCallback(
    (messageId: string, reactions: MessageReactionSummaryDto[]) => {
      setMessages((prev) => {
        const found = prev.some((message) => message.id === messageId);

        console.log(
          `[reaction] message id ${found ? "found" : "not found"} in state`,
          { messageId, messageCount: prev.length },
        );

        if (!found) {
          return prev;
        }

        const next = prev.map((message) =>
          message.id === messageId ? { ...message, reactions } : message,
        );

        console.log("[reaction] state updated", { messageId, reactions });
        return next;
      });
    },
    [],
  );

  const reactToMessage = useCallback(
    async (messageId: string, emoji: MessageReactionEmoji) => {
      if (pendingReactionMessageIdsRef.current.has(messageId)) {
        return;
      }

      const currentMessage = messages.find((message) => message.id === messageId);
      if (currentMessage?.deletedAt) {
        return;
      }

      const previousReactions = currentMessage?.reactions ?? [];
      const optimisticReactions = getOptimisticReactions(
        previousReactions,
        emoji,
      );

      pendingReactionMessageIdsRef.current.add(messageId);
      setPendingReactionMessageIds((current) => {
        const next = new Set(current);
        next.add(messageId);
        return next;
      });
      setError(null);
      updateMessageReactions(messageId, optimisticReactions);

      try {
        const result = await toggleMessageReaction(messageId, emoji);
        updateMessageReactions(result.messageId, result.reactions);
      } catch (e: any) {
        updateMessageReactions(messageId, previousReactions);
        setError(e.message);
      } finally {
        pendingReactionMessageIdsRef.current.delete(messageId);
        setPendingReactionMessageIds((current) => {
          const next = new Set(current);
          next.delete(messageId);
          return next;
        });
      }
    },
    [
      getOptimisticReactions,
      messages,
      updateMessageReactions,
    ],
  );

  const sendAttachment = useCallback(
    async (file: File) => {
      if (!chatId) return;
      setSending(true);
      setError(null);
      try {
        const asset = await uploadChatMedia(file);
        const msg = await sendAttachmentMessage(
          chatId,
          [asset.id],
          undefined,
          replyToMessage?.id,
        );
        setReplyToMessage(null);
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSending(false);
      }
    },
    [chatId, replyToMessage?.id],
  );

  const edit = useCallback(
    async (messageId: string, text: string) => {
      const trimmedText = text.trim();

      if (!trimmedText) {
        setError("Message cannot be empty.");
        return;
      }

      setEditingMessageId(messageId);
      setError(null);

      try {
        const updated = await editMessage(messageId, trimmedText);
        updateMessage(updated);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setEditingMessageId(null);
      }
    },
    [updateMessage],
  );

  const remove = useCallback(
    async (messageId: string) => {
      setDeletingMessageId(messageId);
      setError(null);

      try {
        const deleted = await deleteMessage(messageId);
        updateMessage(deleted);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setDeletingMessageId(null);
      }
    },
    [updateMessage],
  );

  return {
    messages,
    loading,
    sending,
    editingMessageId,
    deletingMessageId,
    replyToMessage,
    error,
    send,
    sendAttachment,
    appendMessage,
    updateMessage,
    updateQuotedMessage,
    updateReceiptStatus,
    updateMessageReactions,
    reactToMessage,
    edit,
    deleteMessage: remove,
    setReplyToMessage,
    clearReplyToMessage: () => setReplyToMessage(null),
    pendingReactionMessageIds,
    bottomRef,
  };
}
