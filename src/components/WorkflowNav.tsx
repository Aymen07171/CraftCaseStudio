import React, { useState } from 'react';
import {
  Palette,
  Camera,
  FolderUp,
  FileText,
  Sheet,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Layers,
  Sparkles,
  Link2,
  UploadCloud,
  Key,
  Share2,
  ChevronDown,
  Smartphone,
  Layout,
  ExternalLink,
  FileSpreadsheet,
} from 'lucide-react';
import { ProductWorkflowStep } from '../types/unifiedWorkflow';

interface WorkflowNavProps {
  currentStep: ProductWorkflowStep;
  onSelectStep: (step: ProductWorkflowStep) => void;
  productId: string;
  hasDesign: boolean;
  mockupsCount: number;
  hasDriveAssets: boolean;
  hasListing: boolean;
  isReadyForExport: boolean;
  googleConnected: boolean;
  googleEmail?: string;
  onConnectGoogle?: () => void;
  onOpenGoogleSettings?: () => void;
  printifyCreated: boolean;
  printifyConnected?: boolean;
  onOpenPrintifyKeyModal?: () => void;
}

const STEPS: {
  id: ProductWorkflowStep;
  title: string;
  subtitle: string;
  icon: React.ElementType;
}[] = [
  {
    id: 'design',
    title: '1. Design Generation',
    subtitle: 'Niche 2D artwork',
    icon: Palette,
  },
  {
    id: 'mockup',
    title: '2. Mockup Generation',
    subtitle: 'Printify lifestyle scenes',
    icon: Camera,
  },
  {
    id: 'direct-upload',
    title: '2b. Direct Asset Uploader',
    subtitle: 'Upload finished artwork & mockups',
    icon: UploadCloud,
  },
  {
    id: 'drive',
    title: '3. Google Drive Assets',
    subtitle: 'Canonical folder storage',
    icon: FolderUp,
  },
  {
    id: 'listing',
    title: '4. Listing Information',
    subtitle: 'Etsy SEO & tags',
    icon: FileText,
  },
  {
    id: 'export',
    title: '5. Google Sheets & Make',
    subtitle: 'Export for automation',
    icon: Sheet,
  },
  {
    id: 'pinterest',
    title: '6. Pinterest Bulk CSV',
    subtitle: 'Auto-populate pins',
    icon: Share2,
  },
  {
    id: 'printify',
    title: '7. Printify Publishing',
    subtitle: 'Create a Printify draft',
    icon: UploadCloud,
  },
  {
    id: 'excel-printify',
    title: '8. Excel Bulk Importer',
    subtitle: 'Auto-import into Printify',
    icon: FileSpreadsheet,
  },
];

export const WorkflowNav: React.FC<WorkflowNavProps> = ({
  currentStep,
  onSelectStep,
  productId,
  hasDesign,
  mockupsCount,
  hasDriveAssets,
  hasListing,
  isReadyForExport,
  googleConnected,
  googleEmail,
  onConnectGoogle,
  onOpenGoogleSettings,
  printifyCreated,
  printifyConnected,
  onOpenPrintifyKeyModal,
}) => {
  const [showWorkflowsMenu, setShowWorkflowsMenu] = useState(false);

  const isStepDone = (stepId: ProductWorkflowStep): boolean => {
    switch (stepId) {
      case 'design':
        return hasDesign;
      case 'mockup':
        return mockupsCount > 0;
      case 'direct-upload':
        return hasDesign && mockupsCount > 0;
      case 'drive':
        return hasDriveAssets;
      case 'listing':
        return hasListing;
      case 'export':
        return isReadyForExport;
      case 'pinterest':
        return hasListing && (hasDesign || mockupsCount > 0);
      case 'printify':
        return printifyCreated;
      case 'excel-printify':
        return printifyCreated;
      default:
        return false;
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md text-slate-100">
      {/* Top Banner: Branding + Product ID Badge + Google Drive Auth Status */}
      <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-pink-500 p-0.5 shadow-md shadow-indigo-500/20">
            <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
              <Sparkles className="h-4 w-4 text-indigo-400" />
            </div>
          </div>
          <div className="relative">
            <div
              onClick={() => setShowWorkflowsMenu(!showWorkflowsMenu)}
              className="flex items-center gap-1.5 cursor-pointer select-none group"
            >
              <span className="text-base font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent group-hover:text-white transition">
                CaseCraft Studio
              </span>
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-300 flex items-center gap-1">
                Unified Pipeline <ChevronDown className="w-3 h-3 text-indigo-400" />
              </span>
            </div>

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
                  <div className="flex items-start gap-3 p-2.5 rounded-lg text-left bg-indigo-950/40 border border-indigo-800/30 shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-800/50 flex items-center justify-center shrink-0">
                      <Layout className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-indigo-300">7-Stage End-to-End Pipeline</p>
                      <p className="text-[10px] text-indigo-200 mt-0.5 font-medium">Full workflow: Design, Drive, Etsy, Sheets, and automation.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectStep('excel-printify');
                      setShowWorkflowsMenu(false);
                    }}
                    className="w-full flex items-start gap-3 p-2.5 rounded-lg text-left hover:bg-slate-800/80 transition cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-700/50 flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">Excel to Printify Importer (Step 8)</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Upload product Excel file &amp; auto-import sequentially into Printify.</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectStep('direct-upload');
                      setShowWorkflowsMenu(false);
                    }}
                    className="w-full flex items-start gap-3 p-2.5 rounded-lg text-left hover:bg-slate-800/80 transition cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-700/50 flex items-center justify-center shrink-0">
                      <UploadCloud className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">Direct Asset Uploader (Step 2b)</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Skip AI and upload finished artwork & multiple mockups directly.</p>
                    </div>
                  </button>
                  <a
                    href="/design-studio"
                    className="flex items-start gap-3 p-2.5 rounded-lg text-left hover:bg-slate-800/80 transition"
                  >
                    <div className="w-8 h-8 rounded-lg bg-pink-950 border border-pink-800/50 flex items-center justify-center shrink-0">
                      <Palette className="w-4 h-4 text-pink-400" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">Standalone Design Studio</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Dynamic niche prompt generator & Gemini design builder.</p>
                    </div>
                  </a>
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

        {/* Central Product ID Badge */}
        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1 text-xs">
          <span className="text-slate-400">Current Product ID:</span>
          <span className="font-mono font-bold text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-700/50">
            {productId}
          </span>
        </div>

        {/* Integrations Status & Actions: Printify & Google Workspace */}
        <div className="flex items-center gap-2">
          {onOpenPrintifyKeyModal && (
            <button
              type="button"
              onClick={onOpenPrintifyKeyModal}
              title={printifyConnected ? 'Printify API connected - click to manage key' : 'Import Printify Personal Access Token'}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                printifyConnected
                  ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50'
                  : 'border-indigo-500/40 bg-indigo-950/40 text-indigo-200 hover:bg-indigo-900/50'
              }`}
            >
              <Key className="h-3.5 w-3.5 text-indigo-400" />
              <span>{printifyConnected ? 'Printify Key' : 'Import Printify Key'}</span>
              <span
                className={`h-2 w-2 rounded-full ${
                  printifyConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
            </button>
          )}

          {googleConnected ? (
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="truncate max-w-[160px] sm:max-w-[220px]" title={googleEmail}>
                {googleEmail || 'Google Drive & Sheets Connected'}
              </span>
            </div>
          ) : (
            <button
              onClick={onConnectGoogle}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-950/40 hover:bg-indigo-900/50 px-3 py-1.5 text-xs font-medium text-indigo-200 transition cursor-pointer"
            >
              <Link2 className="h-3.5 w-3.5 text-indigo-400" />
              <span>Connect Google Drive</span>
            </button>
          )}

          {onOpenGoogleSettings && (
            <button
              type="button"
              onClick={onOpenGoogleSettings}
              title="Google OAuth Settings & Diagnostics"
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/90 hover:bg-slate-800 px-2 py-1.5 text-xs text-slate-300 hover:text-white transition cursor-pointer"
            >
              <Key className="h-3.5 w-3.5 text-indigo-400" />
              <span className="hidden sm:inline">OAuth Settings</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Pipeline Progress Navigation Bar */}
      <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
        <nav aria-label="End-to-end workflow steps" className="flex items-center justify-between gap-1 overflow-x-auto pb-1">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isDone = isStepDone(step.id);

            return (
              <React.Fragment key={step.id}>
                <button
                  type="button"
                  onClick={() => onSelectStep(step.id)}
                  aria-current={isActive ? 'step' : undefined}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left transition cursor-pointer ${
                    isActive
                      ? 'border border-indigo-500/80 bg-indigo-900/40 text-white shadow-md shadow-indigo-950/50'
                      : 'border border-transparent hover:border-slate-800 hover:bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs ${
                      isActive
                        ? 'border-indigo-400/50 bg-indigo-600 text-white'
                        : isDone
                        ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-400'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                  </div>
                  <div className="hidden sm:block">
                    <p className={`text-xs font-semibold leading-none ${isActive ? 'text-white' : 'text-slate-300'}`}>
                      {step.title}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-none">{step.subtitle}</p>
                  </div>
                </button>

                {idx < STEPS.length - 1 && (
                  <div className="hidden md:block h-px w-6 bg-slate-800 shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
