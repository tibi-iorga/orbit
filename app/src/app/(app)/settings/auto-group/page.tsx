"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface AISettings {
  prompt: string;
  isCustomPrompt: boolean;
  defaultPrompt: string;
  keySource: "db" | "env" | "none";
  maskedKey: string | null;
}

export default function AutoGroupSettingsPage() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [productsWithoutDescription, setProductsWithoutDescription] = useState(0);

  // Prompt state
  const [prompt, setPrompt] = useState("");
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);
  const [promptError, setPromptError] = useState("");

  // API key state
  const [keyInput, setKeyInput] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((data: AISettings) => {
        setSettings(data);
        setPrompt(data.prompt);
      })
      .finally(() => setLoading(false));

    // Check for products missing descriptions
    fetch("/api/products")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.flat) {
          const missing = (data.flat as { description: string | null }[]).filter((p) => !p.description).length;
          setProductsWithoutDescription(missing);
        }
      })
      .catch(() => {});
  }, []);

  async function savePrompt() {
    setPromptSaving(true);
    setPromptError("");
    setPromptSaved(false);
    try {
      const res = await fetch("/api/settings/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const d = await res.json();
        setPromptError(d.error || "Failed to save");
        return;
      }
      setPromptSaved(true);
      setSettings((prev) => prev ? { ...prev, isCustomPrompt: prompt !== prev.defaultPrompt } : null);
      setTimeout(() => setPromptSaved(false), 3000);
    } catch {
      setPromptError("Failed to save. Please try again.");
    } finally {
      setPromptSaving(false);
    }
  }

  function resetPrompt() {
    if (!settings) return;
    setPrompt(settings.defaultPrompt);
    setPromptSaved(false);
  }

  async function saveApiKey() {
    setKeySaving(true);
    setKeyError("");
    setKeySaved(false);
    try {
      const res = await fetch("/api/settings/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: keyInput }),
      });
      if (!res.ok) {
        const d = await res.json();
        setKeyError(d.error || "Failed to save");
        return;
      }
      setKeySaved(true);
      setKeyInput("");
      // Reload to get new masked key / source
      const updated: AISettings = await fetch("/api/settings/ai").then((r) => r.json());
      setSettings(updated);
      setTimeout(() => setKeySaved(false), 3000);
    } catch {
      setKeyError("Failed to save. Please try again.");
    } finally {
      setKeySaving(false);
    }
  }

  async function clearApiKey() {
    setKeySaving(true);
    setKeyError("");
    try {
      await fetch("/api/settings/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "" }),
      });
      const updated: AISettings = await fetch("/api/settings/ai").then((r) => r.json());
      setSettings(updated);
      setKeyInput("");
    } catch {
      setKeyError("Failed to clear. Please try again.");
    } finally {
      setKeySaving(false);
    }
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;
  if (!settings) return <p className="text-red-500 text-sm">Failed to load settings.</p>;

  const keyStatusColor =
    settings.keySource === "none" ? "text-red-600 bg-red-50 border-red-200" :
    settings.keySource === "env"  ? "text-blue-700 bg-blue-50 border-blue-200" :
                                    "text-green-700 bg-green-50 border-green-200";

  const keyStatusLabel =
    settings.keySource === "none" ? "Not configured — AI features are disabled" :
    settings.keySource === "env"  ? "Active (from environment variable)" :
                                    "Active (from settings)";

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Auto-group feedback</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure how AI analyses and groups your feedback into opportunities.
        </p>
      </div>

      {productsWithoutDescription > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠</span>
          <p className="text-amber-800">
            <strong>{productsWithoutDescription} {productsWithoutDescription === 1 ? "product is" : "products are"} missing a description.</strong>{" "}
            Adding descriptions helps the AI assign opportunities to the right product.{" "}
            <Link href="/settings/products" className="underline hover:text-amber-900">
              Go to Product Portfolio →
            </Link>
          </p>
        </div>
      )}

      {/* ── API Key ────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">OpenAI API key</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Used for auto-grouping feedback. If you set a key here it overrides the server environment variable.
          </p>
        </div>

        {/* Status badge */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium ${keyStatusColor}`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            settings.keySource === "none" ? "bg-red-500" :
            settings.keySource === "env"  ? "bg-blue-500" : "bg-green-500"
          }`} />
          {keyStatusLabel}
          {settings.maskedKey && (
            <span className="font-mono text-xs opacity-70 ml-1">{settings.maskedKey}</span>
          )}
        </div>

        {/* Input to set new key */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {settings.keySource === "db" ? "Replace key" : "Set API key"}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && keyInput.trim()) saveApiKey(); }}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showKey ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <button
              onClick={saveApiKey}
              disabled={!keyInput.trim() || keySaving}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {keySaving ? "Saving…" : keySaved ? "Saved ✓" : "Save key"}
            </button>
          </div>
          {settings.keySource === "db" && (
            <button
              onClick={clearApiKey}
              disabled={keySaving}
              className="text-sm text-red-600 hover:text-red-800 hover:underline"
            >
              Remove saved key (revert to environment variable)
            </button>
          )}
          {keyError && <p className="text-sm text-red-600">{keyError}</p>}
          <p className="text-xs text-gray-400">
            Your key is stored securely and never exposed in full after saving.
          </p>
        </div>
      </section>

      <hr className="border-gray-200" />

      {/* ── System Prompt ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Analysis prompt</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            This is the instruction sent to the AI when auto-grouping feedback. Customise it to reflect your product domain, team language, or specific grouping preferences.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">System prompt</label>
            <div className="flex items-center gap-3">
              {settings.isCustomPrompt && prompt === settings.prompt && (
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  Custom
                </span>
              )}
              {prompt !== settings.defaultPrompt && (
                <button
                  onClick={resetPrompt}
                  className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
                >
                  Reset to default
                </button>
              )}
            </div>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); setPromptSaved(false); }}
            rows={14}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              The AI always receives the list of feedback items after this prompt.
            </p>
            <div className="flex items-center gap-3">
              {promptSaved && (
                <span className="text-sm text-green-600">Saved ✓</span>
              )}
              {promptError && (
                <span className="text-sm text-red-600">{promptError}</span>
              )}
              <button
                onClick={savePrompt}
                disabled={promptSaving || prompt === settings.prompt}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {promptSaving ? "Saving…" : "Save prompt"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
