import { notFound } from "next/navigation";
import { SentryTestButton } from "./SentryTestButton";

export default function SentryTestPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#111216] p-6 text-white">
      <div className="rounded-2xl border border-white/10 bg-[#17191f] p-6 shadow-2xl shadow-black/30">
        <h1 className="text-lg font-bold">Sentry test</h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
          This development-only page throws a frontend test error.
        </p>
        <div className="mt-5">
          <SentryTestButton />
        </div>
      </div>
    </main>
  );
}
