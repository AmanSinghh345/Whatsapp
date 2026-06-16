"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../features/auth/store/auth.store";
import {
  getGoogleLoginErrorMessage,
  loginWithGoogle,
  startPhoneOtpScaffold,
} from "../../features/auth/lib/login-actions";

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
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#070b10] text-slate-100">
      <div className="login-glow pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />
      <div className="login-glow pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-[1480px] grid-cols-1 gap-4 p-3 lg:grid-cols-[minmax(390px,0.78fr)_minmax(0,1.22fr)] lg:p-4">
        <section className="flex min-h-0 items-center justify-center rounded-3xl border border-white/10 bg-[#11161e]/95 px-5 py-8 shadow-2xl shadow-black/30 sm:px-8 lg:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-500/10 text-emerald-200 shadow-lg shadow-emerald-950/20">
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                >
                  <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                  <path d="M8 9h8" />
                  <path d="M8 13h5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-white">Chat App</p>
                <p className="text-xs font-medium text-slate-500">
                  Real-time workspace
                </p>
              </div>
            </div>

            <p className="mb-3 inline-flex rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
              Welcome back
            </p>

            <h1 className="text-4xl font-black leading-tight text-white sm:text-5xl">
              Sign in to
              <span className="mt-1 block h-[1.1em] overflow-hidden text-emerald-300">
                <span className="login-word-track block">
                  <span className="block">chat faster.</span>
                  <span className="block">share safely.</span>
                  <span className="block">call clearly.</span>
                </span>
              </span>
            </h1>

            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
              Pick up every conversation, invite your groups, and keep calls and
              messages in one polished workspace.
            </p>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-3 shadow-2xl shadow-black/25">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-white text-sm font-black text-[#11161e] shadow-lg shadow-black/20 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-black/10 text-sm font-black">
                  G
                </span>
                {googleLoading ? "Signing in..." : "Continue with Google"}
              </button>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  or
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <label
                htmlFor="phone"
                className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500"
              >
                Phone number
              </label>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#202630] px-4 py-3 transition focus-within:border-emerald-400/60 focus-within:bg-[#242b36]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0 text-emerald-300"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.08 5.18 2 2 0 0 1 5.06 3h3a2 2 0 0 1 2 1.72c.12.9.32 1.77.59 2.61a2 2 0 0 1-.45 2.11L9 10.64a16 16 0 0 0 4.36 4.36l1.2-1.2a2 2 0 0 1 2.11-.45c.84.27 1.71.47 2.61.59A2 2 0 0 1 22 16.92z" />
                </svg>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+919876543210"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>

              <button
                type="button"
                onClick={handlePhoneScaffold}
                className="mt-3 flex h-11 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] text-sm font-bold text-slate-100 transition hover:bg-white/[0.08]"
              >
                Send OTP
              </button>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                Phone OTP verify flow is prepared for the next auth step.
              </p>

              {error ? (
                <p className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="relative hidden min-h-0 overflow-hidden rounded-3xl border border-white/10 bg-[#0e141d] shadow-2xl shadow-black/30 lg:block">
          <img
            src="/images/login-hero.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070b10]/35 via-transparent to-[#070b10]/20" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#070b10]/80 to-transparent" />

          <div className="login-float absolute left-8 top-8 rounded-2xl border border-white/10 bg-[#101722]/80 px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur">
            <p className="text-xs font-bold text-emerald-200">Aman Singh</p>
            <p className="mt-1 text-xs text-slate-400">Typing...</p>
          </div>

          <div className="login-float-slow absolute bottom-8 left-8 max-w-sm rounded-3xl border border-white/10 bg-[#101722]/80 p-5 shadow-2xl shadow-black/30 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              Live conversations
            </p>
            <p className="mt-3 text-2xl font-black leading-tight text-white">
              Messages, groups, and video calls in one calm place.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              {["Online", "Groups", "Calls"].map((item) => (
                <span
                  key={item}
                  className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-bold text-slate-200"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
