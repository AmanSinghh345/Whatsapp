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
      <main className="min-h-screen bg-zinc-950 text-zinc-50">
        <div className="mx-auto max-w-2xl px-6 py-8">
          <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300">
            Back to chats
          </Link>

          <header className="mt-6 border-b border-white/10 pb-6">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-700 text-2xl font-semibold">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  displayName.slice(0, 1).toUpperCase() || "U"
                )}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold">Profile</h1>
                <p className="mt-1 truncate text-sm text-white/55">
                  {user?.email ?? user?.phoneE164 ?? user?.id}
                </p>
              </div>
            </div>
          </header>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="displayName" className="mb-2 block text-sm text-white/70">
                Display name
              </label>
              <input
                id="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-md border border-white/15 bg-transparent px-3 py-3 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label htmlFor="phone" className="mb-2 block text-sm text-white/70">
                Phone number
              </label>
              <input
                id="phone"
                value={phoneE164}
                onChange={(event) => setPhoneE164(event.target.value)}
                placeholder="+917999106835"
                className="w-full rounded-md border border-white/15 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-white/30 focus:border-emerald-500"
              />
              <p className="mt-2 text-xs text-white/45">
                Use E.164 format with country code. This is how other users find you.
              </p>
            </div>

            <div>
              <label htmlFor="avatar" className="mb-2 block text-sm text-white/70">
                Avatar URL
              </label>
              <input
                id="avatar"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://..."
                className="w-full rounded-md border border-white/15 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-white/30 focus:border-emerald-500"
              />
            </div>

            {error ? (
              <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            ) : null}

            {message ? (
              <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>
          </form>
        </div>
      </main>
    </ProtectedRoute>
  );
}
