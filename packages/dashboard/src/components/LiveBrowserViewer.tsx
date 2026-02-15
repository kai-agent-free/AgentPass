import { useState, useEffect, useRef, useCallback } from "react";
import { apiClient, type BrowserSession } from "../api/client.js";

interface LiveBrowserViewerProps {
  sessionId: string;
  onSessionClosed?: () => void;
}

export default function LiveBrowserViewer({
  sessionId,
  onSessionClosed,
}: LiveBrowserViewerProps) {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const [typingText, setTypingText] = useState("");
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for session updates
  useEffect(() => {
    let mounted = true;

    const poll = async () => {
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
    };

    // Initial fetch
    poll();

    // Poll every 500ms
    pollRef.current = setInterval(poll, 500);

    return () => {
      mounted = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [sessionId, onSessionClosed]);

  // Handle click on the screenshot
  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLImageElement>) => {
      if (!session || !imgRef.current) return;

      const rect = imgRef.current.getBoundingClientRect();
      const scaleX = session.viewport_w / rect.width;
      const scaleY = session.viewport_h / rect.height;

      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);

      try {
        await apiClient.sendBrowserCommand(sessionId, "click", { x, y });
      } catch {
        // Non-critical -- next poll will show state
      }
    },
    [session, sessionId],
  );

  // Handle text submission
  const handleTypeSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!typingText.trim()) return;

      try {
        await apiClient.sendBrowserCommand(sessionId, "type", {
          text: typingText,
        });
        setTypingText("");
      } catch {
        // Non-critical
      }
    },
    [sessionId, typingText],
  );

  // Handle keypress (Enter, Tab, Escape, etc.)
  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      // Only intercept special keys when the container is focused
      if (
        e.key === "Enter" ||
        e.key === "Tab" ||
        e.key === "Escape" ||
        e.key === "Backspace"
      ) {
        e.preventDefault();
        try {
          await apiClient.sendBrowserCommand(sessionId, "keypress", {
            key: e.key,
          });
        } catch {
          // Non-critical
        }
      }
    },
    [sessionId],
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
            {connected && isFresh ? "Live" : "Disconnected"}
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
        {session?.screenshot ? (
          <img
            ref={imgRef}
            src={session.screenshot}
            alt="Live browser view"
            className="block w-full cursor-crosshair"
            style={{ aspectRatio: `${session.viewport_w} / ${session.viewport_h}` }}
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
