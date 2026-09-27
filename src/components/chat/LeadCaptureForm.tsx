"use client";

import React, { useState } from "react";
import { X, Send, CheckCircle, Loader } from "lucide-react";

interface LeadFormData {
  name: string;
  company: string;
  mobile: string;
  email: string;
  city: string;
  projectType: string;
  estimatedQty: string;
  requirementTiming: string;
  notes: string;
}

interface LeadCaptureFormProps {
  sessionId: string | null;
  intent: string;
  detectedLanguage: string;
  onSubmit: () => void;
  onDismiss: () => void;
}

const PROJECT_TYPES = [
  "Residential",
  "Commercial",
  "Infrastructure",
  "Industrial",
  "Government / PSU",
  "Other",
];

const TIMING_OPTIONS = [
  "Immediately",
  "Within 1 week",
  "1–4 weeks",
  "1–3 months",
  "3+ months",
];

export default function LeadCaptureForm({
  sessionId,
  intent,
  detectedLanguage,
  onSubmit,
  onDismiss,
}: LeadCaptureFormProps) {
  const [step, setStep] = useState<"prompt" | "form" | "success">("prompt");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<LeadFormData>({
    name: "",
    company: "",
    mobile: "",
    email: "",
    city: "",
    projectType: "",
    estimatedQty: "",
    requirementTiming: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Partial<LeadFormData>>({});
  const languageCode = detectedLanguage || "en";

  const handleChange = (field: keyof LeadFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<LeadFormData> = {};
    if (!formData.mobile && !formData.email) {
      newErrors.mobile = "At least mobile or email is required";
    }
    if (!formData.name) newErrors.name = "Name is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          sessionId,
          detectedIntent: intent,
        }),
      });

      if (res.ok) {
        setStep("success");
        setTimeout(() => onSubmit(), 2500);
      } else {
        alert("Something went wrong. Please try again.");
      }
    } catch {
      alert("Connection error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "prompt") {
    return (
      <div
        className="rounded-xl border p-4"
        style={{
          background: "linear-gradient(135deg, rgba(232, 93, 4, 0.05) 0%, rgba(244, 140, 6, 0.05) 100%)",
          borderColor: "rgba(232, 93, 4, 0.2)",
        }}
      >
        <div className="flex items-start justify-between mb-2">
          <p className="text-sm font-semibold text-gray-700">
            📋 Want a quick response from our team?
          </p>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Share your details and our sales team will reach out with the right information for your project.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setStep("form")}
            className="flex-1 text-xs font-medium py-2 px-3 rounded-lg text-white transition-all"
            style={{
              background: "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)",
            }}
          >
            Yes, connect me →
          </button>
          <button
            onClick={onDismiss}
            className="text-xs text-gray-500 hover:text-gray-700 py-2 px-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-all"
          >
            Later
          </button>
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="rounded-xl border border-green-200 p-5 text-center bg-green-50">
        <CheckCircle className="mx-auto mb-2 text-green-500" size={28} />
        <p className="font-semibold text-green-800 text-sm mb-1">Thank you!</p>
        <p className="text-xs text-green-600">
          Our team will get in touch with you shortly. We look forward to supporting your project!
        </p>
      </div>
    );
  }

  return (
    <div
      lang={languageCode}
      className="rounded-xl border p-4"
      style={{
        borderColor: "rgba(226, 232, 240, 0.8)",
        background: "white",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">Connect with RDC Sales</p>
        <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Name */}
        <div>
          <input
            type="text"
            placeholder="Your name *"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            className={`rdc-input text-xs ${errors.name ? "border-red-400" : ""}`}
            id="lead-name"
          />
          {errors.name && <p className="text-red-400 text-xs mt-0.5">{errors.name}</p>}
        </div>

        {/* Company */}
        <input
          type="text"
          placeholder="Company / Organisation"
          value={formData.company}
          onChange={(e) => handleChange("company", e.target.value)}
          className="rdc-input text-xs"
          id="lead-company"
        />

        {/* Mobile & Email */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <input
              type="tel"
              placeholder="Mobile *"
              value={formData.mobile}
              onChange={(e) => handleChange("mobile", e.target.value)}
              className={`rdc-input text-xs ${errors.mobile ? "border-red-400" : ""}`}
              id="lead-mobile"
            />
            {errors.mobile && (
              <p className="text-red-400 text-xs mt-0.5">{errors.mobile}</p>
            )}
          </div>
          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => handleChange("email", e.target.value)}
            className="rdc-input text-xs"
            id="lead-email"
          />
        </div>

        {/* City */}
        <input
          type="text"
          placeholder="City / Location"
          value={formData.city}
          onChange={(e) => handleChange("city", e.target.value)}
          className="rdc-input text-xs"
          id="lead-city"
        />

        {/* Project Type */}
        <select
          value={formData.projectType}
          onChange={(e) => handleChange("projectType", e.target.value)}
          className="rdc-input text-xs"
          id="lead-project-type"
        >
          <option value="">Project type (optional)</option>
          {PROJECT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* Quantity & Timing */}
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Est. quantity (m³)"
            value={formData.estimatedQty}
            onChange={(e) => handleChange("estimatedQty", e.target.value)}
            className="rdc-input text-xs"
            id="lead-qty"
          />
          <select
            value={formData.requirementTiming}
            onChange={(e) => handleChange("requirementTiming", e.target.value)}
            className="rdc-input text-xs"
            id="lead-timing"
          >
            <option value="">When needed?</option>
            {TIMING_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <textarea
          placeholder="Any specific requirements? (optional)"
          value={formData.notes}
          onChange={(e) => handleChange("notes", e.target.value)}
          rows={2}
          className="rdc-input text-xs resize-none"
          id="lead-notes"
        />

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-70"
          style={{
            background: "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)",
          }}
          id="lead-submit"
        >
          {isSubmitting ? (
            <>
              <Loader size={14} className="animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send size={14} />
              Send to RDC Team
            </>
          )}
        </button>

        <p className="text-center text-gray-300 text-xs">
          Your information is kept confidential
        </p>
      </form>
    </div>
  );
}
