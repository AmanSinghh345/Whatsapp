"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ProtectedRoute } from "../../features/auth/components/protected-route";
import { useAuthStore } from "../../features/auth/store/auth.store";
import { uploadUserAvatar } from "../../features/chat/api/media.api";
import {
  getBrowserNotificationStatus,
  requestBrowserNotifications,
  type BrowserNotificationStatus,
} from "../../features/realtime/notifications";
import { updateMe } from "../../features/user/api/users.api";

function ProfileNotice({
  type,
  message,
  onDismiss,
}: {
  type: "success" | "error";
  message: string;
  onDismiss: () => void;
}) {
  const isError = type === "error";

  return (
    <div
      className={`fixed right-3 top-3 z-50 flex w-[min(360px,calc(100vw-1.5rem))] items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-2xl shadow-black/40 backdrop-blur ${
        isError
          ? "border-red-300/20 bg-[#24181c]/95 text-red-100"
          : "border-emerald-300/20 bg-[#14231d]/95 text-emerald-100"
      }`}
    >
      <p className="min-w-0 flex-1 leading-5">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-70 transition hover:bg-white/10 hover:opacity-100"
        aria-label="Dismiss"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarObjectUrl, setAvatarObjectUrl] = useState<string | null>(null);
  const [avatarPreviewFailed, setAvatarPreviewFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingLabel, setSavingLabel] = useState("Saving...");
  const [notificationStatus, setNotificationStatus] =
    useState<BrowserNotificationStatus>("default");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNotificationStatus(getBrowserNotificationStatus());
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    setDisplayName(user.displayName);
    setPhoneE164(user.phoneE164 ?? "");
    setAvatarUrl(user.avatarUrl ?? "");
  }, [user]);

  useEffect(() => {
    setAvatarPreviewFailed(false);
  }, [avatarUrl]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarObjectUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarObjectUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [avatarFile]);

  const avatarPreviewUrl = avatarObjectUrl ?? avatarUrl;

  function handleAvatarFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setMessage(null);
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Profile photo must be an image.");
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("Profile photo must be 2 MB or smaller.");
      event.target.value = "";
      return;
    }

    setAvatarFile(file);
    setAvatarPreviewFailed(false);
  }

  function clearAvatar() {
    setAvatarFile(null);
    setAvatarUrl("");
    setAvatarPreviewFailed(false);

    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSavingLabel(avatarFile ? "Uploading photo..." : "Saving...");
    setMessage(null);
    setError(null);

    try {
      let nextAvatarUrl = avatarUrl.trim();

      if (avatarFile) {
        const uploadedAvatar = await uploadUserAvatar(avatarFile);
        nextAvatarUrl = uploadedAvatar.url;
        setAvatarUrl(nextAvatarUrl);
        setAvatarFile(null);
        setSavingLabel("Saving profile...");
      }

      const updated = await updateMe({
        displayName: displayName.trim(),
        phoneE164: phoneE164.trim() || null,
        avatarUrl: nextAvatarUrl,
      });
      setAuthenticated(updated);
      setMessage("Profile saved.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEnableNotifications() {
    setMessage(null);
    setError(null);

    const nextStatus = await requestBrowserNotifications();
    setNotificationStatus(nextStatus);

    if (nextStatus === "granted") {
      setMessage("Browser notifications enabled.");
    } else if (nextStatus === "denied") {
      setError("Notifications are blocked in this browser.");
    } else if (nextStatus === "unsupported") {
      setError("This browser does not support notifications.");
    }
  }

  return (
    <ProtectedRoute>
      <main className="min-h-[100dvh] bg-[#0f1013] p-2 text-zinc-50 md:p-3">
        {error ? (
          <ProfileNotice type="error" message={error} onDismiss={() => setError(null)} />
        ) : null}
        {message ? (
          <ProfileNotice
            type="success"
            message={message}
            onDismiss={() => setMessage(null)}
          />
        ) : null}

        <div className="mx-auto flex min-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#111216] shadow-2xl shadow-black/40 md:min-h-[calc(100dvh-1.5rem)] lg:grid lg:grid-cols-[0.85fr_1.15fr]">
          <section className="border-b border-white/10 bg-[#15171c] p-5 lg:border-b-0 lg:border-r lg:p-7">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back to chats
            </Link>

            <div className="mt-8 flex flex-col items-center text-center">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-slate-700 text-4xl font-black text-white ring-1 ring-white/10 shadow-2xl shadow-black/35">
                {avatarPreviewUrl && !avatarPreviewFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarPreviewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setAvatarPreviewFailed(true)}
                  />
                ) : (
                  displayName.slice(0, 1).toUpperCase() || "U"
                )}
              </div>
              <h1 className="mt-5 max-w-full truncate text-3xl font-black text-white">
                {displayName || "Your profile"}
              </h1>
              <p className="mt-2 max-w-full truncate text-sm text-slate-400">
                {user?.email ?? user?.phoneE164 ?? user?.id}
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Account status
              </p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-200">Online presence</span>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-200">
                  Active
                </span>
              </div>
            </div>
          </section>

          <form onSubmit={handleSubmit} className="min-h-0 space-y-5 overflow-y-auto p-5 lg:p-7">
            <section className="rounded-2xl border border-white/10 bg-[#20232b] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-100">
                    Browser notifications
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    {notificationStatus === "granted"
                      ? "Enabled for incoming calls and new messages."
                      : notificationStatus === "denied"
                        ? "Blocked by browser settings."
                        : notificationStatus === "unsupported"
                          ? "Not supported in this browser."
                          : "Enable alerts for calls and messages."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleEnableNotifications}
                  disabled={
                    notificationStatus === "granted" ||
                    notificationStatus === "denied" ||
                    notificationStatus === "unsupported"
                  }
                  className="h-10 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-4 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-slate-500"
                >
                  {notificationStatus === "granted" ? "Enabled" : "Enable"}
                </button>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Personal details
              </p>

              <label htmlFor="displayName" className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-300">
                  Display name
                </span>
                <input
                  id="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#20232b] px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                />
              </label>

              <label htmlFor="phone" className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-300">
                  Phone number
                </span>
                <input
                  id="phone"
                  value={phoneE164}
                  onChange={(event) => setPhoneE164(event.target.value)}
                  placeholder="+917999106835"
                  className="w-full rounded-2xl border border-white/10 bg-[#20232b] px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                />
                <span className="mt-2 block text-xs text-slate-500">
                  Use E.164 format with country code. This is how other users find you.
                </span>
              </label>

              <div className="rounded-2xl border border-white/10 bg-[#20232b] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-300">
                      Profile photo
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {avatarFile
                        ? avatarFile.name
                        : avatarUrl
                          ? "Using saved image URL"
                          : "Upload an image up to 2 MB."}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={handleAvatarFileChange}
                    />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={saving}
                      className="h-9 rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Choose photo
                    </button>
                    {(avatarUrl || avatarFile) ? (
                      <button
                        type="button"
                        onClick={clearAvatar}
                        disabled={saving}
                        className="h-9 rounded-full border border-red-300/20 bg-red-500/10 px-3 text-xs font-bold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <label htmlFor="avatar" className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-300">
                  Avatar URL
                </span>
                <input
                  id="avatar"
                  value={avatarUrl}
                  onChange={(event) => {
                    setAvatarFile(null);
                    setAvatarUrl(event.target.value);
                  }}
                  placeholder="https://..."
                  className="w-full rounded-2xl border border-white/10 bg-[#20232b] px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                />
                <span className="mt-2 block text-xs text-slate-500">
                  You can paste a direct image link or choose a photo above.
                </span>
              </label>
            </section>

            <button
              type="submit"
              disabled={saving}
              className="h-12 w-full rounded-2xl bg-emerald-500 px-4 text-sm font-black text-white shadow-lg shadow-emerald-950/25 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
            >
              {saving ? savingLabel : "Save profile"}
            </button>
          </form>
        </div>
      </main>
    </ProtectedRoute>
  );
}
