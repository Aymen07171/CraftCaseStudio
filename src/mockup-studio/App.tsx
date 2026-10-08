import React, { useState } from 'react';
import {
  Smartphone,
  Sparkles,
  Upload,
  Layers,
  Camera,
  Layout,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Palette,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { MockupStudio } from '../components/MockupStudio';
import { LifestyleStudio } from '../components/LifestyleStudio';
import { GeneratedDesign } from '../types';

const INITIAL_VITRAIL_DESIGN: GeneratedDesign = {
  id: 'preset-sample-vitrail-01',
  title: 'Woodland Fox & Sunburst (Stained Glass)',
  prompt: `Masterpiece authentic cathedral stained glass window (vitrail), symmetrical arched vertical composition.`,
  imageUrl: '/src/assets/images/sample_vitrail_pure2d_1790462384613.jpg',
  niche: 'Woodland Fox & Sunburst (Stained Glass)',
  createdAt: Date.now(),
  placeholders: {
    SUBJECT_POSE:
      'a peaceful sleeping red fox curled in a tight circle with fluffy tail wrapped around its body',
    HALO_BACKGROUND:
      'a radiant segmented sunburst halo with glowing amber and golden glass rays, with a golden crescent moon and twinkling stars in the upper arch',
  },
  isPreset: true,
};

const SAMPLE_PRESETS: GeneratedDesign[] = [
  INITIAL_VITRAIL_DESIGN,
  {
    id: 'preset-mecha-02',
    title: 'Cyberpunk Mecha Samurai',
    prompt: 'Tactical cyberpunk phone case print, celestial fox spirit samurai, high-tech aesthetic',
    imageUrl: '/src/assets/images/sample_vitrail_1790446081289.jpg',
    niche: 'Cyberpunk & Mecha Urban',
    createdAt: Date.now(),
    placeholders: {},
    isPreset: true,
  },
];

export default function App() {
  const [activeDesign, setActiveDesign] = useState<GeneratedDesign>(INITIAL_VITRAIL_DESIGN);
  const [activeTab, setActiveTab] = useState<'canvas' | 'lifestyle'>('canvas');
  const [showWorkflowsMenu, setShowWorkflowsMenu] = useState(false);

  // Handle custom design upload
  const handleUploadArtwork = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setActiveDesign({
        id: `uploaded-${Date.now()}`,
        title: file.name.replace(/\.[^/.]+$/, ''),
        prompt: 'Custom uploaded artwork design.',
        imageUrl: reader.result,
        niche: 'Custom Artwork',
        createdAt: Date.now(),
        placeholders: {},
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Standalone Studio Header */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo, Branding & Switcher */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-violet-600 p-0.5 shadow-lg shadow-sky-500/20">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-sky-400" />
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
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                    Mockup Studio <ChevronDown className="w-3 h-3 text-sky-400" />
                  </span>
                </div>
                <p className="text-xs text-slate-400 hidden sm:block mt-0.5">
                  Universal Device Canvas & Lifestyle Scene Generator
                </p>

                {/* Switch Workflows Dropdown */}
                {showWorkflowsMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowWorkflowsMenu(false)}
                    />
                    <div className="absolute top-full left-0 mt-2 w-80 rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-2xl z-20 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
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
                          <p className="text-[10px] text-slate-400 mt-0.5">Design, Drive, Etsy, Sheets, and automation.</p>
                        </div>
                      </a>
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
                      <div className="flex items-start gap-3 p-2.5 rounded-lg text-left bg-sky-950/40 border border-sky-800/30 shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-sky-950 border border-sky-800/50 flex items-center justify-center">
                          <Smartphone className="w-4 h-4 text-sky-400" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-sky-300">Standalone Mockup Studio</p>
                          <p className="text-[10px] text-slate-300 mt-0.5 font-medium">Device canvas and photorealistic AI lifestyle mockups.</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Quick Links / Status */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer text-slate-300 hover:text-white">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Custom Art</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadArtwork}
                  className="hidden"
                />
              </label>

              <a
                href="/"
                className="hidden md:flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition font-semibold"
              >
                <span>Back to Pipeline</span>
                <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main Studio Hub */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Workspace Controls: Tabs & Preset Gallery */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Active Preset Selector Gallery (5 cols) */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl flex flex-col justify-between">
            <div className="space-y-3.5">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                Select Case Artwork Design
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Choose an illustrative artwork design from our catalog or upload your own above. The selected design automatically maps to the devices below.
              </p>

              {/* Presets List */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                {SAMPLE_PRESETS.map((p) => {
                  const isSelected = activeDesign.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setActiveDesign(p)}
                      className={`relative rounded-xl border overflow-hidden p-2 text-left transition duration-200 cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-sky-500 bg-sky-950/40 ring-1 ring-sky-500'
                          : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <div className="aspect-[3/4] rounded-lg overflow-hidden border border-slate-800 bg-black">
                        <img
                          src={p.imageUrl}
                          alt={p.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="mt-2 text-xs">
                        <p className="font-semibold text-white line-clamp-1 leading-tight">{p.title}</p>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{p.niche}</p>
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 p-1 rounded-full bg-sky-500 text-slate-950">
                          <CheckCircle2 className="w-3.5 h-3.5 font-bold" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom File Details */}
            {activeDesign.id.startsWith('uploaded') && (
              <div className="p-3 mt-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-300 space-y-1">
                <span className="font-bold text-white block">Custom Upload Loaded:</span>
                <span className="truncate block font-mono text-[11px]">{activeDesign.title}</span>
              </div>
            )}
          </div>

          {/* Tab Selector & Navigation Guide (7 cols) */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select Visualization Workflow
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Choose how you want to present your phone case artwork. You can generate clean multi-platform product catalog images or rich, photorealistic AI lifestyle scenes.
              </p>

              {/* Big Tab Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setActiveTab('canvas')}
                  className={`flex flex-col items-center justify-center p-5 rounded-2xl border text-center transition cursor-pointer group ${
                    activeTab === 'canvas'
                      ? 'border-indigo-500 bg-indigo-950/40 text-white shadow-lg ring-1 ring-indigo-500'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <Smartphone className={`w-8 h-8 mb-2 transition-transform duration-300 group-hover:scale-110 ${activeTab === 'canvas' ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span className="text-xs font-bold block">1. Platform Canvas Mockups</span>
                  <span className="text-[10px] text-slate-500 mt-1">Render clean studio catalog shots</span>
                </button>

                <button
                  onClick={() => setActiveTab('lifestyle')}
                  className={`flex flex-col items-center justify-center p-5 rounded-2xl border text-center transition cursor-pointer group ${
                    activeTab === 'lifestyle'
                      ? 'border-sky-500 bg-sky-950/40 text-white shadow-lg ring-1 ring-sky-500'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <Camera className={`w-8 h-8 mb-2 transition-transform duration-300 group-hover:scale-110 ${activeTab === 'lifestyle' ? 'text-sky-400' : 'text-slate-500'}`} />
                  <span className="text-xs font-bold block">2. AI Lifestyle Scene Generator</span>
                  <span className="text-[10px] text-slate-500 mt-1">Create photorealistic ambient scenes</span>
                </button>
              </div>
            </div>

            {/* Subtitle / Tip indicator */}
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 p-3.5 rounded-xl border border-slate-800 bg-slate-950/50 mt-4">
              <Eye className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                Tip: Switching tabs maintains your selected case finish, frametones, and customized prompt inputs!
              </span>
            </div>
          </div>
        </div>

        {/* Tab View Render: Canvas vs Lifestyle */}
        <div className="pt-4">
          {activeTab === 'canvas' ? (
            <MockupStudio activeDesign={activeDesign} />
          ) : (
            <LifestyleStudio activeDesign={activeDesign} />
          )}
        </div>
      </main>

      {/* Standalone Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-4 text-center text-xs text-slate-500">
        <p>CaseCraft Mockup &amp; Lifestyle Studio • Pure WebGL Shaders &amp; ComfyUI Generation</p>
      </footer>
    </div>
  );
}
