import { useState, useEffect, useCallback } from "react";

// --- Types ---

interface SessionEntry {
  passport_id: string;
  agent_name: string;
  authenticated_at: string;
  session_token: string;
}

interface ProfileResult {
  passport_id: string;
  agent_name: string;
  authenticated_at: string;
}

interface ProfileState {
  token: string;
  loading: boolean;
  result: ProfileResult | null;
  error: string | null;
}

// --- Constants ---

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3846";
const DEMO_AUTH_BASE = `${API_URL}/demo/api/auth/agent`;
const SITE_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://agentpass.space";

const POLL_INTERVAL = 3000;

// --- Component ---

export default function DemoPage() {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileState>({
    token: "",
    loading: false,
    result: null,
    error: null,
  });

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${DEMO_AUTH_BASE}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } catch {
      // silently retry next poll
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const id = setInterval(fetchSessions, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchSessions]);

  const clearSessions = async () => {
    try {
      await fetch(`${DEMO_AUTH_BASE}/sessions`, { method: "DELETE" });
      setSessions([]);
      setProfile({ token: "", loading: false, result: null, error: null });
    } catch {
      // best effort
    }
  };

  const tryProtectedEndpoint = async (token: string) => {
    setProfile({ token, loading: true, result: null, error: null });
    try {
      const res = await fetch(`${DEMO_AUTH_BASE}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        setProfile((p) => ({
          ...p,
          loading: false,
          error: data.error || `HTTP ${res.status}`,
        }));
        return;
      }
      const data = await res.json();
      setProfile((p) => ({ ...p, loading: false, result: data }));
    } catch {
      setProfile((p) => ({
        ...p,
        loading: false,
        error: "Network error",
      }));
    }
  };

  return (
    <div className="relative min-h-screen bg-gray-950 pt-28 pb-20">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute top-40 right-1/4 h-[300px] w-[500px] rounded-full bg-cyan-500/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live Service
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Acme Cloud{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              + AgentPass
            </span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-gray-400">
            This is a real service with AgentPass native authentication enabled.
            Point your agent here and authenticate — zero passwords, zero API
            keys.
          </p>
        </div>

        {/* How to authenticate */}
        <div className="mb-8 rounded-2xl border border-gray-800 bg-gray-900/80 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
          <div className="mb-6 flex items-center gap-3 border-b border-gray-800 pb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/20">
              <svg
                className="h-6 w-6 text-cyan-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Authenticate Your Agent
              </h2>
              <p className="text-sm text-gray-500">
                Run this from your AI agent to log in
              </p>
            </div>
            <div className="ml-auto rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              AgentPass Enabled
            </div>
          </div>

          {/* Command */}
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
              <div className="flex gap-1">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
              </div>
              <span>MCP tool call</span>
            </div>
            <pre className="overflow-x-auto text-sm leading-relaxed">
              <code>
                <span className="text-emerald-400">authenticate</span>
                <span className="text-gray-300">(</span>
                <span className="text-amber-300">"{SITE_URL}"</span>
                <span className="text-gray-300">)</span>
              </code>
            </pre>
          </div>

          {/* Discovery info */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-4">
              <p className="mb-1 text-xs font-medium text-gray-500">
                Discovery Endpoint
              </p>
              <code className="text-xs text-emerald-400">
                {SITE_URL}/.well-known/agentpass.json
              </code>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-4">
              <p className="mb-1 text-xs font-medium text-gray-500">
                Auth Method
              </p>
              <code className="text-xs text-cyan-400">
                Ed25519 challenge-response
              </code>
            </div>
          </div>
        </div>

        {/* Active sessions */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">
                Authenticated Agents
              </h2>
              {sessions.length > 0 && (
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                  {sessions.length}
                </span>
              )}
            </div>
            {sessions.length > 0 && (
              <button
                onClick={clearSessions}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-600 hover:text-white"
              >
                Clear All
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-800">
                <svg
                  className="h-8 w-8 text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
                  />
                </svg>
              </div>
              <p className="text-sm text-gray-500">No agents authenticated yet</p>
              <p className="mt-1 text-xs text-gray-600">
                Run{" "}
                <code className="rounded bg-gray-800 px-1.5 py-0.5 text-emerald-400">
                  authenticate("{SITE_URL}")
                </code>{" "}
                from your agent
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => (
                <div
                  key={s.session_token}
                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <svg
                      className="h-4 w-4 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-sm font-semibold text-emerald-300">
                      {s.agent_name}
                    </span>
                    <span className="ml-auto text-xs text-gray-500">
                      {new Date(s.authenticated_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-1.5 font-mono text-xs">
                    <div className="flex gap-2">
                      <span className="w-24 shrink-0 text-gray-500">
                        Passport
                      </span>
                      <span className="text-white">{s.passport_id}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-24 shrink-0 text-gray-500">
                        Session
                      </span>
                      <span className="truncate text-cyan-400">
                        {s.session_token.slice(0, 16)}&hellip;
                        {s.session_token.slice(-8)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Protected endpoint demo */}
        {sessions.length > 0 && (
          <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/80 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
            <div className="mb-6 flex items-center gap-3 border-b border-gray-800 pb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20">
                <svg
                  className="h-6 w-6 text-indigo-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Protected Endpoint
                </h2>
                <p className="text-sm text-gray-500">
                  Use the session token to access protected resources
                </p>
              </div>
            </div>

            {/* Code example */}
            <div className="mb-6 rounded-xl border border-gray-800 bg-gray-950 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                <div className="flex gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
                </div>
                <span>Using the session token</span>
              </div>
              <pre className="overflow-x-auto text-sm leading-relaxed">
                <code>
                  <span className="text-gray-500">
                    {"// After authenticate() returns session_token"}
                  </span>
                  {"\n"}
                  <span className="text-purple-400">const</span>
                  <span className="text-gray-300"> res </span>
                  <span className="text-purple-400">= await</span>
                  <span className="text-yellow-300"> fetch</span>
                  <span className="text-gray-300">(</span>
                  <span className="text-emerald-300">
                    '
                    {SITE_URL}
                    /api/profile'
                  </span>
                  <span className="text-gray-300">, {"{"}</span>
                  {"\n"}
                  <span className="text-gray-300">{"  "}</span>
                  <span className="text-white">headers</span>
                  <span className="text-gray-300">: {"{"}</span>
                  {"\n"}
                  <span className="text-gray-300">{"    "}</span>
                  <span className="text-emerald-300">'Authorization'</span>
                  <span className="text-gray-300">: </span>
                  <span className="text-emerald-300">{"'Bearer <session_token>'"}</span>
                  {"\n"}
                  <span className="text-gray-300">{"  }"}</span>
                  {"\n"}
                  <span className="text-gray-300">{"})"}</span>
                </code>
              </pre>
            </div>

            {/* Try it buttons */}
            <div className="mb-4">
              <p className="mb-3 text-xs font-medium text-gray-500">
                Try it with an active session:
              </p>
              <div className="flex flex-wrap gap-2">
                {sessions.map((s) => (
                  <button
                    key={s.session_token}
                    onClick={() => tryProtectedEndpoint(s.session_token)}
                    disabled={profile.loading}
                    className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-300 transition-colors hover:bg-indigo-500/20 disabled:opacity-50"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                      />
                    </svg>
                    GET /profile as {s.agent_name}
                  </button>
                ))}
              </div>
            </div>

            {/* Result */}
            {profile.loading && (
              <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/50 p-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                <span className="text-sm text-gray-400">
                  Calling protected endpoint...
                </span>
              </div>
            )}

            {profile.error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                <div className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  <span className="text-sm text-red-300">{profile.error}</span>
                </div>
              </div>
            )}

            {profile.result && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <svg
                    className="h-4 w-4 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="text-sm font-medium text-emerald-300">
                    200 OK — Agent identity verified
                  </span>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                  <pre className="overflow-x-auto text-xs leading-relaxed">
                    <code className="text-gray-300">
                      {JSON.stringify(profile.result, null, 2)}
                    </code>
                  </pre>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  The service now knows exactly which agent is making the
                  request — passport ID, name, and when they authenticated.
                  Use this to apply per-agent rate limits, permissions, or
                  audit logging.
                </p>
              </div>
            )}
          </div>
        )}

        {/* How it works explanation */}
        <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8">
          <h3 className="mb-6 text-center text-xl font-bold text-white">
            How It Works
          </h3>
          <div className="grid gap-6 sm:grid-cols-4">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border-2 border-emerald-500/40 bg-emerald-500/10">
                <span className="text-sm font-bold text-emerald-400">1</span>
              </div>
              <p className="text-sm font-semibold text-white">Discovery</p>
              <p className="mt-1 text-xs text-gray-500">Agent fetches /.well-known/agentpass.json</p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border-2 border-cyan-500/40 bg-cyan-500/10">
                <span className="text-sm font-bold text-cyan-400">2</span>
              </div>
              <p className="text-sm font-semibold text-white">Challenge</p>
              <p className="mt-1 text-xs text-gray-500">Service issues a random 32-byte challenge</p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border-2 border-indigo-500/40 bg-indigo-500/10">
                <span className="text-sm font-bold text-indigo-400">3</span>
              </div>
              <p className="text-sm font-semibold text-white">Signature</p>
              <p className="mt-1 text-xs text-gray-500">Agent signs with Ed25519 private key</p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border-2 border-emerald-500/40 bg-emerald-500/10">
                <span className="text-sm font-bold text-emerald-400">4</span>
              </div>
              <p className="text-sm font-semibold text-white">Session</p>
              <p className="mt-1 text-xs text-gray-500">Signature verified, token issued</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
