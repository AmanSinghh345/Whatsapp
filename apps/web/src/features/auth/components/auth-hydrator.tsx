"use client";

import { useEffect, useRef } from "react";
import { onIdTokenChanged, signOut } from "firebase/auth";
import { getFirebaseAuth } from "../lib/firebase-client";
import { fetchMe } from "../api/me.api";
import { useAuthStore } from "../store/auth.store";

export function AuthHydrator({ children }: { children: React.ReactNode }) {
  const setLoading = useAuthStore((s) => s.setLoading);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const setUnauthenticated = useAuthStore((s) => s.setUnauthenticated);
  const status = useAuthStore((s) => s.status);
  const inFlightRef = useRef(false);
  const lastUidRef = useRef<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    let isActive = true;

    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (!isActive) {
        return;
      }
      setLoading();

      if (!firebaseUser) {
        lastUidRef.current = null;
        setUnauthenticated();
        return;
      }

      // Strict Mode in dev can trigger duplicate effect executions.
      // This guard avoids duplicate /me calls for the same user while one is already running.
      if (inFlightRef.current && lastUidRef.current === firebaseUser.uid) {
        return;
      }

      inFlightRef.current = true;
      lastUidRef.current = firebaseUser.uid;

      try {
        const idToken = await firebaseUser.getIdToken();
        if (!isActive) {
          return;
        }
        const me = await fetchMe(idToken);
        if (!isActive) {
          return;
        }
        setAuthenticated(me.user);
      } catch {
        // Edge case guard:
        // Firebase can still have a local session, while backend /me rejects
        // (revoked user, deleted backend user flow, server outage, wrong env).
        // To avoid split-brain auth state, force signOut and mark unauthenticated.
        await signOut(auth);
        setUnauthenticated();
      } finally {
        inFlightRef.current = false;
      }
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [setAuthenticated, setLoading, setUnauthenticated]);

  if (status === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6">
        <p className="text-sm text-white/70">Loading session...</p>
      </main>
    );
  }

  return <>{children}</>;
}

