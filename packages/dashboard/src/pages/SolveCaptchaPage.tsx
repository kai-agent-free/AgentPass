import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { apiClient, type Escalation } from "../api/client.js";
import { useApi } from "../hooks/useApi.js";
import LiveBrowserViewer from "../components/LiveBrowserViewer.js";

type EscalationStatus = "pending" | "resolved" | "timed_out";

const statusStyles: Record<EscalationStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  resolved: "bg-emerald-100 text-emerald-800",
  timed_out: "bg-red-100 text-red-800",
};

const statusDotStyles: Record<EscalationStatus, string> = {
  pending: "bg-amber-500",
  resolved: "bg-emerald-500",
  timed_out: "bg-red-500",
};

const statusLabels: Record<EscalationStatus, string> = {
  pending: "Pending",
  resolved: "Resolved",
  timed_out: "Timed Out",
};

const captchaTypeLabels: Record<string, string> = {
  recaptcha: "reCAPTCHA",
  hcaptcha: "hCaptcha",
  turnstile: "Cloudflare Turnstile",
};

function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function SolveCaptchaPage() {
  const { id } = useParams<{ id: string }>();
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [resolvedAt, setResolvedAt] = useState<string | null>(null);

  const { data: escalation, loading, error } = useApi<Escalation>(
    () => apiClient.getEscalation(id!),
    [id],
  );

  const [browserSessionId, setBrowserSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!escalation?.id || escalation.status !== "pending") return;

    let mounted = true;

    const checkBrowserSession = async () => {
      try {
        const sessions = await apiClient.listBrowserSessions(escalation.id);
        if (!mounted) return;
        const activeSession = sessions.find((s) => !s.closed_at);
        if (activeSession) {
          setBrowserSessionId(activeSession.id);
        }
      } catch {
        // No browser session available -- static view is fine
      }
    };

    checkBrowserSession();

    return () => {
      mounted = false;
    };
  }, [escalation?.id, escalation?.status]);

  const handleResolve = async () => {
    if (!id) return;

    setResolving(true);
    setResolveError(null);

    try {
      const result = await apiClient.resolveEscalation(id);

      // Close browser session if active
      if (browserSessionId) {
        try {
          await apiClient.closeBrowserSession(browserSessionId);
        } catch {
          // Non-critical
        }
      }

      setResolved(true);
      setResolvedAt(result.resolved_at);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : "Failed to resolve escalation");
    } finally {
      setResolving(false);
    }
  };

  const isResolved = resolved || escalation?.status === "resolved";
  const isTimedOut = !resolved && escalation?.status === "timed_out";
  const displayResolvedAt = resolvedAt || escalation?.resolved_at;

  // Loading state
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
          <p className="text-sm text-gray-500">Loading escalation details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !escalation) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <div className="mb-3 mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            {error ? "Failed to load escalation" : "Escalation not found"}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {error || "The escalation you are looking for does not exist."}
          </p>
          <Link
            to="/approvals"
            className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Back to Approvals
          </Link>
        </div>
      </div>
    );
  }

  const captchaLabel = captchaTypeLabels[escalation.captcha_type] || escalation.captcha_type;
  const currentStatus: EscalationStatus = resolved ? "resolved" : escalation.status;

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-500">
        <Link to="/approvals" className="hover:text-indigo-600">
          Approvals
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">CAPTCHA Escalation</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-100">
            <svg className="h-7 w-7 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">CAPTCHA Escalation</h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[currentStatus]}`}
              >
                <span
                  className={`mr-1.5 h-1.5 w-1.5 rounded-full ${statusDotStyles[currentStatus]}`}
                />
                {statusLabels[currentStatus]}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-sm text-gray-400">{escalation.id}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left column - Screenshot */}
        <div className="space-y-6 lg:col-span-2">
          {/* Screenshot Card */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {browserSessionId ? "Live Browser View" : "CAPTCHA Screenshot"}
              </h2>
            </div>
            <div className="p-6">
              {browserSessionId && !isResolved && !isTimedOut ? (
                <LiveBrowserViewer
                  sessionId={browserSessionId}
                  onSessionClosed={() => setBrowserSessionId(null)}
                />
              ) : escalation.screenshot ? (
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  <img
                    src={escalation.screenshot}
                    alt="CAPTCHA screenshot requiring manual resolution"
                    className="mx-auto block max-w-full"
                  />
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
                  <div className="text-center">
                    <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-500">No screenshot available</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Card */}
          {!isResolved && !isTimedOut && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <svg className="h-5 w-5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-amber-900">Action Required</h3>
                  <p className="mt-1 text-sm text-amber-800">
                    Open the service in your browser, solve the CAPTCHA, then click the button below to notify your agent.
                  </p>

                  {resolveError && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-sm text-red-700">{resolveError}</p>
                    </div>
                  )}

                  <button
                    onClick={handleResolve}
                    disabled={resolving}
                    className="mt-4 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resolving ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                        Resolving...
                      </span>
                    ) : (
                      "I've Solved the CAPTCHA"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Resolved Success State */}
          {isResolved && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <svg className="h-5 w-5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-emerald-900">This CAPTCHA has been resolved</h3>
                  {displayResolvedAt && (
                    <p className="mt-0.5 text-sm text-emerald-700">
                      Resolved at {formatTimestamp(displayResolvedAt)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Timed Out State */}
          {isTimedOut && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <svg className="h-5 w-5 text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-red-900">This escalation has timed out</h3>
                  <p className="mt-0.5 text-sm text-red-700">
                    The CAPTCHA was not resolved within the allowed time window.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column - Details */}
        <div className="space-y-6">
          {/* Agent Info Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Details</h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Agent Passport
                </dt>
                <dd className="mt-1 font-mono text-sm text-gray-900 break-all">
                  {escalation.passport_id}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Service
                </dt>
                <dd className="mt-1 text-sm text-gray-900">{escalation.service}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  CAPTCHA Type
                </dt>
                <dd className="mt-1">
                  <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                    {captchaLabel}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatTimestamp(escalation.created_at)}
                </dd>
              </div>
              {(displayResolvedAt) && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    Resolved
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formatTimestamp(displayResolvedAt)}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </dt>
                <dd className="mt-1">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[currentStatus]}`}
                  >
                    <span
                      className={`mr-1.5 h-1.5 w-1.5 rounded-full ${statusDotStyles[currentStatus]}`}
                    />
                    {statusLabels[currentStatus]}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          {/* Back Link */}
          <Link
            to="/approvals"
            className="flex items-center gap-2 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Approvals
          </Link>
        </div>
      </div>
    </div>
  );
}
