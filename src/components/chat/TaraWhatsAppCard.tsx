"use client";

import { X } from "lucide-react";
import { FACTS } from "@/lib/facts";

/**
 * Hands a buying customer to RDC Tara, the WhatsApp assistant that books
 * orders and logs complaints 24x7 (RDC's decision, 2026-09-27). It replaces the
 * old in-chat lead form: no phone numbers or e-mail addresses are collected
 * here, and nobody waits for a sales call-back.
 */
const COPY = {
  en: {
    title: "Order, quote or complaint?",
    body: `Message ${FACTS.tara.name} on WhatsApp — it can book an order, log a complaint or answer a query, 24x7.`,
    button: `Chat with ${FACTS.tara.name} on WhatsApp`,
    call: "Prefer to call? Head office",
    prefill: "Hello Tara, I found you on the RDC website and need help with ready-mix concrete.",
  },
  hi: {
    title: "ऑर्डर, कोटेशन या शिकायत?",
    body: `WhatsApp पर ${FACTS.tara.name} को मैसेज करें — ऑर्डर बुक करना, शिकायत दर्ज करना या सवाल पूछना, 24x7।`,
    button: `WhatsApp पर ${FACTS.tara.name} से बात करें`,
    call: "फ़ोन करना चाहें? हेड ऑफिस",
    prefill: "नमस्ते Tara, मुझे RDC वेबसाइट से आपका नंबर मिला है और रेडी-मिक्स कंक्रीट के लिए मदद चाहिए।",
  },
};

export default function TaraWhatsAppCard({ language, onDismiss }: { language: string; onDismiss: () => void }) {
  const copy = language === "hi" ? COPY.hi : COPY.en;
  const href = `${FACTS.tara.link}?text=${encodeURIComponent(copy.prefill)}`;
  return (
    <div className="relative rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm">
      <button onClick={onDismiss} className="absolute right-2 top-2 text-green-700/60 hover:text-green-800" aria-label="Close">
        <X size={14} />
      </button>
      <p className="pr-5 text-sm font-semibold text-green-900">{copy.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-green-900/80">{copy.body}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
        style={{ background: "#25D366" }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M20.52 3.48A11.8 11.8 0 0 0 12.04 0C5.46 0 .1 5.35.1 11.93c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 0 0 5.77 1.47h.01c6.58 0 11.94-5.35 11.94-11.93 0-3.19-1.24-6.19-3.47-8.42ZM12.05 21.8h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.72.97.99-3.62-.24-.37a9.86 9.86 0 0 1-1.52-5.26c0-5.46 4.45-9.9 9.91-9.9 2.65 0 5.13 1.03 7 2.9a9.84 9.84 0 0 1 2.9 7c0 5.46-4.45 9.88-9.91 9.88Zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
        </svg>
        {copy.button}
      </a>
      <p className="mt-2 text-center text-[11px] text-green-900/70">
        {copy.call}:{" "}
        <a className="font-medium underline" href={`tel:${FACTS.headOffice.phone.replace(/\s+/g, "")}`}>
          {FACTS.headOffice.phone}
        </a>
      </p>
    </div>
  );
}
