"use client";

import { useState } from "react";

export function TwoFactorSettings({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggle2FA = async () => {
    setError(null);
    setLoading(true);

    if (enabled) {
      // Disable 2FA
      try {
        const res = await fetch("/api/auth/2fa/enable", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enable: false }),
        });
        if (res.ok) {
          setEnabled(false);
        } else {
          const data = await res.json();
          setError(data.message || "Failed to disable 2FA");
        }
      } catch {
        setError("Network error");
      }
    } else {
      // Request to enable 2FA
      try {
        const res = await fetch("/api/auth/2fa/enable", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enable: true }),
        });
        if (res.ok) {
          setShowCodeInput(true);
        } else {
          const data = await res.json();
          setError(data.message || "Failed to send 2FA code");
        }
      } catch {
        setError("Network error");
      }
    }
    setLoading(false);
  };

  const verifyCode = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        setEnabled(true);
        setShowCodeInput(false);
        setCode("");
      } else {
        const data = await res.json();
        setError(data.message || "Invalid code");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  return (
    <div className="mt-12 pt-8 border-t border-slate-800">
      <h2 className="text-xl font-semibold mb-4">Security Settings</h2>

      <div className="bg-[#12121a] border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Two-Factor Authentication (2FA)</h3>
            <p className="text-sm text-slate-400 mt-1">
              {enabled
                ? "2FA is currently enabled for your account. You will be required to enter a code sent to your email when signing in."
                : "Add an extra layer of security to your account by requiring an email verification code when signing in."}
            </p>
          </div>
          <button
            onClick={toggle2FA}
            disabled={loading || showCodeInput}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-colors whitespace-nowrap ml-4 ${
              enabled
                ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                : "bg-violet-600 text-white hover:bg-violet-500"
            }`}
          >
            {loading && !showCodeInput ? "Processing..." : enabled ? "Disable 2FA" : "Enable 2FA"}
          </button>
        </div>

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

        {showCodeInput && (
          <div className="mt-4 p-4 border border-violet-800/50 bg-violet-900/10 rounded-lg">
            <label className="block text-sm font-medium mb-2">
              Enter the 6-digit code sent to your email
            </label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="bg-[#0a0a0f] border border-slate-700 rounded p-2 text-white w-32 focus:border-violet-500 focus:outline-none"
                maxLength={6}
              />
              <button
                onClick={verifyCode}
                disabled={loading || code.length !== 6}
                className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Verify & Enable"}
              </button>
              <button
                onClick={() => setShowCodeInput(false)}
                className="text-slate-400 hover:text-slate-200 text-sm ml-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
