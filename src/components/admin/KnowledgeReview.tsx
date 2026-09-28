"use client";
import { useCallback, useEffect, useState } from "react";
import { withBase } from "@/lib/basePath";

interface DailyInfo { recipients: string[]; mailConfigured: boolean; sendHourIst: number; lastSentOn: string | null }

function yesterdayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 - 24 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function KnowledgeReview({token}: {token: string}) {
  const [questions, setQuestions] = useState<Array<{id: string; question: string; occurrences: number; reason: string}>>([]);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [day, setDay] = useState(yesterdayIst);
  const [info, setInfo] = useState<DailyInfo | null>(null);
  const headers = {"x-admin-token": token};
  const refresh = useCallback(async () => {
    const res = await fetch(withBase("/api/admin/questions"), {headers: {"x-admin-token": token}});
    if (!res.ok) throw new Error("Could not load questions. Please sign in again.");
    setQuestions((await res.json()).questions);
    const daily = await fetch(withBase("/api/admin/daily-review?info=1"), {headers: {"x-admin-token": token}});
    if (daily.ok) setInfo(await daily.json());
  }, [token]);
  useEffect(() => {refresh().catch(e => setMessage(e.message));}, [refresh]);
  async function save(path: string, filename: string) {
    setBusy(true); setMessage("");
    try {
      const res = await fetch(withBase(path), {headers});
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Download failed. Please sign in again.");
      const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a");
      a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    } catch(e) {setMessage(e instanceof Error ? e.message : "Download failed");} finally {setBusy(false);}
  }
  async function emailNow() {
    setBusy(true); setMessage("Sending…");
    try {
      const res = await fetch(withBase("/api/admin/daily-review"), {method: "POST", headers: {...headers, "Content-Type": "application/json"}, body: JSON.stringify({day})});
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setMessage(`Sent ${data.questions} question(s) for ${day} to ${data.recipients.join(", ")}.`);
    } catch(e) {setMessage(e instanceof Error ? e.message : "Sending failed");} finally {setBusy(false);}
  }
  async function upload(file?: File) {
    if (!file) return; setBusy(true); setMessage("Validating answers and updating knowledge…");
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch(withBase("/api/admin/questions"), {method: "POST", headers, body: form});
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setMessage(`${data.published} refined answer(s) published; ${data.skipped} unchanged. TARA uses them from the next question.`); await refresh();
    } catch(e) {setMessage(e instanceof Error ? e.message : "Import failed");} finally {setBusy(false);}
  }
  return <section className="bg-white rounded-xl border border-gray-100 p-5 mb-6 text-gray-800">
    <h2 className="font-semibold text-lg">Daily questions and answers</h2>
    <p className="text-sm text-gray-600 my-3">
      Every morning{info ? ` after ${info.sendHourIst}:00` : ""} the previous day’s questions, with the answer TARA gave, are e-mailed as Excel
      {info?.recipients.length ? ` to ${info.recipients.join(", ")}` : " (no reviewers configured on this deployment)"}.
      Write a better answer in <b>Refined answer</b> where needed, set Publish to YES, and upload the sheet below. TARA gives the refined answer from then on.
      {info?.lastSentOn ? ` Last sent: ${info.lastSentOn}.` : ""}
      {info && !info.mailConfigured ? " E-mail is not configured here." : ""}
    </p>
    <div className="flex flex-wrap items-end gap-3 my-4">
      <label className="text-sm">Day<input type="date" value={day} max={yesterdayIst()} onChange={e => setDay(e.target.value)} className="block border rounded px-2 py-1.5 mt-1" /></label>
      <button disabled={busy} onClick={() => save(`/api/admin/daily-review?day=${day}`, `TARA-Online-questions-${day}.xlsx`)} className="bg-orange-600 text-white rounded px-4 py-2 disabled:opacity-50">Download that day’s sheet</button>
      <button disabled={busy || !info?.recipients.length} onClick={emailNow} className="border rounded px-4 py-2 disabled:opacity-50">E-mail it now</button>
      <label className="border rounded px-4 py-2 cursor-pointer">Upload refined sheet<input aria-label="Upload refined sheet" type="file" accept=".xlsx" disabled={busy} className="block text-xs mt-2" onChange={e => {upload(e.target.files?.[0]); e.target.value = "";}} /></label>
    </div>
    {message && <p role="status" className="text-sm p-3 bg-blue-50 rounded my-3">{message}</p>}

    <h3 className="font-semibold mt-6">Questions TARA could not answer ({questions.length})</h3>
    <div className="flex flex-wrap gap-3 my-3">
      <button disabled={busy} onClick={() => save("/api/admin/questions?format=xlsx", "TARA-Online-unanswered.xlsx")} className="border rounded px-4 py-2">Download unanswered questions</button>
      <button disabled={busy} onClick={() => save("/api/admin/questions?format=xlsx&all=true", "TARA-Online-all-questions.xlsx")} className="border rounded px-4 py-2">Download all for corrections</button>
    </div>
    {questions.length === 0 ? <p className="text-sm text-gray-500">None waiting. Questions TARA cannot answer from her knowledge appear here as well as in the daily sheet.</p> : <ul className="divide-y">{questions.slice(0, 30).map(q => <li key={q.id} className="py-3 text-sm">{q.question}<span className="block text-xs text-gray-500">Asked {q.occurrences} time(s) · {q.reason.replaceAll("_", " ")}</span></li>)}</ul>}
  </section>;
}
