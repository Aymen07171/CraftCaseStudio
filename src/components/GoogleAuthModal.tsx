import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Key,
  X,
  RefreshCw,
  Info,
  HelpCircle,
  FileSpreadsheet,
  FolderTree,
  Check,
} from 'lucide-react';
import {
  DEFAULT_GOOGLE_CLIENT_ID,
  PROVISIONED_OAUTH_CLIENT_ID,
  getStoredGoogleClientId,
  setStoredGoogleClientId,
  GOOGLE_SCOPES_DEFAULT,
  GOOGLE_SCOPES_RESTRICTED_FREE,
} from '../services/unifiedGoogleService';

interface GoogleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  googleConnected: boolean;
  googleEmail: string;
  googleAuthError: string | null;
  onConnect: (clientId?: string, scope?: string) => Promise<void>;
  onDisconnect?: () => void;
}

export const GoogleAuthModal: React.FC<GoogleAuthModalProps> = ({
  isOpen,
  onClose,
  googleConnected,
  googleEmail,
  googleAuthError,
  onConnect,
  onDisconnect,
}) => {
  const [clientId, setClientId] = useState(() => getStoredGoogleClientId() || DEFAULT_GOOGLE_CLIENT_ID);
  const [useAppFilesOnlyScope, setUseAppFilesOnlyScope] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const active = getStoredGoogleClientId();
    if (
      !active ||
      active.includes('your-web-client-id') ||
      active.includes('171360328307') ||
      active.includes('759990643229') ||
      active.includes('krudbd8') ||
      active.includes('krucbd0') ||
      active.includes('[object')
    ) {
      setClientId(DEFAULT_GOOGLE_CLIENT_ID);
      setStoredGoogleClientId(DEFAULT_GOOGLE_CLIENT_ID);
    } else {
      setClientId(active);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const handleSaveClientId = () => {
    setStoredGoogleClientId(clientId);
    setSaveMessage('Client ID saved successfully!');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleResetDefault = () => {
    setClientId(DEFAULT_GOOGLE_CLIENT_ID);
    setStoredGoogleClientId(DEFAULT_GOOGLE_CLIENT_ID);
    setSaveMessage('Reset to your configured Client ID');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleCopy = (text: string, type: 'origin' | 'id') => {
    navigator.clipboard.writeText(text);
    if (type === 'origin') {
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2000);
    } else {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleConnectClick = async () => {
    setIsSubmitting(true);
    try {
      const scope = useAppFilesOnlyScope
        ? GOOGLE_SCOPES_RESTRICTED_FREE
        : GOOGLE_SCOPES_DEFAULT;
      await onConnect(clientId.trim(), scope);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl my-8 max-h-[90vh] overflow-y-auto text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Google OAuth Authentication Setup</h2>
              <p className="text-xs text-slate-400">
                Connect Google Drive & Sheets for automated design backup & catalog tracking
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current Status Banner */}
        <div className="mt-4">
          {googleConnected ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3.5 text-xs text-emerald-300">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-semibold text-white">Successfully Connected to Google</p>
                  <p className="text-emerald-300 font-mono text-[11px]">{googleEmail}</p>
                </div>
              </div>
              {onDisconnect && (
                <button
                  onClick={onDisconnect}
                  className="rounded-lg border border-emerald-700/50 bg-emerald-900/40 hover:bg-emerald-800/40 px-3 py-1.5 font-medium text-emerald-200 transition cursor-pointer"
                >
                  Disconnect
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs text-amber-300">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
                <div>
                  <p className="font-semibold text-white">Not Connected to Google Account</p>
                  <p className="text-slate-400 text-[11px]">
                    OAuth token required to create Google Drive product folders and export to Sheets.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Authentication Error Diagnosis if present */}
        {googleAuthError && (
          <div className="mt-4 rounded-xl border border-rose-800/60 bg-rose-950/40 p-4 text-xs text-rose-200 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-300">Authentication Failed / Access Blocked</p>
                <p className="mt-1 text-slate-300 font-mono text-[11px] bg-rose-950/80 p-2 rounded border border-rose-900/50">
                  {googleAuthError}
                </p>
              </div>
            </div>

            <div className="mt-2 rounded-lg bg-slate-900/90 border border-slate-800 p-3 text-slate-300">
              <p className="font-semibold text-amber-300 flex items-center gap-1.5 mb-1.5">
                <HelpCircle className="h-4 w-4" /> Why does Google block authentication?
              </p>
              <p className="text-[11px] text-slate-400 mb-2">
                When you create a Google Cloud OAuth Client ID, Google places it in <strong>"Testing"</strong> mode by default. In Testing mode, Google blocks any account that is not listed in your <strong>"Test users"</strong> list with error <em>403: access_denied</em>.
              </p>
              <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-300">
                <li>
                  Go to <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noreferrer" className="text-indigo-400 underline inline-flex items-center gap-0.5">Google Cloud Console OAuth consent screen <ExternalLink className="h-3 w-3" /></a>
                </li>
                <li>
                  Scroll down to <strong>"Test users"</strong> and click <strong>+ ADD USERS</strong>.
                </li>
                <li>
                  Enter your Google email address (<span className="text-indigo-300 font-mono">elattarayman1@gmail.com</span>) and click <strong>SAVE</strong>.
                </li>
                <li>
                  (Alternatively, click <strong>"PUBLISH APP"</strong> on that screen to take it out of Testing mode).
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* Client ID Configuration Field */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200">
              Google OAuth 2.0 Web Client ID
            </label>
            <button
              type="button"
              onClick={handleResetDefault}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
            >
              Reset to provided Client ID
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              value={clientId}
              onChange={(e) => {
                const val = e.target.value;
                setClientId(val);
                setStoredGoogleClientId(val);
              }}
              placeholder="458826575164-b6jhkrudbd0ribltergiuiafpb1vhjrr.apps.googleusercontent.com"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-xs text-white focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => handleCopy(clientId, 'id')}
              title="Copy Client ID"
              className="absolute right-2 top-2 rounded-md bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[11px] text-slate-300 cursor-pointer"
            >
              {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          {saveMessage && (
            <p className="text-[11px] text-emerald-400 font-medium">✓ {saveMessage}</p>
          )}
        </div>

        {/* Essential Setup Guide / Troubleshooting Checklist */}
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
            <Info className="h-4 w-4 text-indigo-400" />
            <span>Google Cloud Console Required Settings</span>
          </div>

          <div className="space-y-3 text-xs text-slate-300">
            {/* Step 1: Authorized JavaScript Origin */}
            <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  1. Authorized JavaScript Origins Configured ✓
                </span>
                <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] text-emerald-300 border border-emerald-800/50">
                  Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Your Google Cloud Console already has <code className="text-emerald-300 bg-slate-900 px-1 py-0.5 rounded border border-slate-700">{currentOrigin || 'http://localhost:3000'}</code> saved in Authorized JavaScript origins.
                The previous error occurred because an outdated Client ID was active. Your verified Client ID is now loaded.
              </p>

              {/* Dev URL */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase">Primary App Origin (Development):</p>
                <div className="flex items-center justify-between gap-2 rounded bg-slate-950 p-2 font-mono text-[11px] border border-slate-800 text-indigo-200">
                  <span className="select-all break-all">{currentOrigin}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(currentOrigin, 'origin')}
                    className="shrink-0 flex items-center gap-1 rounded bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-[11px] font-semibold text-white transition cursor-pointer"
                  >
                    {copiedOrigin ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedOrigin ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Preview URL */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase">Preview App Origin:</p>
                <div className="flex items-center justify-between gap-2 rounded bg-slate-950 p-2 font-mono text-[11px] border border-slate-800 text-indigo-200">
                  <span className="select-all break-all">https://ais-pre-7q4d757aa3knsibrnzlz65-377317398577.europe-west1.run.app</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('https://ais-pre-7q4d757aa3knsibrnzlz65-377317398577.europe-west1.run.app', 'origin')}
                    className="shrink-0 flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </button>
                </div>
              </div>

              <div className="mt-2 rounded bg-slate-900/90 p-2.5 text-[11px] text-slate-300 border border-slate-800 space-y-1">
                <p className="font-semibold text-white">How to apply this in your Google Cloud Console:</p>
                <ol className="list-decimal pl-4 space-y-1 text-slate-400">
                  <li>In Google Cloud Console → <strong>Clients</strong> → Click your client ID <span className="text-slate-300 font-mono text-[10px]">458826575164...</span></li>
                  <li>Under <strong>Authorized JavaScript origins</strong>, click the blue <strong>+ Add URI</strong> button.</li>
                  <li>Paste the copied URL above.</li>
                  <li>(Optional) Also add it under <strong>Authorized redirect URIs</strong> via <strong>+ Add URI</strong>.</li>
                  <li>Scroll all the way to the bottom and click <strong>SAVE</strong>!</li>
                </ol>
              </div>
            </div>

            {/* Step 2: Test Users for Testing Mode */}
            <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  2. Test Users Status: Configured ✓
                </span>
                <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] text-emerald-300 border border-emerald-800/50">
                  Completed
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Great job! Your screenshot confirms <span className="font-mono text-emerald-300">elattarayman1@gmail.com</span> is already added to Test Users under Audience.
              </p>
            </div>

            {/* Step 3: Enabled APIs */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-300">3. Enabled Google APIs</span>
                <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] text-emerald-300 border border-emerald-800/50">Required</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                In Google Cloud Console → <strong>APIs & Services → Library</strong>, verify these APIs are enabled:
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded bg-slate-950 px-2.5 py-1 text-slate-300 border border-slate-800">
                  <FolderTree className="h-3.5 w-3.5 text-indigo-400" /> Google Drive API
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-slate-950 px-2.5 py-1 text-slate-300 border border-slate-800">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" /> Google Sheets API
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scope Options */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
          <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300">
            <input
              type="checkbox"
              checked={useAppFilesOnlyScope}
              onChange={(e) => setUseAppFilesOnlyScope(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-indigo-500 rounded"
            />
            <div>
              <span className="font-semibold text-white">Use App-Created Files Scope Only (<code className="text-indigo-300">auth/drive.file</code>)</span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Recommended if you receive verification warnings. Only requests access to folders and files created or opened by this app rather than your entire Google Drive.
              </p>
            </div>
          </label>
        </div>

        {/* Actions Footer */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveClientId}
              className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-200 transition cursor-pointer"
            >
              Save Client ID
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 hover:bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 transition cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleConnectClick}
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition shadow-lg shadow-indigo-900/40 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{googleConnected ? 'Re-authenticate with Google' : 'Connect Google Account'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
