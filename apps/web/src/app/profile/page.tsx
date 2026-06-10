"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProtectedRoute } from "../../features/auth/components/protected-route";
import { useAuthStore } from "../../features/auth/store/auth.store";
import { updateMe } from "../../features/user/api/users.api";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const [displayName, setDisplayName] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    setDisplayName(user.displayName);
    setPhoneE164(user.phoneE164 ?? "");
    setAvatarUrl(user.avatarUrl ?? "");
  }, [user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const updated = await updateMe({
        displayName,
        phoneE164,
        avatarUrl,
      });
      setAuthenticated(updated);
      setMessage("Profile saved.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-[#0f1013] p-0 text-zinc-50 md:p-6">
        <div className="mx-auto min-h-[calc(100vh-3rem)] max-w-3xl border border-white/10 bg-[#17191f] px-5 py-6 shadow-2xl shadow-black/40 md:rounded-3xl md:px-8">
          <Link
            href="/"
            className="inline-flex items-center rounded-full bg-[#20232b] px-4 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-white/[0.08] hover:text-emerald-300"
          >
            Back to chats
          </Link>

          <header className="mt-8 border-b border-white/10 pb-8">
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-500 to-slate-700 text-3xl font-bold ring-1 ring-white/10">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  displayName.slice(0, 1).toUpperCase() || "U"
                )}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-3xl font-bold">Profile</h1>
                <p className="mt-2 truncate text-sm text-slate-400">
                  {user?.email ?? user?.phoneE164 ?? user?.id}
                </p>
              </div>
            </div>
          </header>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="displayName" className="mb-2 block text-sm font-semibold text-slate-300">
                Display name
              </label>
              <input
                id="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#20232b] px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
              />
            </div>

            <div>
              <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-slate-300">
                Phone number
              </label>
              <input
                id="phone"
                value={phoneE164}
                onChange={(event) => setPhoneE164(event.target.value)}
                placeholder="+917999106835"
                className="w-full rounded-2xl border border-white/10 bg-[#20232b] px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
              />
              <p className="mt-2 text-xs text-slate-500">
                Use E.164 format with country code. This is how other users find you.
              </p>
            </div>

            <div>
              <label htmlFor="avatar" className="mb-2 block text-sm font-semibold text-slate-300">
                Avatar URL
              </label>
              <input
                id="avatar"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://..."
                className="w-full rounded-2xl border border-white/10 bg-[#20232b] px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
              />
            </div>

            {error ? (
              <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </p>
            ) : null}

            {message ? (
              <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>
          </form>
        </div>
      </main>
    </ProtectedRoute>
  );
}
