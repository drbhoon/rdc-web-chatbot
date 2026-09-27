"use client";

import KnowledgeReview from "@/components/admin/KnowledgeReview";
import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart3, MessageSquare, Users, Settings, LogOut,
  Eye, TrendingUp, AlertCircle, RefreshCw, Shield
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  summary: {
    totalSessions: number;
    totalMessages: number;
    totalLeads: number;
    fallbackRate: string;
  };
  languageDistribution: Array<{ language: string; count: number }>;
  intentDistribution: Array<{ intent: string; count: number }>;
  recentSessions: Array<{
    id: string;
    language: string;
    createdAt: string;
    leadCaptured: boolean;
  }>;
  recentLeads: Array<{
    id: string;
    name?: string;
    company?: string;
    mobile?: string;
    email?: string;
    city?: string;
    projectType?: string;
    status: string;
    createdAt: string;
  }>;
  lowConfidenceMessages: Array<{
    id: string;
    content: string;
    intent?: string;
    confidence?: number;
    createdAt: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Login Component
// ─────────────────────────────────────────────────────────────────────────────

function AdminLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState("admin@rdcconcrete.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        onLogin(data.token);
        localStorage.setItem("rdc_admin_token", data.token);
      } else {
        setError(data.error || "Invalid credentials");
      }
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #0F1E35 0%, #1B2A4A 100%)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ background: "white", boxShadow: "0 25px 50px rgba(0,0,0,0.4)" }}
      >
        <div className="text-center mb-8">
          <div
            className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center text-white font-bold"
            style={{ background: "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)" }}
          >
            <Shield size={24} />
          </div>
          <h1 className="text-xl font-bold text-gray-800">RDC Saathi Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Internal Management Panel</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rdc-input"
              required
              id="admin-email"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="rdc-input"
              required
              id="admin-password"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)" }}
            id="admin-login-btn"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Sign in with your configured administrator credentials.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  color = "#E85D04",
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 font-medium">{title}</span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15`, color }}
        >
          <Icon size={16} />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Language Names
// ─────────────────────────────────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", ta: "Tamil",
  te: "Telugu", kn: "Kannada", ml: "Malayalam", gu: "Gujarati",
  pa: "Punjabi", bn: "Bengali",
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────

function AdminDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<"overview" | "sessions" | "leads" | "knowledge">("overview");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/analytics", {
        headers: { "x-admin-token": token },
      });
      if (!res.ok) {
        if (res.status === 401) { onLogout(); return; }
        throw new Error("Failed to load analytics");
      }
      const data = await res.json();
      setAnalytics(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "sessions", label: "Sessions", icon: MessageSquare },
    { id: "leads", label: "Leads", icon: Users },
    { id: "knowledge", label: "Knowledge", icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen" style={{ background: "#F8FAFC" }}>
      {/* Header */}
      <div
        className="border-b sticky top-0 z-40"
        style={{ background: "white", borderColor: "#E2E8F0" }}
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                style={{ background: "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)" }}
              >
                RDC
              </div>
              <span className="font-semibold text-gray-800 text-sm">Saathi Admin</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchAnalytics}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut size={13} /> Sign Out
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 pb-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-all border-b-2 ${
                  activeTab === tab.id
                    ? "border-orange-500 text-orange-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <tab.icon size={13} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <RefreshCw size={20} className="animate-spin mr-2" />
            Loading...
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
            Error: {error}
          </div>
        )}

        {!loading && analytics && (
          <>
            {/* ── Overview ───────────────────────────────────────────── */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard title="Total Sessions" value={analytics.summary.totalSessions} icon={MessageSquare} />
                  <StatCard title="Total Messages" value={analytics.summary.totalMessages} icon={TrendingUp} color="#3B82F6" />
                  <StatCard title="Leads Captured" value={analytics.summary.totalLeads} icon={Users} color="#10B981" />
                  <StatCard title="Fallback Rate" value={analytics.summary.fallbackRate} icon={AlertCircle} color="#F59E0B" />
                </div>

                {/* Language Distribution */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl border border-gray-100 p-5">
                    <h3 className="font-semibold text-gray-700 mb-4 text-sm">Language Distribution</h3>
                    <div className="space-y-2">
                      {analytics.languageDistribution.map((l) => {
                        const max = analytics.languageDistribution[0]?.count || 1;
                        const pct = Math.round((l.count / max) * 100);
                        return (
                          <div key={l.language} className="flex items-center gap-3">
                            <span className="text-xs text-gray-600 w-16 flex-shrink-0">
                              {LANG_NAMES[l.language] || l.language}
                            </span>
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div
                                className="h-2 rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  background: "linear-gradient(90deg, #E85D04 0%, #F48C06 100%)",
                                }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-8 text-right">{l.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Intent Distribution */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5">
                    <h3 className="font-semibold text-gray-700 mb-4 text-sm">Top Intents</h3>
                    <div className="space-y-2">
                      {analytics.intentDistribution.slice(0, 8).map((i) => {
                        const max = analytics.intentDistribution[0]?.count || 1;
                        const pct = Math.round((i.count / max) * 100);
                        return (
                          <div key={i.intent} className="flex items-center gap-3">
                            <span className="text-xs text-gray-600 w-28 flex-shrink-0 truncate">
                              {(i.intent || "unknown").replace(/_/g, " ")}
                            </span>
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div
                                className="h-2 rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  background: "linear-gradient(90deg, #1B2A4A 0%, #243660 100%)",
                                }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-8 text-right">{i.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Low Confidence / Unanswered */}
                {analytics.lowConfidenceMessages.length > 0 && (
                  <div className="bg-white rounded-xl border border-amber-100 p-5">
                    <h3 className="font-semibold text-amber-700 mb-3 text-sm flex items-center gap-2">
                      <AlertCircle size={14} />
                      Low Confidence / Unanswered Questions
                    </h3>
                    <div className="space-y-2">
                      {analytics.lowConfidenceMessages.map((m) => (
                        <div key={m.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 truncate">{m.content}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Confidence: {((m.confidence || 0) * 100).toFixed(0)}% · Intent: {m.intent || "unknown"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Sessions ──────────────────────────────────────────── */}
            {activeTab === "sessions" && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-700 text-sm">Recent Chat Sessions</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {analytics.recentSessions.map((session) => (
                    <div key={session.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div>
                        <p className="text-xs font-mono text-gray-500">{session.id.slice(0, 8)}...</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(session.createdAt).toLocaleString()} ·{" "}
                          <span className="font-medium">{LANG_NAMES[session.language] || session.language}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {session.leadCaptured && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">
                            Lead
                          </span>
                        )}
                        <button className="text-gray-400 hover:text-orange-500 transition-colors">
                          <Eye size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Leads ─────────────────────────────────────────────── */}
            {activeTab === "leads" && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-700 text-sm">
                    Captured Leads ({analytics.recentLeads.length})
                  </h3>
                </div>
                {analytics.recentLeads.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 text-sm">
                    No leads captured yet. They will appear here once visitors submit the lead form.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {analytics.recentLeads.map((lead) => (
                      <div key={lead.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-gray-800 text-sm">{lead.name || "—"}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {lead.company && `${lead.company} · `}{lead.city || "—"}
                            </p>
                            <div className="flex items-center gap-4 mt-1.5">
                              {lead.mobile && (
                                <span className="text-xs text-gray-600">📱 {lead.mobile}</span>
                              )}
                              {lead.email && (
                                <span className="text-xs text-gray-600">📧 {lead.email}</span>
                              )}
                              {lead.projectType && (
                                <span className="text-xs text-gray-600">🏗 {lead.projectType}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                lead.status === "new"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-green-100 text-green-700"
                              }`}
                            >
                              {lead.status}
                            </span>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(lead.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Knowledge ─────────────────────────────────────────── */}
            {activeTab === "knowledge" && <KnowledgeReview token={token} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Admin Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem("rdc_admin_token")
  );

  const handleLogout = () => {
    localStorage.removeItem("rdc_admin_token");
    setToken(null);
  };

  if (!token) {
    return <AdminLogin onLogin={setToken} />;
  }

  return <AdminDashboard token={token} onLogout={handleLogout} />;
}
