"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CallSessionDto,
  ChatDto,
  WebRtcSignalDto,
} from "@chat/shared";
import { getSocket } from "./socket.client";
import {
  answerCall as answerCallApi,
  createCall,
  endCall as endCallApi,
} from "../chat/api/calls.api";

type SignalPayload = WebRtcSignalDto & { fromUserId: string };

type CallCreatedPayload = {
  call: CallSessionDto;
  chat?: ChatDto;
};

type CallStatePayload = {
  call: CallSessionDto;
};

export type CallPhase =
  | "idle"
  | "incoming"
  | "calling"
  | "connecting"
  | "active";

export type WebRtcDebugState = {
  iceConnectionState: RTCIceConnectionState | "not-started";
  connectionState: RTCPeerConnectionState | "not-started";
  signalingState: RTCSignalingState | "not-started";
  hasLocalStream: boolean;
  hasRemoteStream: boolean;
  usingTurn: boolean;
};

type UseWebRtcCallOptions = {
  chat: ChatDto;
  currentUserId: string;
  peerUserId?: string;
};

function getRtcConfiguration(): RTCConfiguration {
  const turnUsername = process.env.NEXT_PUBLIC_METERED_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_METERED_TURN_CREDENTIAL;

  if (turnUsername && turnCredential) {
    return {
      iceServers: [
        { urls: "stun:stun.relay.metered.ca:80" },
        {
          urls: "turn:global.relay.metered.ca:80",
          username: turnUsername,
          credential: turnCredential,
        },
        {
          urls: "turn:global.relay.metered.ca:80?transport=tcp",
          username: turnUsername,
          credential: turnCredential,
        },
        {
          urls: "turn:global.relay.metered.ca:443",
          username: turnUsername,
          credential: turnCredential,
        },
        {
          urls: "turns:global.relay.metered.ca:443?transport=tcp",
          username: turnUsername,
          credential: turnCredential,
        },
      ],
    };
  }

  return {
    iceServers: [
      { urls: "stun:stun.relay.metered.ca:80" },
      { urls: "stun:stun.l.google.com:19302" },
    ],
  };
}

const RTC_CONFIGURATION: RTCConfiguration = {
  ...getRtcConfiguration(),
};

const USING_TURN = Boolean(
  process.env.NEXT_PUBLIC_METERED_TURN_USERNAME &&
    process.env.NEXT_PUBLIC_METERED_TURN_CREDENTIAL,
);

export function useWebRtcCall({
  chat,
  currentUserId,
  peerUserId,
}: UseWebRtcCallOptions) {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [activeCall, setActiveCall] = useState<CallSessionDto | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [debugState, setDebugState] = useState<WebRtcDebugState>({
    iceConnectionState: "not-started",
    connectionState: "not-started",
    signalingState: "not-started",
    hasLocalStream: false,
    hasRemoteStream: false,
    usingTurn: USING_TURN,
  });

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const activeCallRef = useRef<CallSessionDto | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerUserIdRef = useRef<string | null>(peerUserId ?? null);
  const pendingOfferRef = useRef<SignalPayload | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingSignalsRef = useRef<SignalPayload[]>([]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    peerUserIdRef.current = peerUserId ?? peerUserIdRef.current;
  }, [peerUserId]);

  const updateDebugState = useCallback(() => {
    const peerConnection = peerConnectionRef.current;

    setDebugState({
      iceConnectionState:
        peerConnection?.iceConnectionState ?? "not-started",
      connectionState: peerConnection?.connectionState ?? "not-started",
      signalingState: peerConnection?.signalingState ?? "not-started",
      hasLocalStream: Boolean(localStreamRef.current),
      hasRemoteStream: Boolean(remoteStreamRef.current),
      usingTurn: USING_TURN,
    });
  }, []);

  const cleanupConnection = useCallback((stopMedia: boolean) => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    pendingSignalsRef.current = [];

    if (stopMedia) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setIsMicMuted(false);
      setIsCameraOff(false);
    }

    remoteStreamRef.current = null;
    setRemoteStream(null);
    updateDebugState();
  }, [updateDebugState]);

  const sendSignal = useCallback(async (signal: WebRtcSignalDto) => {
    const socket = await getSocket();
    socket.emit("call:signal", signal);
  }, []);

  const ensureLocalMedia = useCallback(async (): Promise<MediaStream> => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support camera or microphone calls.");
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      updateDebugState();
      return stream;
    } catch {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsCameraOff(true);
      setError("Camera unavailable. Joined with microphone only.");
      updateDebugState();
      return stream;
    }
  }, []);

  const setupPeerConnection = useCallback(
    (callId: string, toUserId: string): RTCPeerConnection => {
      if (peerConnectionRef.current) {
        const stream = localStreamRef.current;
        const existingTrackIds = new Set(
          peerConnectionRef.current
            .getSenders()
            .map((sender) => sender.track?.id)
            .filter(Boolean),
        );

        stream?.getTracks().forEach((track) => {
          if (!existingTrackIds.has(track.id)) {
            peerConnectionRef.current?.addTrack(track, stream);
          }
        });

        return peerConnectionRef.current;
      }

      const peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);
      const stream = localStreamRef.current;

      stream?.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }

        void sendSignal({
          callId,
          toUserId,
          type: "ice-candidate",
          candidate: event.candidate.toJSON(),
        });
      };

      peerConnection.ontrack = (event) => {
        const [streamFromEvent] = event.streams;

        if (streamFromEvent) {
          remoteStreamRef.current = streamFromEvent;
          setRemoteStream(streamFromEvent);
          updateDebugState();
          return;
        }

        const nextRemoteStream =
          remoteStreamRef.current ?? new MediaStream();
        nextRemoteStream.addTrack(event.track);
        remoteStreamRef.current = nextRemoteStream;
        setRemoteStream(nextRemoteStream);
        updateDebugState();
      };

      peerConnection.onconnectionstatechange = () => {
        updateDebugState();
        if (peerConnection.connectionState === "connected") {
          setPhase("active");
        }

        if (
          peerConnection.connectionState === "failed" ||
          peerConnection.connectionState === "disconnected"
        ) {
          setError("Call connection was interrupted.");
        }
      };

      peerConnection.oniceconnectionstatechange = updateDebugState;
      peerConnection.onsignalingstatechange = updateDebugState;

      peerConnectionRef.current = peerConnection;
      updateDebugState();
      return peerConnection;
    },
    [sendSignal, updateDebugState],
  );

  const flushPendingCandidates = useCallback(async () => {
    const peerConnection = peerConnectionRef.current;

    if (!peerConnection?.remoteDescription) {
      return;
    }

    const pendingCandidates = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];

    for (const candidate of pendingCandidates) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const answerOffer = useCallback(
    async (signal: SignalPayload) => {
      const call = activeCallRef.current;

      if (!call || !signal.sdp) {
        return;
      }

      const peerConnection = setupPeerConnection(call.id, signal.fromUserId);
      if (peerConnection.signalingState !== "stable") {
        return;
      }

      await peerConnection.setRemoteDescription({
        type: "offer",
        sdp: signal.sdp,
      });
      await flushPendingCandidates();

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      if (!answer.sdp) {
        throw new Error("Could not create call answer.");
      }

      await sendSignal({
        callId: call.id,
        toUserId: signal.fromUserId,
        type: "answer",
        sdp: answer.sdp,
      });
      setPhase("active");
    },
    [flushPendingCandidates, sendSignal, setupPeerConnection],
  );

  const startCall = useCallback(async () => {
    const toUserId = peerUserIdRef.current;

    if (!toUserId) {
      setError("Choose a direct chat member to call.");
      return;
    }

    setError(null);
    setPhase("calling");

    try {
      const { call } = await createCall({
        chatId: chat.id,
        receiverId: toUserId,
      });
      const socket = await getSocket();
      activeCallRef.current = call;
      peerUserIdRef.current = toUserId;
      setActiveCall(call);

      socket.emit("call:join", { callId: call.id });
      await ensureLocalMedia();

      const peerConnection = setupPeerConnection(call.id, toUserId);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      if (!offer.sdp) {
        throw new Error("Could not create call offer.");
      }

      await sendSignal({
        callId: call.id,
        toUserId,
        type: "offer",
        sdp: offer.sdp,
      });
    } catch (err) {
      cleanupConnection(true);
      setPhase("idle");
      setActiveCall(null);
      setError(err instanceof Error ? err.message : "Failed to start call.");
    }
  }, [
    chat.id,
    cleanupConnection,
    ensureLocalMedia,
    sendSignal,
    setupPeerConnection,
  ]);

  const acceptCall = useCallback(async () => {
    const call = activeCallRef.current;
    const toUserId = peerUserIdRef.current;

    if (!call || !toUserId) {
      return;
    }

    setError(null);
    setPhase("connecting");

    try {
      const socket = await getSocket();
      socket.emit("call:join", { callId: call.id });
      await ensureLocalMedia();
      setupPeerConnection(call.id, toUserId);

      const updatedCall = await answerCallApi(call.id);
      activeCallRef.current = updatedCall;
      setActiveCall(updatedCall);

      const pendingOffer = pendingOfferRef.current;
      pendingOfferRef.current = null;

      if (pendingOffer) {
        await answerOffer(pendingOffer);
      }
    } catch (err) {
      setPhase("incoming");
      setError(err instanceof Error ? err.message : "Failed to answer call.");
    }
  }, [answerOffer, ensureLocalMedia, setupPeerConnection]);

  const endCurrentCall = useCallback(async () => {
    const call = activeCallRef.current;

    if (call) {
      try {
        const socket = await getSocket();
        socket.emit("call:leave", { callId: call.id });
        await endCallApi(call.id);
      } catch (err) {
        console.warn("[call] end failed:", err);
      }
    }

    activeCallRef.current = null;
    setActiveCall(null);
    setPhase("idle");
    cleanupConnection(true);
  }, [cleanupConnection]);

  const toggleMic = useCallback(() => {
    const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
    const nextMuted = !isMicMuted;

    audioTracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMicMuted(nextMuted);
  }, [isMicMuted]);

  const toggleCamera = useCallback(() => {
    const videoTracks = localStreamRef.current?.getVideoTracks() ?? [];
    const nextOff = !isCameraOff;

    videoTracks.forEach((track) => {
      track.enabled = !nextOff;
    });
    setIsCameraOff(nextOff);
  }, [isCameraOff]);

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;

    void getSocket().then((socket) => {
      if (!active) return;

      const onCallCreated = (payload: CallCreatedPayload) => {
        if (payload.call.chatId !== chat.id) {
          return;
        }

        if (payload.call.createdById === currentUserId) {
          return;
        }

        if (payload.call.receiverId !== currentUserId) {
          return;
        }

        activeCallRef.current = payload.call;
        peerUserIdRef.current = payload.call.createdById;
        setActiveCall(payload.call);
        setPhase("incoming");
        setError(null);

        const queuedSignals = pendingSignalsRef.current.filter(
          (signal) => signal.callId === payload.call.id,
        );
        pendingSignalsRef.current = pendingSignalsRef.current.filter(
          (signal) => signal.callId !== payload.call.id,
        );

        const queuedOffer = queuedSignals.find(
          (signal) => signal.type === "offer",
        );
        if (queuedOffer) {
          pendingOfferRef.current = queuedOffer;
        }

        pendingCandidatesRef.current.push(
          ...queuedSignals
            .filter(
              (signal) => signal.type === "ice-candidate" && signal.candidate,
            )
            .map((signal) => signal.candidate as RTCIceCandidateInit),
        );
      };

      const onCallSignal = (signal: SignalPayload) => {
        if (signal.fromUserId === currentUserId) {
          return;
        }

        if (!activeCallRef.current) {
          pendingSignalsRef.current.push(signal);
          return;
        }

        if (signal.callId !== activeCallRef.current.id) {
          return;
        }

        if (signal.type === "offer") {
          if (!localStreamRef.current) {
            pendingOfferRef.current = signal;
            return;
          }

          void answerOffer(signal).catch((err) => {
            setError(err instanceof Error ? err.message : "Failed to answer offer.");
          });
          return;
        }

        if (signal.type === "answer") {
          const peerConnection = peerConnectionRef.current;

          if (!peerConnection || !signal.sdp) {
            return;
          }

          if (peerConnection.signalingState !== "have-local-offer") {
            return;
          }

          void peerConnection
            .setRemoteDescription({ type: "answer", sdp: signal.sdp })
            .then(flushPendingCandidates)
            .then(() => setPhase("active"))
            .catch((err) => {
              setError(
                err instanceof Error ? err.message : "Failed to accept answer.",
              );
            });
          return;
        }

        if (signal.type === "ice-candidate" && signal.candidate) {
          const candidate = signal.candidate as RTCIceCandidateInit;
          const peerConnection = peerConnectionRef.current;

          if (!peerConnection?.remoteDescription) {
            pendingCandidatesRef.current.push(candidate);
            return;
          }

          void peerConnection
            .addIceCandidate(new RTCIceCandidate(candidate))
            .catch((err) => {
              console.warn("[call] failed to add ICE candidate:", err);
            });
        }
      };

      const onCallState = (payload: CallStatePayload) => {
        if (payload.call.id !== activeCallRef.current?.id) {
          return;
        }

        if (payload.call.status === "ended" || payload.call.status === "missed") {
          activeCallRef.current = null;
          setActiveCall(null);
          setPhase("idle");
          cleanupConnection(true);
          return;
        }

        activeCallRef.current = payload.call;
        setActiveCall(payload.call);

        if (payload.call.status === "active") {
          setPhase((current) =>
            current === "incoming" ? "connecting" : "active",
          );
        }
      };

      socket.off("call:created", onCallCreated);
      socket.off("call:signal", onCallSignal);
      socket.off("call:state", onCallState);
      socket.on("call:created", onCallCreated);
      socket.on("call:signal", onCallSignal);
      socket.on("call:state", onCallState);

      cleanup = () => {
        socket.off("call:created", onCallCreated);
        socket.off("call:signal", onCallSignal);
        socket.off("call:state", onCallState);
      };
    });

    return () => {
      active = false;
      cleanup?.();
    };
  }, [answerOffer, chat.id, cleanupConnection, currentUserId, flushPendingCandidates]);

  useEffect(() => {
    return () => cleanupConnection(true);
  }, [cleanupConnection]);

  return {
    phase,
    activeCall,
    localStream,
    remoteStream,
    peerUserId: peerUserIdRef.current,
    error,
    isMicMuted,
    isCameraOff,
    startCall,
    acceptCall,
    endCall: endCurrentCall,
    toggleMic,
    toggleCamera,
    debugState,
  };
}
