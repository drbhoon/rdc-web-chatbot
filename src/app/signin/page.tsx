import Image from "next/image";
import { withBase } from "@/lib/basePath";
import { allowedDomain, safeNext } from "@/lib/auth/rdcLogin";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  domain: "Please sign in with your company Google account.",
  failed: "Sign-in did not complete. Please try again.",
};

export default async function SignIn({searchParams}: {searchParams: Promise<{next?: string; error?: string; signedout?: string}>}) {
  const {next, error, signedout} = await searchParams;
  const domain = allowedDomain();
  const start = withBase(`/api/auth/google?next=${encodeURIComponent(safeNext(next))}`);
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl">
        <Image
          src={withBase("/saathi-avatar-v2.png")}
          alt=""
          width={112}
          height={112}
          priority
          className="mx-auto h-28 w-28 rounded-full object-cover object-top ring-4 ring-orange-400"
        />
        <h1 className="mt-5 text-2xl font-bold text-slate-900">TARA Online</h1>
        <p className="mt-2 text-sm text-slate-600">
          RDC&apos;s digital assistant. Sign in with your @{domain} Google account to talk to TARA.
        </p>
        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{MESSAGES[error] || MESSAGES.failed}</p>}
        {signedout && !error && <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">You have signed out.</p>}
        <a
          href={start}
          className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-800 shadow-sm hover:bg-slate-50"
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.4 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
            <path fill="#FBBC05" d="M10.5 28.6a14.5 14.5 0 0 1 0-9.2l-7.9-6.2a24 24 0 0 0 0 21.6l7.9-6.2z" />
            <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.6l-7.7-6c-2.1 1.4-4.8 2.3-7.5 2.3-6.3 0-11.6-3.9-13.5-9.5l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Sign in with Google
        </a>
        <p className="mt-4 text-xs text-slate-400">Only @{domain} accounts. Your questions are reviewed to improve TARA&apos;s answers.</p>
      </div>
    </main>
  );
}
