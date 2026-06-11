"use client";

import { useEffect, useRef } from "react";
import type { CallPhase } from "../../realtime/useWebRtcCall";

interface MediaTileProps {
  label: string;
  stream: MediaStream | null;
  muted?: boolean;
}

interface CallPanelProps {
  phase: CallPhase;
  peerName: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  error: string | null;
  isMicMuted: boolean;
  isCameraOff: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
}

function MediaTile({ label, stream, muted = false }: MediaTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative min-h-40 overflow-hidden rounded-xl border border-white/10 bg-black/30">
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="h-full min-h-40 w-full object-cover"
        />
      ) : (
        <div className="flex min-h-40 items-center justify-center text-sm font-semibold text-slate-500">
          {label}
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-slate-100">
        {label}
      </span>
    </div>
  );
}

export function CallPanel({
  phase,
  peerName,
  localStream,
  remoteStream,
  error,
  isMicMuted,
  isCameraOff,
  onAccept,
  onDecline,
  onEnd,
  onToggleMic,
  onToggleCamera,
}: CallPanelProps) {
  if (phase === "idle") {
    return null;
  }

  const statusText =
    phase === "incoming"
      ? `${peerName} is calling`
      : phase === "calling"
        ? `Calling ${peerName}`
        : phase === "connecting"
          ? "Connecting"
          : `In call with ${peerName}`;

  return (
    <div className="border-b border-white/10 bg-[#0f1722] px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-100">
              {statusText}
            </p>
            {error ? (
              <p className="mt-1 truncate text-xs text-amber-200">{error}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                WebRTC media uses your browser camera and microphone.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {phase === "incoming" ? (
              <>
                <button
                  type="button"
                  onClick={onAccept}
                  className="h-9 rounded-lg bg-emerald-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={onDecline}
                  className="h-9 rounded-lg bg-red-500 px-4 text-sm font-bold text-white transition hover:bg-red-400"
                >
                  Decline
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onToggleMic}
                  className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08]"
                >
                  {isMicMuted ? "Unmute" : "Mute"}
                </button>
                <button
                  type="button"
                  onClick={onToggleCamera}
                  disabled={!localStream?.getVideoTracks().length}
                  className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCameraOff ? "Camera on" : "Camera off"}
                </button>
                <button
                  type="button"
                  onClick={onEnd}
                  className="h-9 rounded-lg bg-red-500 px-4 text-sm font-bold text-white transition hover:bg-red-400"
                >
                  End
                </button>
              </>
            )}
          </div>
        </div>

        {phase !== "incoming" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <MediaTile label={peerName} stream={remoteStream} />
            <MediaTile label="You" stream={localStream} muted />
          </div>
        ) : null}
      </div>
    </div>
  );
}
