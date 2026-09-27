"use client";
import { useCallback, useEffect, useState } from "react";
export default function KnowledgeReview({token}: {token: string}) {
  const [questions, setQuestions] = useState<Array<{id: string; question: string; occurrences: number; reason: string}>>([]);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/questions", {headers: {"x-admin-token": token}});
    if (!res.ok) throw new Error("Could not load questions. Please sign in again.");
    setQuestions((await res.json()).questions);
  }, [token]);
  useEffect(() => {refresh().catch(e => setMessage(e.message));}, [refresh]);
  async function download(all = false) {
    setBusy(true); setMessage("");
    try {
      const res = await fetch(`/api/admin/questions?format=xlsx&all=${all}`, {headers: {"x-admin-token": token}});
      if (!res.ok) throw new Error("Download failed. Please sign in again.");
      const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a");
      a.href = url; a.download = "RDC-Unanswered-Questions.xlsx"; a.click(); URL.revokeObjectURL(url);
    } catch(e) {setMessage(e instanceof Error ? e.message : "Download failed");} finally {setBusy(false);}
  }
  async function upload(file?: File) {
    if (!file) return; setBusy(true); setMessage("Validating answers and updating knowledge…");
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/admin/questions", {method: "POST", headers: {"x-admin-token": token}, body: form});
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setMessage(`${data.published} answers published; ${data.skipped} unchanged. Ready for the next chat question.`); await refresh();
    } catch(e) {setMessage(e instanceof Error ? e.message : "Import failed");} finally {setBusy(false);}
  }
  return <section className="bg-white rounded-xl border border-gray-100 p-5 mb-6 text-gray-800">
    <h2 className="font-semibold text-lg">Unanswered questions ({questions.length})</h2>
    <p className="text-sm text-gray-600 my-3">Download the Excel sheet, fill the Answer column and set Publish to YES for the answers you approve. Upload it here to add those answers to the chatbot’s knowledge. Keep employee information in the separate employee workbook.</p>
    <div className="flex flex-wrap gap-3 my-4">
      <button disabled={busy} onClick={() => download()} className="bg-orange-600 text-white rounded px-4 py-2 disabled:opacity-50">Download unanswered questions</button>
      <button disabled={busy} onClick={() => download(true)} className="border rounded px-4 py-2">Download all for corrections</button>
      <label className="border rounded px-4 py-2 cursor-pointer">Upload answered Excel<input aria-label="Upload answered Excel" type="file" accept=".xlsx" disabled={busy} className="block text-xs mt-2" onChange={e => {upload(e.target.files?.[0]); e.target.value = "";}} /></label>
    </div>
    {message && <p role="status" className="text-sm p-3 bg-blue-50 rounded my-3">{message}</p>}
    {questions.length === 0 ? <p className="text-sm text-gray-500">No pending questions. Questions the chatbot cannot answer will appear here.</p> : <ul className="divide-y">{questions.slice(0, 30).map(q => <li key={q.id} className="py-3 text-sm">{q.question}<span className="block text-xs text-gray-500">Asked {q.occurrences} time(s) · {q.reason.replaceAll("_", " ")}</span></li>)}</ul>}
  </section>;
}
