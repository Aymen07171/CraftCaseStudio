import React, { useState, useEffect, useRef } from 'react';
import {
  Key,
  X,
  Upload,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Trash2,
  LoaderCircle,
  FileText,
  Copy,
  Check,
  ShieldCheck,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  getStoredPrintifyToken,
  saveAndVerifyPrintifyToken,
  clearStoredPrintifyToken,
  clearPrintifyTokenOnServer,
  parsePrintifyKeyFromFile,
  fetchPrintifyApi,
  diagnosePrintifyHealth,
} from '../services/printifyClient';

interface PrintifyKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyConnected?: (token: string) => void;
}

export const PrintifyKeyModal: React.FC<PrintifyKeyModalProps> = ({
  isOpen,
  onClose,
  onKeyConnected,
}) => {
  const [tokenInput, setTokenInput] = useState(() => getStoredPrintifyToken());
  const [showToken, setShowToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [connectedShops, setConnectedShops] = useState<any[]>([]);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      const stored = getStoredPrintifyToken();
      setTokenInput(stored);
      setError(null);
      setSuccessMsg(null);
      setImportedFileName(null);
      setDiagnosticReport(null);

      if (stored) {
        // Check current status
        setIsLoading(true);
        fetchPrintifyApi('connection', {}, stored)
          .then((res) => {
            if (res.connected && Array.isArray(res.shops)) {
              setConnectedShops(res.shops);
            }
          })
          .catch(() => {})
          .finally(() => setIsLoading(false));
      } else {
        setConnectedShops([]);
      }
    }
  }, [isOpen]);

  const handleDiagnose = async () => {
    setIsDiagnosing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await diagnosePrintifyHealth(tokenInput);
      setDiagnosticReport(res.report);
      if (res.ok) {
        setSuccessMsg(
          res.message ||
            'Diagnostic test succeeded! Token is valid, shop is connected, and image upload pipeline is operational.'
        );
        if (res.report?.shops?.length) {
          setConnectedShops(res.report.shops);
        }
      } else {
        setError(
          res.report?.recommendations?.join(' · ') ||
            res.message ||
            'Diagnostic test detected an issue.'
        );
      }
    } catch (err: any) {
      setError(err.message || 'Diagnostic health check failed.');
    } finally {
      setIsDiagnosing(false);
    }
  };

  if (!isOpen) return null;

  // Handle file import
  const handleFileSelect = (file: File) => {
    setError(null);
    setSuccessMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const parsedKey = parsePrintifyKeyFromFile(content);
      if (parsedKey) {
        setTokenInput(parsedKey);
        setImportedFileName(file.name);
        setSuccessMsg(`Extracted key from "${file.name}". Click "Save & Connect" to verify.`);
      } else {
        setError(
          `Could not detect a valid Printify token in "${file.name}". Ensure the file contains your token or a PRINTIFY_API_TOKEN line.`
        );
      }
    };
    reader.onerror = () => {
      setError(`Failed to read "${file.name}".`);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parsePrintifyKeyFromFile(text) || text.trim();
      if (parsed) {
        setTokenInput(parsed);
        setSuccessMsg('Key pasted from clipboard!');
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch {
      setError('Unable to read from clipboard. Please paste into the field directly.');
    }
  };

  const handleSaveAndVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanToken = tokenInput.trim();
    if (!cleanToken) {
      setError('Please provide a Printify Personal Access Token.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await saveAndVerifyPrintifyToken(cleanToken);
      const shops = Array.isArray(res.shops) ? res.shops : [];
      setConnectedShops(shops);
      setSuccessMsg(
        `✓ Token verified successfully! Connected to ${shops.length} Printify store${
          shops.length === 1 ? '' : 's'
        }.`
      );

      if (onKeyConnected) {
        onKeyConnected(cleanToken);
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Failed to verify Printify token. Check the token and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setTokenInput('');
    setImportedFileName(null);
    clearStoredPrintifyToken();
    await clearPrintifyTokenOnServer();
    setConnectedShops([]);
    setSuccessMsg('Printify disconnected.');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const isConnected = connectedShops.length > 0 || Boolean(getStoredPrintifyToken());

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="printify-key-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-xl rounded-2xl border border-indigo-900/60 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl space-y-5 text-slate-100"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-indigo-900/40 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 shadow-sm">
              <Key className="h-5 w-5" />
            </span>
            <div>
              <h2 id="printify-key-modal-title" className="text-base font-bold text-white">
                Import Printify API Key
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Connect your Printify Personal Access Token for product publishing & mockups.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current Connection Status Banner */}
        <div
          className={`rounded-xl border p-3 flex items-center justify-between gap-3 text-xs ${
            isConnected
              ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-200'
              : 'border-slate-800 bg-slate-950 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span className="font-medium">
              {isConnected
                ? `Connected to Printify (${connectedShops.length} shop${
                    connectedShops.length === 1 ? '' : 's'
                  })`
                : 'Printify key is not connected'}
            </span>
          </div>
          {isConnected && (
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-[11px] text-rose-400 hover:text-rose-300 underline cursor-pointer"
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Option 1: File Import Drop Area */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300">
            Option A: Import Key from File (.env, .txt, .json, .key)
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition ${
              isDragOver
                ? 'border-indigo-400 bg-indigo-950/40 text-indigo-200'
                : 'border-slate-800 bg-slate-950/60 hover:border-indigo-500/50 hover:bg-slate-900/60'
            }`}
          >
            <Upload className="mx-auto h-6 w-6 text-indigo-400" />
            <p className="mt-2 text-xs font-medium text-slate-200">
              {importedFileName ? (
                <span className="text-emerald-300 font-semibold">✓ {importedFileName} loaded</span>
              ) : (
                'Drop your key file here, or click to browse'
              )}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Supports .env (PRINTIFY_API_TOKEN=...), JSON, or plain text token files
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".env,.txt,.json,.key,text/plain"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />
          </div>
        </div>

        {/* Option 2: Manual Paste & Token Form */}
        <form onSubmit={handleSaveAndVerify} className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300">
              Option B: Paste Personal Access Token Directly
            </label>
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
            >
              <Copy className="h-3 w-3" /> Paste from Clipboard
            </button>
          </div>

          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste your Printify token here (e.g. eyJ0eXAi...)"
              disabled={isLoading}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 pr-10 text-xs font-mono text-white outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute top-2.5 right-3 text-slate-400 hover:text-slate-200"
              title={showToken ? 'Hide token' : 'Show token'}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Feedback messages */}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-800/60 bg-rose-950/40 p-3 text-xs text-rose-200 flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 p-3 text-xs text-emerald-200 flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Connected Shops Preview */}
          {connectedShops.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5 space-y-1 text-xs">
              <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                Available Stores:
              </span>
              <ul className="space-y-1">
                {connectedShops.map((shop) => (
                  <li
                    key={shop.id}
                    className="flex items-center justify-between text-slate-300 font-mono text-[11px]"
                  >
                    <span>{shop.title}</span>
                    <span className="text-slate-500">
                      ID: {shop.id} · {shop.sales_channel || 'Shop'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <a
              href="https://printify.com/app/account/api"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
            >
              Get token from Printify Settings &gt; API <ExternalLink className="h-3 w-3" />
            </a>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiagnose}
                disabled={isDiagnosing || isLoading || !tokenInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600/50 bg-teal-950/40 hover:bg-teal-900/60 px-3.5 py-2 text-xs font-semibold text-teal-200 transition cursor-pointer"
                title="Run diagnostic tests on token, shop connection, and image upload pipeline"
              >
                {isDiagnosing ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin text-teal-300" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />
                )}
                <span>{isDiagnosing ? 'Testing...' : 'Diagnose Connection'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-800 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isLoading || isDiagnosing || !tokenInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 shadow-md shadow-indigo-950 cursor-pointer"
              >
                {isLoading ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {isLoading ? 'Verifying...' : 'Save & Connect'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
