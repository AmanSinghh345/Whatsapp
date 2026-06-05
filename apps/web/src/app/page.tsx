"use client";

import { ProtectedRoute } from "../features/auth/components/protected-route";
import { useAuthStore } from "../features/auth/store/auth.store";

export default function HomePage() {
  const user = useAuthStore((s) => s.user);

  return (
    <ProtectedRoute>
      <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6">
        <div className="rounded-lg border border-white/10 p-6 text-center">
          <h1 className="text-xl font-semibold">Chat App</h1>
          <p className="mt-2 text-sm text-white/70">Authenticated as {user?.displayName ?? "Unknown user"}.</p>
        </div>
      </main>
    </ProtectedRoute>
  );
}

