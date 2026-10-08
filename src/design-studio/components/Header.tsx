import React, { useState } from 'react';
import { Download, RefreshCw, Palette, ChevronDown, Smartphone, Layout } from 'lucide-react';

interface HeaderProps {
  onReset: () => void;
  onDownloadCurrent?: () => void;
  hasArtwork: boolean;
  activeDesignTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onReset,
  onDownloadCurrent,
  hasArtwork,
}) => {
  const [showWorkflowsMenu, setShowWorkflowsMenu] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Branding */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-pink-500 p-0.5 shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Palette className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div className="relative">
              <div
                onClick={() => setShowWorkflowsMenu(!showWorkflowsMenu)}
                className="flex items-center gap-1.5 cursor-pointer select-none group"
              >
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent group-hover:text-white transition">
                  CaseCraft
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                  Design Studio <ChevronDown className="w-3 h-3 text-indigo-400" />
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block mt-0.5">
                AI Graphic & Artwork Generator
              </p>

              {/* Workflows Select Menu */}
              {showWorkflowsMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowWorkflowsMenu(false)}
                  />
                  <div className="absolute top-full left-0 mt-2 w-80 rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-2xl z-20 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150 text-slate-100 font-sans">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">
                      Select Active Workflow
                    </p>
                    <a
                      href="/"
                      className="flex items-start gap-3 p-2.5 rounded-lg text-left hover:bg-slate-800/80 transition"
                    >
                      <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-800/50 flex items-center justify-center shrink-0">
                        <Layout className="w-4 h-4 text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">7-Stage End-to-End Pipeline</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Full workflow: Design, Drive, Etsy, Sheets, and automation.</p>
                      </div>
                    </a>
                    <div className="flex items-start gap-3 p-2.5 rounded-lg text-left bg-pink-950/40 border border-pink-800/30 shrink-0">
                      <div className="w-8 h-8 rounded-lg bg-pink-950 border border-pink-800/50 flex items-center justify-center shrink-0">
                        <Palette className="w-4 h-4 text-pink-400" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-pink-300">Standalone Design Studio</p>
                        <p className="text-[10px] text-pink-200 mt-0.5 font-medium">Dynamic niche prompt generator & Gemini design builder.</p>
                      </div>
                    </div>
                    <a
                      href="/mockup-studio"
                      className="flex items-start gap-3 p-2.5 rounded-lg text-left hover:bg-slate-800/80 transition"
                    >
                      <div className="w-8 h-8 rounded-lg bg-sky-950 border border-sky-800/50 flex items-center justify-center shrink-0">
                        <Smartphone className="w-4 h-4 text-sky-400" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">Standalone Mockup Studio</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Multi-platform device mockup & photorealistic AI lifestyle scenes.</p>
                      </div>
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Center Pill: Gemini API Badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/80 border border-slate-800 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300 font-medium">Engine:</span>
            <span className="text-indigo-400 font-semibold">Gemini API</span>
            <span className="text-[10px] text-emerald-400/90 font-mono bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-800/40">
              Active
            </span>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 transition cursor-pointer"
              title="Reset prompt & placeholders"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Reset Defaults</span>
            </button>

            {hasArtwork && onDownloadCurrent && (
              <button
                onClick={onDownloadCurrent}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 shadow-md shadow-indigo-900/30 transition cursor-pointer"
                title="Download full resolution artwork"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Artwork</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
