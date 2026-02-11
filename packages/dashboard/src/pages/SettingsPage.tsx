import { useState } from "react";

interface NotificationPreferences {
  agent_registered: boolean;
  agent_login: boolean;
  agent_error: boolean;
  captcha_needed: boolean;
  approval_needed: boolean;
  daily_digest: boolean;
}

export default function SettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [notifications, setNotifications] = useState<NotificationPreferences>({
    agent_registered: true,
    agent_login: false,
    agent_error: true,
    captcha_needed: true,
    approval_needed: true,
    daily_digest: true,
  });

  const handleSaveWebhook = () => {
    setWebhookSaved(true);
    setTimeout(() => setWebhookSaved(false), 3000);
  };

  const handleLinkTelegram = () => {
    if (telegramChatId.trim()) {
      setTelegramLinked(true);
    }
  };

  const handleToggleNotification = (key: keyof NotificationPreferences) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
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
                <p className="text-sm text-gray-500">owner@agentpass.dev</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Verified
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Owner ID</p>
              <p className="font-mono text-sm text-gray-500">
                owner_a1b2c3d4e5f6
              </p>
            </div>
          </div>
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
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
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
                <span className="font-mono text-indigo-600">
                  @AgentPassBot
                </span>
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">
                2. Enter your Chat ID
              </p>
              <div className="mt-2 flex gap-3">
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
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
                  Telegram bot linked successfully (Chat ID: {telegramChatId})
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
                  checked={notifications[option.key]}
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
