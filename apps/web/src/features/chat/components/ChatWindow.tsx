"use client";

import { useMemo, useState } from "react";
import type { ChatDto, ChatMemberDto } from "@chat/shared";
import type { MessageDto } from "../api/messages.api";
import { ChatHeader } from "./ChatHeader";
import { CallPanel } from "./CallPanel";
import { EmptyChatState } from "./EmptyChatState";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import { MessageThread } from "./MessageThread";
import { useWebRtcCall } from "../../realtime/useWebRtcCall";
import {
  getChatPresenceStatus,
  getChatTitle,
  getOtherMembers,
  type PresenceView,
} from "./chat-display";

interface ChatWindowProps {
  chat: ChatDto | null;
  currentUserId?: string | undefined;
  highlightedMessageId?: string | null;
  infoPanelOpen: boolean;
  getPresence: (userId: string) => PresenceView | undefined;
  isOnline: (userId: string) => boolean;
  onToggleSidebar: () => void;
  onToggleInfo: () => void;
}

function MemberRow({ member }: { member: ChatMemberDto }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.035] px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-200">
          {member.user?.displayName ?? "Member"}
        </p>
        <p className="truncate text-xs text-slate-500">{member.role}</p>
      </div>
    </div>
  );
}

function DemoMessageThread({
  chat,
  currentUserId,
}: {
  chat: ChatDto;
  currentUserId: string;
}) {
  const seedMessages = useMemo<MessageDto[]>(() => {
    const otherUserId =
      getOtherMembers(chat, currentUserId)[0]?.userId ?? "demo-member";
    const now = Date.now();
    const firstCreatedAt = new Date(now - 12 * 60 * 1000).toISOString();
    const secondCreatedAt = new Date(now - 9 * 60 * 1000).toISOString();
    const thirdCreatedAt = new Date(now - 4 * 60 * 1000).toISOString();

    return [
      {
        id: `${chat.id}-seed-1`,
        chatId: chat.id,
        senderId: otherUserId,
        clientMessageId: `${chat.id}-seed-1`,
        contentType: "text",
        text: "The realtime shell is looking sharp.",
        receiptStatus: "seen",
        createdAt: firstCreatedAt,
        updatedAt: firstCreatedAt,
      },
      {
        id: `${chat.id}-seed-2`,
        chatId: chat.id,
        senderId: currentUserId,
        clientMessageId: `${chat.id}-seed-2`,
        contentType: "text",
        text: "Good. I want it to feel fast, not fussy.",
        receiptStatus: "seen",
        createdAt: secondCreatedAt,
        updatedAt: secondCreatedAt,
      },
      {
        id: `${chat.id}-seed-3`,
        chatId: chat.id,
        senderId: otherUserId,
        clientMessageId: `${chat.id}-seed-3`,
        contentType: "text",
        text: "Then this is the right amount of glow.",
        receiptStatus: "delivered",
        createdAt: thirdCreatedAt,
        updatedAt: thirdCreatedAt,
      },
    ];
  }, [chat, currentUserId]);
  const [messages, setMessages] = useState(seedMessages);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList chat={chat} messages={messages} currentUserId={currentUserId} />
      <MessageComposer
        onSend={(text) => {
          setMessages((current) => [
            ...current,
            (() => {
              const createdAt = new Date().toISOString();
              return {
                id: `${chat.id}-${Date.now()}`,
                chatId: chat.id,
                senderId: currentUserId,
                clientMessageId: `${Date.now()}`,
                contentType: "text",
                text,
                receiptStatus: "sent",
                createdAt,
                updatedAt: createdAt,
              };
            })(),
          ]);
        }}
      />
    </div>
  );
}

export function ChatWindow({
  chat,
  currentUserId,
  highlightedMessageId = null,
  infoPanelOpen,
  getPresence,
  isOnline,
  onToggleSidebar,
  onToggleInfo,
}: ChatWindowProps) {
  if (!chat || !currentUserId) {
    return <EmptyChatState />;
  }

  const otherMembers = getOtherMembers(chat, currentUserId);
  const callPeer =
    chat.type === "direct" && otherMembers.length === 1
      ? otherMembers[0]
      : undefined;
  const call = useWebRtcCall({
    chat,
    currentUserId,
    ...(callPeer ? { peerUserId: callPeer.userId } : {}),
  });
  const activeCallPeer =
    otherMembers.find((member) => member.userId === call.peerUserId) ?? callPeer;
  const activeCallPeerName =
    activeCallPeer?.user?.displayName ??
    activeCallPeer?.user?.phoneE164 ??
    activeCallPeer?.user?.email ??
    "Caller";
  const online = otherMembers.some((member) => isOnline(member.userId));
  const presenceText = getChatPresenceStatus(otherMembers, getPresence);
  const title = getChatTitle(chat, currentUserId);

  return (
    <section className="flex min-w-0 flex-1 bg-[#0c111b]">
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          chat={chat}
          currentUserId={currentUserId}
          online={online}
          presenceText={presenceText}
          callAvailable={Boolean(callPeer) && !chat.id.startsWith("demo-chat-")}
          callActive={call.phase !== "idle"}
          onToggleSidebar={onToggleSidebar}
          onToggleInfo={onToggleInfo}
          onStartVideoCall={call.startCall}
        />
        <CallPanel
          phase={call.phase}
          peerName={activeCallPeerName}
          localStream={call.localStream}
          remoteStream={call.remoteStream}
          error={call.error}
          isMicMuted={call.isMicMuted}
          isCameraOff={call.isCameraOff}
          onAccept={call.acceptCall}
          onDecline={call.endCall}
          onEnd={call.endCall}
          onToggleMic={call.toggleMic}
          onToggleCamera={call.toggleCamera}
        />
        {chat.id.startsWith("demo-chat-") ? (
          <DemoMessageThread chat={chat} currentUserId={currentUserId} />
        ) : (
          <MessageThread
            chatId={chat.id}
            chat={chat}
            currentUserId={currentUserId}
            highlightedMessageId={highlightedMessageId}
          />
        )}
      </div>

      {infoPanelOpen ? (
        <aside className="hidden w-80 shrink-0 border-l border-white/10 bg-[#101722]/90 p-5 backdrop-blur-xl xl:block">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
              Chat info
            </p>
            <h2 className="mt-3 truncate text-xl font-bold text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {chat.type === "group"
                ? `${chat.members?.length ?? 0} members in this room.`
                : presenceText}
            </p>
          </div>

          <div className="mt-5">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Members
            </h3>
            <div className="mt-3 space-y-2">
              {(chat.members ?? []).map((member) => (
                <MemberRow key={member.userId} member={member} />
              ))}
            </div>
          </div>
        </aside>
      ) : null}
    </section>
  );
}
