"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../features/auth/store/auth.store";
import { loginWithGoogle, getGoogleLoginErrorMessage, startPhoneOtpScaffold } from "../../features/auth/lib/login-actions";

export default function LoginPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace("/");
    }
  }, [router, status, user]);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (error) {
      setError(getGoogleLoginErrorMessage(error));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handlePhoneScaffold = async () => {
    setError(null);
    try {
      await startPhoneOtpScaffold(phone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Phone OTP scaffold error.");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6">
      <div className="w-full rounded-xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-2xl font-semibold">Login</h1>
        <p className="mt-2 text-sm text-white/70">Use Google now. Phone OTP scaffold is prepared for next step.</p>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          className="mt-6 w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {googleLoading ? "Signing in..." : "Continue with Google"}
        </button>

        <div className="my-6 h-px bg-white/10" />

        <label htmlFor="phone" className="mb-2 block text-sm text-white/80">
          Phone number (E.164)
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+919876543210"
          className="w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <button
          type="button"
          onClick={handlePhoneScaffold}
          className="mt-3 w-full rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
        >
          Send OTP (Scaffold)
        </button>
        <p className="mt-2 text-xs text-white/50">Phone OTP verify flow intentionally not implemented yet.</p>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      </div>
    </main>
  );
}

