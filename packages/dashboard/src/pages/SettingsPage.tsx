import { useState, useEffect, useCallback } from "react";
import { apiClient, type ApiKey, type CreateApiKeyResponse } from "../api/client.js";
import { useAuth } from "../context/AuthContext.js";

interface NotificationPreferences {
  agent_registered: boolean;
  agent_login: boolean;
  agent_error: boolean;
  captcha_needed: boolean;
  approval_needed: boolean;
  daily_digest: boolean;
}

interface Settings {
  webhookUrl: string;
  telegramChatId: string;
  ownerEmail: string;
  notifications: NotificationPreferences;
}

const SETTINGS_KEY = "agentpass_settings";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3846";

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
  }

  return {
    webhookUrl: "",
    telegramChatId: "",
    ownerEmail: "owner@example.com",
    notifications: {
      agent_registered: true,
      agent_login: false,
      agent_error: true,
      captcha_needed: true,
      approval_needed: true,
      daily_digest: true,
    },
  };
}

function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

export default function SettingsPage() {
  const { token } = useAuth();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(
    !!settings.telegramChatId
  );
  const [apiStatus, setApiStatus] = useState<
    "checking" | "online" | "offline"
  >("checking");

  // API Key state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(null);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  const [envCopied, setEnvCopied] = useState(false);

  // Set token on apiClient whenever it changes
  useEffect(() => {
    apiClient.setToken(token);
  }, [token]);

  const loadApiKeys = useCallback(async () => {
    if (!token) return;
    setApiKeysLoading(true);
    setApiKeyError(null);
    try {
      const keys = await apiClient.listApiKeys();
      setApiKeys(keys);
    } catch (err) {
      setApiKeyError(err instanceof Error ? err.message : "Failed to load API keys");
    } finally {
      setApiKeysLoading(false);
    }
  }, [token]);

  // Load API keys on mount
  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  // Check API connection status on mount
  useEffect(() => {
    const checkApiStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/passports?limit=1`);
        setApiStatus(response.ok ? "online" : "offline");
      } catch {
        setApiStatus("offline");
      }
    };

    checkApiStatus();
  }, []);

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setApiKeysLoading(true);
    setApiKeyError(null);
    try {
      const result = await apiClient.createApiKey(newKeyName.trim());
      setCreatedKey(result);
      setNewKeyName("");
      await loadApiKeys();
    } catch (err) {
      setApiKeyError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setApiKeysLoading(false);
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    setApiKeyError(null);
    try {
      await apiClient.revokeApiKey(id);
      await loadApiKeys();
    } catch (err) {
      setApiKeyError(err instanceof Error ? err.message : "Failed to revoke API key");
    }
  };

  const handleCopyText = async (text: string, setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch {
      setApiKeyError("Failed to copy to clipboard");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleSaveWebhook = () => {
    saveSettings(settings);
    setWebhookSaved(true);
    setTimeout(() => setWebhookSaved(false), 3000);
  };

  const handleLinkTelegram = () => {
    if (settings.telegramChatId.trim()) {
      setTelegramLinked(true);
      saveSettings(settings);
    }
  };

  const handleToggleNotification = (key: keyof NotificationPreferences) => {
    const updated = {
      ...settings,
      notifications: { ...settings.notifications, [key]: !settings.notifications[key] },
    };
    setSettings(updated);
    saveSettings(updated);
  };

  const updateWebhookUrl = (value: string) => {
    setSettings({ ...settings, webhookUrl: value });
  };

  const updateTelegramChatId = (value: string) => {
    setSettings({ ...settings, telegramChatId: value });
  };

  const notificationOptions: {
    key: keyof NotificationPreferences;
    label: string;
    description: string;
  }[] = [
    {
      key: "agent_registered",
      label: "Agent Registered",
      description: "When an agent successfully registers on a service",
    },
    {
      key: "agent_login",
      label: "Agent Login",
      description: "When an agent logs into a service",
    },
    {
      key: "agent_error",
      label: "Agent Errors",
      description: "When an agent encounters an error during operation",
    },
    {
      key: "captcha_needed",
      label: "CAPTCHA Needed",
      description: "When an agent encounters a CAPTCHA requiring human solving",
    },
    {
      key: "approval_needed",
      label: "Approval Needed",
      description: "When an agent action requires owner approval",
    },
    {
      key: "daily_digest",
      label: "Daily Digest",
      description: "Daily summary of all agent activity",
    },
  ];

  const getStatusColor = () => {
    if (apiStatus === "online") return "bg-emerald-500";
    if (apiStatus === "offline") return "bg-red-500";
    return "bg-gray-400";
  };

  const getStatusLabel = () => {
    if (apiStatus === "online") return "Online";
    if (apiStatus === "offline") return "Offline";
    return "Checking...";
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure notifications, integrations, and account settings
        </p>
      </div>

      <div className="space-y-8">
        {/* Owner Profile */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Owner Profile
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Your account information
          </p>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Email</p>
                <p className="text-sm text-gray-500">{settings.ownerEmail}</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Verified
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">API Server URL</p>
              <p className="font-mono text-sm text-gray-500">
                {API_URL}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Connection Status
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  API server connectivity
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                <span
                  className={`mr-1.5 h-1.5 w-1.5 rounded-full ${getStatusColor()}`}
                />
                {getStatusLabel()}
              </span>
            </div>
          </div>
        </section>

        {/* API Keys */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
          <p className="mt-1 text-sm text-gray-500">
            Authenticate MCP servers and external tools with the AgentPass API
          </p>

          {/* Create API Key Form */}
          <form onSubmit={handleCreateApiKey} className="mt-6 flex gap-3">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name, e.g. mcp-server-prod"
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={apiKeysLoading || !newKeyName.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {apiKeysLoading ? "Creating..." : "Create Key"}
            </button>
          </form>

          {/* Error Display */}
          {apiKeyError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{apiKeyError}</p>
            </div>
          )}

          {/* Newly Created Key (one-time display) */}
          {createdKey && (
            <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg
                  className="h-5 w-5 text-amber-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <span className="font-semibold text-amber-900 text-sm">
                  Save Your API Key
                </span>
              </div>
              <p className="text-xs text-amber-800 mb-3">
                This key will NOT be shown again. Copy it now and store it securely.
              </p>

              {/* Full Key Display */}
              <div className="relative mb-4">
                <pre className="rounded-lg bg-gray-900 p-3 text-xs text-gray-300 font-mono overflow-x-auto break-all">
{createdKey.key}
                </pre>
                <button
                  onClick={() => handleCopyText(createdKey.key, setKeyCopied)}
                  className="absolute top-2 right-2 rounded px-2 py-1 text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  {keyCopied ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Config Snippet */}
              <p className="text-xs font-medium text-amber-900 mb-1">
                ~/.agentpass/config.yaml
              </p>
              <div className="relative mb-4">
                <pre className="rounded-lg bg-gray-900 p-3 text-xs text-gray-300 font-mono overflow-x-auto">
{`api_url: ${API_URL}\napi_key: ${createdKey.key}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopyText(
                      `api_url: ${API_URL}\napi_key: ${createdKey.key}`,
                      setConfigCopied,
                    )
                  }
                  className="absolute top-2 right-2 rounded px-2 py-1 text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  {configCopied ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Env Var Snippet */}
              <p className="text-xs font-medium text-amber-900 mb-1">
                Environment variables
              </p>
              <div className="relative">
                <pre className="rounded-lg bg-gray-900 p-3 text-xs text-gray-300 font-mono overflow-x-auto">
{`AGENTPASS_API_URL=${API_URL}\nAGENTPASS_API_KEY=${createdKey.key}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopyText(
                      `AGENTPASS_API_URL=${API_URL}\nAGENTPASS_API_KEY=${createdKey.key}`,
                      setEnvCopied,
                    )
                  }
                  className="absolute top-2 right-2 rounded px-2 py-1 text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  {envCopied ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Dismiss Button */}
              <button
                onClick={() => setCreatedKey(null)}
                className="mt-4 w-full rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
              >
                I've saved my key
              </button>
            </div>
          )}

          {/* Existing Keys List */}
          {apiKeys.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Existing Keys
              </h3>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Name
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Prefix
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Last Used
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Created
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Status
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {apiKeys.map((key) => (
                      <tr key={key.id}>
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                          {key.name}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-500">
                          {key.key_prefix}...
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                          {key.last_used ? formatDate(key.last_used) : "Never"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                          {formatDate(key.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {key.revoked_at ? (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                              Revoked
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {!key.revoked_at && (
                            <button
                              onClick={() => handleRevokeApiKey(key.id)}
                              className="text-sm font-medium text-red-600 transition-colors hover:text-red-800"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Loading State */}
          {apiKeysLoading && apiKeys.length === 0 && (
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">Loading API keys...</p>
            </div>
          )}
        </section>

        {/* Webhook Configuration */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Webhook URL
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Receive real-time event notifications via HTTP POST
          </p>

          <div className="mt-6 flex gap-3">
            <input
              type="url"
              value={settings.webhookUrl}
              onChange={(e) => updateWebhookUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            <button
              onClick={handleSaveWebhook}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Save
            </button>
          </div>
          {webhookSaved && (
            <p className="mt-2 text-sm text-emerald-600">
              Webhook URL saved successfully.
            </p>
          )}
        </section>

        {/* Telegram Bot Setup */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Telegram Bot
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Link your Telegram account to receive notifications and approve
            actions
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700">
                1. Start the bot
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Open Telegram and start a conversation with{" "}
                <a href="https://t.me/AgentPass_bot" target="_blank" rel="noopener noreferrer" className="font-mono text-indigo-600 hover:text-indigo-800 underline">
                  @AgentPass_bot
                </a>
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">
                2. Enter your Chat ID
              </p>
              <div className="mt-2 flex gap-3">
                <input
                  type="text"
                  value={settings.telegramChatId}
                  onChange={(e) => updateTelegramChatId(e.target.value)}
                  placeholder="e.g. 123456789"
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
                <button
                  onClick={handleLinkTelegram}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  Link Bot
                </button>
              </div>
            </div>

            {telegramLinked && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={3}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m4.5 12.75 6 6 9-13.5"
                    />
                  </svg>
                </span>
                <span className="text-sm font-medium text-emerald-800">
                  Telegram bot linked successfully (Chat ID: {settings.telegramChatId})
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Notification Preferences */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Notification Preferences
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Choose which events trigger notifications
          </p>

          <div className="mt-6 space-y-4">
            {notificationOptions.map((option) => (
              <label
                key={option.key}
                className="flex cursor-pointer items-start gap-3"
              >
                <input
                  type="checkbox"
                  checked={settings.notifications[option.key]}
                  onChange={() => handleToggleNotification(option.key)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {option.label}
                  </p>
                  <p className="text-xs text-gray-500">
                    {option.description}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
