import { useState, useEffect, useRef, useCallback } from "react";
import { apiClient, type BrowserSession } from "../api/client.js";

interface LiveBrowserViewerProps {
  sessionId: string;
  onSessionClosed?: () => void;
}

type ConnectionMode = "ws" | "http" | "connecting";

export default function LiveBrowserViewer({
  sessionId,
  onSessionClosed,
}: LiveBrowserViewerProps) {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const [typingText, setTypingText] = useState("");
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBlobUrlRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch initial session metadata via HTTP
  useEffect(() => {
    let mounted = true;

    async function fetchSession() {
      try {
        const data = await apiClient.getBrowserSession(sessionId);
        if (!mounted) return;
        setSession(data);

        if (data.closed_at) {
          onSessionClosed?.();
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load session");
      }
    }

    fetchSession();

    return () => { mounted = false; };
  }, [sessionId, onSessionClosed]);

  // WebSocket connection with HTTP fallback
  useEffect(() => {
    let mounted = true;

    function connectWebSocket() {
      const token = apiClient.getToken();
      if (!token) {
        // No token — can't connect via WS, fall back to HTTP
        startHttpPolling();
        return;
      }

      const baseUrl = apiClient.getBaseUrl();
      const wsBase = baseUrl
        .replace(/^http:\/\//, "ws://")
        .replace(/^https:\/\//, "wss://");
      const wsUrl = `${wsBase}/browser-sessions/${encodeURIComponent(sessionId)}/stream?token=${encodeURIComponent(token)}`;

      setConnectionMode("connecting");

      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mounted) { ws.close(); return; }

        // Send identify message
        ws.send(JSON.stringify({ type: "identify", role: "dashboard" }));
        setConnected(true);
        setConnectionMode("ws");
        setError(null);
      };

      ws.onmessage = (evt) => {
        if (!mounted) return;

        // Binary frame: JPEG screenshot
        if (evt.data instanceof ArrayBuffer) {
          const blob = new Blob([evt.data], { type: "image/jpeg" });
          const url = URL.createObjectURL(blob);

          // Revoke previous blob URL to prevent memory leak
          if (prevBlobUrlRef.current) {
            URL.revokeObjectURL(prevBlobUrlRef.current);
          }
          prevBlobUrlRef.current = url;

          // Update img src directly for minimal latency
          if (imgRef.current) {
            imgRef.current.src = url;
          }

          setConnected(true);
          setLastUpdate(Date.now());
          return;
        }

        // Text frame: JSON metadata
        if (typeof evt.data === "string") {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === "metadata") {
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      page_url: msg.page_url ?? prev.page_url,
                      viewport_w: msg.viewport_w ?? prev.viewport_w,
                      viewport_h: msg.viewport_h ?? prev.viewport_h,
                    }
                  : prev,
              );
            }
          } catch {
            // Invalid JSON — ignore
          }
        }
      };

      ws.onclose = () => {
        if (!mounted) return;

        wsRef.current = null;
        setConnected(false);

        // Auto-reconnect after 2s
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mounted) connectWebSocket();
        }, 2000);
      };

      ws.onerror = () => {
        // Error is followed by close, which handles reconnection.
        // If this is the first connection attempt and it fails, fall back to HTTP.
        if (connectionMode === "connecting") {
          ws.close();
          if (mounted) startHttpPolling();
        }
      };
    }

    function startHttpPolling() {
      if (!mounted) return;

      setConnectionMode("http");

      pollRef.current = setInterval(async () => {
        try {
          const data = await apiClient.getBrowserSession(sessionId);
          if (!mounted) return;

          setSession(data);
          setConnected(true);
          setError(null);
          setLastUpdate(Date.now());

          if (data.closed_at) {
            onSessionClosed?.();
          }
        } catch (err) {
          if (!mounted) return;
          setConnected(false);
          setError(err instanceof Error ? err.message : "Connection lost");
        }
      }, 500);
    }

    connectWebSocket();

    return () => {
      mounted = false;

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Clean up blob URL
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
        prevBlobUrlRef.current = null;
      }
    };
  }, [sessionId, onSessionClosed]);

  // Send command via WebSocket or HTTP fallback
  const sendCommand = useCallback(
    async (type: string, payload: Record<string, unknown>) => {
      // Prefer WebSocket if connected
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "command", command: type, payload }),
        );
        return;
      }

      // HTTP fallback
      try {
        await apiClient.sendBrowserCommand(sessionId, type, payload);
      } catch {
        // Non-critical
      }
    },
    [sessionId],
  );

  // Handle click on the screenshot
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (!session || !imgRef.current) return;

      const rect = imgRef.current.getBoundingClientRect();
      const scaleX = session.viewport_w / rect.width;
      const scaleY = session.viewport_h / rect.height;

      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);

      sendCommand("click", { x, y });
    },
    [session, sendCommand],
  );

  // Handle text submission
  const handleTypeSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!typingText.trim()) return;

      sendCommand("type", { text: typingText });
      setTypingText("");
    },
    [sendCommand, typingText],
  );

  // Handle keypress (Enter, Tab, Escape, etc.)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (
        e.key === "Enter" ||
        e.key === "Tab" ||
        e.key === "Escape" ||
        e.key === "Backspace"
      ) {
        e.preventDefault();
        sendCommand("keypress", { key: e.key });
      }
    },
    [sendCommand],
  );

  // Freshness indicator
  const isFresh = Date.now() - lastUpdate < 2000;

  if (error && !session) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
        <div className="text-center">
          <div className="mb-2 mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-5 w-5 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  // Determine the screenshot source:
  // - In WS mode, imgRef.src is set directly from blob URLs
  // - In HTTP mode, use session.screenshot from polling
  const showDirectImg = connectionMode === "ws";
  const httpScreenshot = connectionMode === "http" ? session?.screenshot : null;

  return (
    <div
      ref={containerRef}
      className="space-y-3"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              connected && isFresh ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          <span className="text-xs text-gray-500">
            {connected && isFresh
              ? connectionMode === "ws"
                ? "Live (WebSocket)"
                : "Live"
              : "Disconnected"}
          </span>
          {session?.page_url && (
            <span className="ml-2 max-w-xs truncate text-xs text-gray-400">
              {session.page_url}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {session
            ? `${session.viewport_w}x${session.viewport_h}`
            : "Loading..."}
        </span>
      </div>

      {/* Screenshot display */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-900">
        {showDirectImg || httpScreenshot ? (
          <img
            ref={imgRef}
            src={httpScreenshot ?? undefined}
            alt="Live browser view"
            className="block w-full cursor-crosshair"
            style={{
              aspectRatio: session
                ? `${session.viewport_w} / ${session.viewport_h}`
                : "1280 / 720",
            }}
            onClick={handleClick}
            draggable={false}
          />
        ) : (
          <div
            className="flex items-center justify-center bg-gray-900"
            style={{ aspectRatio: "1280 / 720" }}
          >
            <div className="text-center">
              <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-indigo-400" />
              <p className="text-sm text-gray-400">
                Waiting for browser stream...
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Input controls */}
      <div className="flex gap-2">
        <form onSubmit={handleTypeSubmit} className="flex flex-1 gap-2">
          <input
            type="text"
            value={typingText}
            onChange={(e) => setTypingText(e.target.value)}
            placeholder="Type text and press Enter to send..."
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={!typingText.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>

      {/* Instructions */}
      <p className="text-xs text-gray-400">
        Click on the image to interact. Type text below and press Enter to send keystrokes.
      </p>
    </div>
  );
}
