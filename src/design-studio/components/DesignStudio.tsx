import React, { useState } from 'react';
import {
  Sparkles,
  Shuffle,
  Copy,
  Check,
  Plus,
  Trash2,
  Wand2,
  RefreshCw,
  Lightbulb,
  Code2,
  Layers,
  Download,
  Maximize2,
  X,
  Sliders,
  History,
  Info,
  ExternalLink,
  Upload,
} from 'lucide-react';
import { NichePreset, PlaceholderField, GeneratedDesign, AspectRatio } from '../types';
import { NICHE_PRESETS } from '../data/presets';
import { EtsyListingGenerator } from './EtsyListingWorkspace';

interface DesignStudioProps {
  activeDesign: GeneratedDesign | null;
  designs: GeneratedDesign[];
  onSelectDesign: (design: GeneratedDesign) => void;
  onDeleteDesign: (id: string) => void;
  onDesignGenerated: (design: GeneratedDesign, listingData?: any) => void;
  resetTrigger?: number;
  onSendToMockup?: (design: GeneratedDesign) => void;
}

export const DesignStudio: React.FC<DesignStudioProps> = ({
  activeDesign,
  designs,
  onSelectDesign,
  onDeleteDesign,
  onDesignGenerated,
  onSendToMockup,
}) => {
  const [selectedNicheId, setSelectedNicheId] = useState<string>(NICHE_PRESETS[0].id);
  const currentPreset: NichePreset =
    NICHE_PRESETS.find((n) => n.id === selectedNicheId) || NICHE_PRESETS[0];

  // Custom design title state
  const [designTitle, setDesignTitle] = useState<string>(
    activeDesign?.title || `${currentPreset.name} Artwork`
  );
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
  const [isSuggestingTitles, setIsSuggestingTitles] = useState<boolean>(false);

  // Listing / SEO Analysis state
  const [analyzedListing, setAnalyzedListing] = useState<any>(null);
  const [isAnalyzingListing, setIsAnalyzingListing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisSuccess, setAnalysisSuccess] = useState<string | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const [template, setTemplate] = useState<string>(currentPreset.template);
  const [placeholders, setPlaceholders] = useState<PlaceholderField[]>(
    currentPreset.defaultPlaceholders
  );
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    currentPreset.defaultAspectRatio || '9:16'
  );
  const [customSeed, setCustomSeed] = useState<string>('');
  const [useRandomSeed, setUseRandomSeed] = useState<boolean>(true);

  const [showTemplateEditor, setShowTemplateEditor] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // New tag modal/input state
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [newTagLabel, setNewTagLabel] = useState<string>('');
  const [showAddTag, setShowAddTag] = useState<boolean>(false);

  // AI suggestions loading states per tag
  const [suggestingTag, setSuggestingTag] = useState<string | null>(null);

  // Lightbox Modal
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);

  // Sync designTitle when activeDesign changes
  React.useEffect(() => {
    if (activeDesign?.title) {
      setDesignTitle(activeDesign.title);
    }
  }, [activeDesign?.id, activeDesign?.title]);

  // Assemble dynamic prompt by replacing {{TAG}} with corresponding placeholder value
  const assemblePrompt = (): string => {
    let result = template;
    placeholders.forEach((p) => {
      const regex = new RegExp(`{{\\s*${p.tag}\\s*}}`, 'g');
      result = result.replace(regex, p.value.trim() || `[${p.label}]`);
    });
    return result;
  };

  const dynamicPrompt = assemblePrompt();

  // Switch Niche Preset
  const handleSelectNiche = (nicheId: string) => {
    const niche = NICHE_PRESETS.find((n) => n.id === nicheId);
    if (!niche) return;
    setSelectedNicheId(nicheId);
    setTemplate(niche.template);
    setPlaceholders(niche.defaultPlaceholders);
    setDesignTitle(`${niche.name} Artwork`);
    setSuggestedTitles([]);
    if (niche.defaultAspectRatio) {
      setAspectRatio(niche.defaultAspectRatio);
    }
    setGenerationError(null);
  };

  // Suggest AI Design Titles
  const handleSuggestTitles = async () => {
    setIsSuggestingTitles(true);
    try {
      const res = await fetch('/design-api/suggest-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: dynamicPrompt,
          niche: currentPreset.name,
          currentTitle: designTitle,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.titles) && data.titles.length > 0) {
        setSuggestedTitles(data.titles);
      }
    } catch (err) {
      console.error('Failed to get title suggestions:', err);
    } finally {
      setIsSuggestingTitles(false);
    }
  };

  // Analyze Design Title & Generate SEO, Keywords, Description & Tags
  const handleAnalyzeDesignTitleAndSEO = async () => {
    setIsAnalyzingListing(true);
    setAnalysisError(null);
    setAnalysisSuccess(null);

    const titleToUse = designTitle.trim() || activeDesign?.title || `${currentPreset.name} Artwork`;
    const imageToAnalyze = activeDesign?.imageUrl || currentPreset.sampleImage || '';

    try {
      const response = await fetch('/design-api/generate-etsy-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: dynamicPrompt,
          imageDataUrl: imageToAnalyze,
          designTitle: titleToUse,
          niche: currentPreset.name,
        }),
      });

      const rawText = await response.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error('Listing service returned an invalid format.');
      }

      if (!response.ok || !data.listing) {
        throw new Error(data?.error || 'Failed to analyze design and generate listing metadata.');
      }

      setAnalyzedListing(data.listing);
      setAnalysisSuccess(`Successfully analyzed "${titleToUse}"! Generated title, 13 tags, description, and keywords.`);

      // If we have an active design, update its title and attach listing metadata
      if (activeDesign) {
        const updatedDesign: GeneratedDesign = {
          ...activeDesign,
          title: titleToUse,
        };
        onDesignGenerated(updatedDesign, data.listing);
      }
    } catch (err: any) {
      console.error('Analysis error:', err);
      setAnalysisError(err.message || 'Error communicating with AI analysis engine.');
    } finally {
      setIsAnalyzingListing(false);
    }
  };

  // Helper copy text
  const handleCopyText = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // Update a single placeholder value
  const handleUpdateValue = (tag: string, value: string) => {
    setPlaceholders((prev) =>
      prev.map((p) => (p.tag === tag ? { ...p, value } : p))
    );
  };

  // Randomize a single placeholder value from its options
  const handleRandomizeSingle = (tag: string) => {
    setPlaceholders((prev) =>
      prev.map((p) => {
        if (p.tag === tag && p.options.length > 0) {
          const filtered = p.options.filter((opt) => opt !== p.value);
          const pick =
            filtered.length > 0
              ? filtered[Math.floor(Math.random() * filtered.length)]
              : p.options[0];
          return { ...p, value: pick };
        }
        return p;
      })
    );
  };

  // Randomize ALL placeholders
  const handleRandomizeAll = () => {
    setPlaceholders((prev) =>
      prev.map((p) => {
        if (p.options.length > 0) {
          const randomIndex = Math.floor(Math.random() * p.options.length);
          return { ...p, value: p.options[randomIndex] };
        }
        return p;
      })
    );
  };

  // Reset to default values of preset
  const handleResetDefaults = () => {
    setTemplate(currentPreset.template);
    setPlaceholders(currentPreset.defaultPlaceholders);
    setAspectRatio(currentPreset.defaultAspectRatio || '9:16');
  };

  // Copy Assembled Prompt to Clipboard
  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(dynamicPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  // Add Custom Placeholder Tag
  const handleAddCustomTag = () => {
    if (!newTagInput.trim()) return;
    const cleanTag = newTagInput.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const label = newTagLabel.trim() || cleanTag.replace(/_/g, ' ');

    if (placeholders.some((p) => p.tag === cleanTag)) {
      alert(`Placeholder {{${cleanTag}}} already exists!`);
      return;
    }

    const newField: PlaceholderField = {
      tag: cleanTag,
      label,
      description: 'Custom user defined placeholder',
      value: '',
      options: [],
    };

    setPlaceholders((prev) => [...prev, newField]);
    setTemplate((prev) => `${prev} {{${cleanTag}}}`);
    setNewTagInput('');
    setNewTagLabel('');
    setShowAddTag(false);
  };

  // Remove a placeholder tag
  const handleRemoveTag = (tag: string) => {
    setPlaceholders((prev) => prev.filter((p) => p.tag !== tag));
    const regex = new RegExp(`{{\\s*${tag}\\s*}}`, 'g');
    setTemplate((prev) => prev.replace(regex, '').replace(/\s+/g, ' ').trim());
  };

  // AI Suggestions for a tag
  const handleGetAiSuggestions = async (tag: string) => {
    setSuggestingTag(tag);
    try {
      const response = await fetch('/design-api/suggest-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeholder: tag,
          niche: currentPreset.name,
          currentPrompt: dynamicPrompt,
        }),
      });
      const data = await response.json();
      if (data.suggestions && data.suggestions.length > 0) {
        setPlaceholders((prev) =>
          prev.map((p) => {
            if (p.tag === tag) {
              const merged = Array.from(new Set([...p.options, ...data.suggestions]));
              return {
                ...p,
                options: merged,
                value: data.suggestions[0] || p.value,
              };
            }
            return p;
          })
        );
      }
    } catch (err) {
      console.error('Failed to get suggestions', err);
    } finally {
      setSuggestingTag(null);
    }
  };

  // Generate artwork through the server-side Gemini API.
  const handleGenerateDesign = async (overrideSeed?: number) => {
    setIsGenerating(true);
    setGenerationError(null);

    const chosenSeed =
      overrideSeed !== undefined
        ? overrideSeed
        : useRandomSeed
        ? Math.floor(Math.random() * 1000000000)
        : customSeed.trim()
        ? parseInt(customSeed, 10)
        : Math.floor(Math.random() * 1000000000);

    try {
      const response = await fetch('/design-api/generate-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: dynamicPrompt,
          aspectRatio,
          seed: chosenSeed,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.imageUrl) {
        throw new Error(data.error || 'Failed to generate design with Gemini.');
      }

      const activeTitle = designTitle.trim() || `${currentPreset.name} Art`;

      const newDesign: GeneratedDesign = {
        id: `design-${Date.now()}`,
        title: activeTitle,
        prompt: dynamicPrompt,
        imageUrl: data.imageUrl,
        sourceUrl: data.sourceUrl,
        niche: currentPreset.name,
        createdAt: Date.now(),
        placeholders: placeholders.reduce((acc, p) => ({ ...acc, [p.tag]: p.value }), {}),
        seed: data.seed ?? chosenSeed,
        aspectRatio,
        width: data.width,
        height: data.height,
      };

      onDesignGenerated(newDesign, analyzedListing);
    } catch (err: any) {
      console.error('Gemini image generation failed:', err);
      setGenerationError(err.message || 'Image generation failed with Gemini.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Load Preset Sample Artwork
  const handleApplyPresetSample = () => {
    if (currentPreset.sampleImage) {
      const activeTitle = designTitle.trim() || `${currentPreset.name} Sample Artwork`;
      const presetDesign: GeneratedDesign = {
        id: `preset-${currentPreset.id}`,
        title: activeTitle,
        prompt: dynamicPrompt,
        imageUrl: currentPreset.sampleImage,
        niche: currentPreset.name,
        createdAt: Date.now(),
        placeholders: placeholders.reduce((acc, p) => ({ ...acc, [p.tag]: p.value }), {}),
        isPreset: true,
        aspectRatio: '9:16',
      };
      onDesignGenerated(presetDesign, analyzedListing);
    }
  };

  // Helper download function
  const handleDownloadImage = (design: GeneratedDesign) => {
    const link = document.createElement('a');
    link.href = design.imageUrl;
    link.download = `${design.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      {/* Top Banner / Niche Selector */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                Design Studio • Interactive Prompt Engineering
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              AI Artwork & Graphic Design Studio
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Choose a creative art style, customize prompt placeholders (e.g.{' '}
              <code className="text-indigo-300 bg-indigo-950/60 px-1 py-0.5 rounded text-xs">
                &#123;&#123;SUBJECT_POSE&#125;&#125;
              </code>
              ,{' '}
              <code className="text-indigo-300 bg-indigo-950/60 px-1 py-0.5 rounded text-xs">
                &#123;&#123;BOTANICAL&#125;&#125;
              </code>
              ,{' '}
              <code className="text-indigo-300 bg-indigo-950/60 px-1 py-0.5 rounded text-xs">
                &#123;&#123;COLOR_PALETTE&#125;&#125;
              </code>
                ), and generate original illustrations with Gemini.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRandomizeAll}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition shadow-sm cursor-pointer"
              title="Shuffle all placeholder values"
            >
              <Shuffle className="w-3.5 h-3.5 text-indigo-400" />
              <span>Randomize All</span>
            </button>
            <button
              onClick={handleResetDefaults}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 text-xs font-medium border border-slate-700/60 transition cursor-pointer"
              title="Reset to default preset values"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Niche Preset Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {NICHE_PRESETS.map((niche) => {
            const isSelected = niche.id === selectedNicheId;
            const isRef = niche.badge.includes('Reference');
            return (
              <button
                key={niche.id}
                onClick={() => handleSelectNiche(niche.id)}
                className={`text-left p-3.5 rounded-xl transition-all border relative cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-950/60 border-indigo-500 shadow-lg shadow-indigo-950/50 ring-1 ring-indigo-500/40'
                    : isRef
                    ? 'bg-slate-950/70 border-indigo-950/60 hover:bg-slate-800/40 hover:border-indigo-800/50 text-slate-300'
                    : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                      isSelected
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : isRef
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {niche.badge}
                  </span>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_6px_#818cf8]" />
                  )}
                </div>
                <h3 className="font-semibold text-sm text-white">{niche.name}</h3>
                <p className="text-xs text-slate-400 line-clamp-2 mt-1">{niche.description}</p>
              </button>
            );
          })}
        </div>

        {/* Reference Alignment Explainer Bar */}
        {currentPreset.referenceNotes && (
          <div className="mt-4 p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-800/50 flex items-start gap-3">
            <div className="p-1 rounded-lg bg-indigo-900/60 text-indigo-300 mt-0.5 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="text-xs">
              <span className="font-semibold text-indigo-200 uppercase tracking-wider text-[11px] block mb-0.5">
                Target Reference Alignment:
              </span>
              <p className="text-slate-300 leading-relaxed">
                {currentPreset.referenceNotes}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Placeholders Configuration (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <h2 className="text-base font-semibold text-white">
                  Placeholders for {currentPreset.name}
                </h2>
                <span className="text-xs text-slate-500 font-mono">
                  ({placeholders.length} tags)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowTemplateEditor(!showTemplateEditor)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>{showTemplateEditor ? 'Hide Template' : 'Edit Template'}</span>
                </button>
                <button
                  onClick={() => setShowAddTag(!showAddTag)}
                  className="flex items-center gap-1.5 text-xs font-medium text-indigo-300 hover:text-white px-2.5 py-1 rounded-lg bg-indigo-900/40 hover:bg-indigo-800/50 border border-indigo-700/50 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Tag</span>
                </button>
              </div>
            </div>

            {/* Template Editor Box (Optional Toggle) */}
            {showTemplateEditor && (
              <div className="mb-6 p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                    Master Prompt Template Structure
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Use &#123;&#123;TAG&#125;&#125; for placeholders
                  </span>
                </div>
                <textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  rows={4}
                  className="w-full text-xs font-mono bg-slate-900 text-slate-200 p-3 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Add Custom Tag Form */}
            {showAddTag && (
              <div className="mb-6 p-4 rounded-xl bg-indigo-950/30 border border-indigo-700/40">
                <h4 className="text-xs font-semibold text-indigo-200 mb-3 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Define New Dynamic Placeholder
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Tag Key (e.g. LIGHTING)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. LIGHTING_EFFECT"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Display Label (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ambient Lighting"
                      value={newTagLabel}
                      onChange={(e) => setNewTagLabel(e.target.value)}
                      className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowAddTag(false)}
                    className="text-xs px-3 py-1 text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddCustomTag}
                    className="text-xs px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium cursor-pointer"
                  >
                    Insert Placeholder
                  </button>
                </div>
              </div>
            )}

            {/* Placeholder Input Cards */}
            <div className="space-y-4">
              {placeholders.map((placeholder) => {
                const isSuggesting = suggestingTag === placeholder.tag;

                return (
                  <div
                    key={placeholder.tag}
                    className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition-all group"
                  >
                    {/* Header of placeholder card */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          &#123;&#123;{placeholder.tag}&#125;&#125;
                        </span>
                        <span className="text-xs font-medium text-slate-300">
                          {placeholder.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* AI Suggestions Button */}
                        <button
                          onClick={() => handleGetAiSuggestions(placeholder.tag)}
                          disabled={isSuggesting}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/20 transition cursor-pointer"
                          title="Generate fresh creative ideas"
                        >
                          <Lightbulb className="w-3 h-3" />
                          <span>{isSuggesting ? 'Thinking...' : 'AI Ideas'}</span>
                        </button>

                        {/* Randomize single placeholder */}
                        {placeholder.options.length > 0 && (
                          <button
                            onClick={() => handleRandomizeSingle(placeholder.tag)}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                            title="Pick random option"
                          >
                            <Shuffle className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Delete custom tag */}
                        <button
                          onClick={() => handleRemoveTag(placeholder.tag)}
                          className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                          title="Remove placeholder"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Active Value Input */}
                    <div className="mb-2.5">
                      <textarea
                        rows={2}
                        value={placeholder.value}
                        onChange={(e) => handleUpdateValue(placeholder.tag, e.target.value)}
                        placeholder={`Enter value for {{${placeholder.tag}}}...`}
                        className="w-full text-xs bg-slate-900 text-slate-100 rounded-lg p-2.5 border border-slate-700/80 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed"
                      />
                    </div>

                    {/* Preset Option Quick Pills */}
                    {placeholder.options.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 mr-1">
                          Picks:
                        </span>
                        {placeholder.options.slice(0, 4).map((option, idx) => {
                          const isActive = placeholder.value === option;
                          return (
                            <button
                              key={idx}
                              onClick={() => handleUpdateValue(placeholder.tag, option)}
                              className={`text-[11px] px-2.5 py-1 rounded-full transition-all text-left truncate max-w-[260px] cursor-pointer ${
                                isActive
                                  ? 'bg-indigo-600 text-white font-medium shadow-sm'
                                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white border border-slate-700/50'
                              }`}
                              title={option}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Live Prompt Assembly & Generation Settings (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Assembled Prompt & Generation Control Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            {/* Design Title Feature Section */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Design Artwork Title</span>
                </label>
                <button
                  type="button"
                  onClick={handleSuggestTitles}
                  disabled={isSuggestingTitles}
                  className="flex items-center gap-1 text-[11px] font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/20 transition cursor-pointer"
                  title="Generate creative design titles with Gemini"
                >
                  <Lightbulb className="w-3 h-3" />
                  <span>{isSuggestingTitles ? 'Generating...' : 'AI Title Ideas'}</span>
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={designTitle}
                  onChange={(e) => setDesignTitle(e.target.value)}
                  placeholder="e.g. Woodland Fox & Sunburst (Stained Glass)"
                  className="w-full text-xs bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
              </div>

              {/* Title Suggestions Pills */}
              {suggestedTitles.length > 0 && (
                <div className="pt-1 flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Pick:</span>
                  {suggestedTitles.map((st, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setDesignTitle(st)}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-indigo-900/40 text-slate-300 hover:text-indigo-200 border border-slate-700/60 transition cursor-pointer"
                    >
                      {st}
                    </button>
                  ))}
                </div>
              )}

              {/* Analyze Design Title & Generate SEO Button */}
              <div className="pt-2 border-t border-slate-800/70">
                <button
                  type="button"
                  onClick={handleAnalyzeDesignTitleAndSEO}
                  disabled={isAnalyzingListing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-indigo-950/70 hover:bg-indigo-900/80 border border-indigo-500/40 text-xs font-semibold text-indigo-200 hover:text-white transition shadow-sm cursor-pointer"
                >
                  {isAnalyzingListing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                      <span>Analyzing Title & Generating SEO Suite...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Analyze Title &amp; Generate Keywords, Description &amp; Tags</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Dynamic Prompt Assembly</h3>
              </div>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 transition cursor-pointer"
              >
                {copiedPrompt ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Assembled Prompt Text Box */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 leading-relaxed font-mono relative">
              <div className="max-h-40 overflow-y-auto pr-1">
                {dynamicPrompt}
              </div>
              <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                <span>Aspect: {aspectRatio}</span>
                <span>{dynamicPrompt.length} characters</span>
              </div>
            </div>

            {/* Generation Parameters: Aspect Ratio & Seed */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  Generation Settings
                </span>
                <span className="text-[11px] text-emerald-400 font-medium">Gemini API</span>
              </div>

              {/* Aspect Ratio Buttons */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1.5">
                  Aspect Ratio Canvas:
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['9:16', '1:1', '3:4', '4:3', '16:9'] as AspectRatio[]).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setAspectRatio(ratio)}
                      className={`text-xs py-1.5 px-1 text-center rounded-lg border font-mono transition cursor-pointer ${
                        aspectRatio === ratio
                          ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seed Control */}
              <div className="pt-1 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="randomSeedCheck"
                    checked={useRandomSeed}
                    onChange={(e) => setUseRandomSeed(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-900 cursor-pointer"
                  />
                  <label htmlFor="randomSeedCheck" className="text-slate-300 cursor-pointer">
                    Random Seed
                  </label>
                </div>

                {!useRandomSeed && (
                  <input
                    type="number"
                    placeholder="Enter seed #"
                    value={customSeed}
                    onChange={(e) => setCustomSeed(e.target.value)}
                    className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                  />
                )}
              </div>
            </div>

            {/* Error Message if any */}
            {generationError && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800 text-xs text-rose-300 space-y-2">
                <p className="font-semibold text-rose-200">Notice</p>
                <p>{generationError}</p>
                {currentPreset.sampleImage && (
                  <div className="pt-1">
                    <button
                      onClick={handleApplyPresetSample}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition cursor-pointer"
                    >
                      <span>Load Preset Sample Artwork</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Main Generate Button with Gemini */}
            <button
              onClick={() => handleGenerateDesign()}
              disabled={isGenerating}
              className={`w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-semibold transition-all shadow-lg cursor-pointer ${
                isGenerating
                  ? 'bg-indigo-800 text-indigo-200 cursor-wait'
                  : 'bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-600/30'
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating with Gemini...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Artwork with Gemini</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2 py-1">
              <div className="h-px bg-slate-800/85 flex-1" />
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Or</span>
              <div className="h-px bg-slate-800/85 flex-1" />
            </div>

            <label className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700/80 hover:text-white border border-slate-700/60 transition-all cursor-pointer">
              <Upload className="w-4 h-4 text-indigo-400" />
              <span>Upload My Custom Design</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result !== 'string') return;
                    const uploadedDesign: GeneratedDesign = {
                      id: `uploaded-${Date.now()}`,
                      title: file.name.replace(/\.[^/.]+$/, ''),
                      prompt: 'Custom uploaded artwork design.',
                      imageUrl: reader.result,
                      niche: 'Custom Artwork',
                      createdAt: Date.now(),
                      placeholders: {},
                    };
                    onDesignGenerated(uploadedDesign);
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>

            {/* Instant Sample Preview Helper */}
            {currentPreset.sampleImage && (
              <div className="pt-1 text-center">
                <button
                  onClick={handleApplyPresetSample}
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-4 cursor-pointer"
                >
                  ⚡ Instant Load Sample Preset Artwork
                </button>
              </div>
            )}
          </div>

          {/* Active Design Canvas Showcase */}
          {activeDesign && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-400" />
                    Artwork Canvas
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">{activeDesign.title}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setLightboxOpen(true)}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                    title="View fullscreen"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDownloadImage(activeDesign)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-900/30 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {/* Artwork Container */}
              <div className="flex flex-col items-center justify-center p-4 bg-slate-950/80 rounded-xl border border-slate-800/80">
                <div className="relative w-full max-w-[320px] rounded-xl overflow-hidden shadow-2xl border border-slate-700/60 bg-black group">
                  <img
                    src={activeDesign.imageUrl}
                    alt={activeDesign.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-auto object-cover select-none"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4 gap-2">
                    <button
                      onClick={() => handleDownloadImage(activeDesign)}
                      className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Full Quality</span>
                    </button>
                    <button
                      onClick={() => handleGenerateDesign(Math.floor(Math.random() * 1000000000))}
                      className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Re-roll (New Seed)</span>
                    </button>
                  </div>
                </div>

                {/* Details Footer */}
                <div className="mt-3 w-full flex items-center justify-between text-[11px] text-slate-400 px-1">
                  <span>Aspect: {activeDesign.aspectRatio || '9:16'}</span>
                  {activeDesign.seed && <span>Seed: {activeDesign.seed}</span>}
                  <span className="text-emerald-400 font-medium">Free AI</span>
                </div>

                {onSendToMockup && (
                  <button
                    type="button"
                    onClick={() => onSendToMockup(activeDesign)}
                    className="mt-3 w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 transition cursor-pointer"
                  >
                    <span>Send Artwork to Lifestyle Mockup Pipeline</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* AI Analysis Feedback / Notification */}
          {analysisError && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800 text-xs text-rose-300 space-y-1">
              <p className="font-semibold text-rose-200">Analysis Notice</p>
              <p>{analysisError}</p>
            </div>
          )}

          {analysisSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <p>{analysisSuccess}</p>
            </div>
          )}

          {/* AI Analyzed Listing, Keywords & Tags Card */}
          {analyzedListing && (
            <div className="bg-slate-900/90 border border-indigo-500/40 rounded-2xl p-6 shadow-xl space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <h3 className="text-sm font-semibold text-white">
                    Design SEO Suite (Title, Keywords, Description &amp; 13 Tags)
                  </h3>
                </div>
                <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
                  Gemini Analyzed
                </span>
              </div>

              {/* Title Section */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Generated Etsy Title</label>
                  <span
                    className={`text-[11px] font-mono ${
                      (analyzedListing.productTitle?.length || 0) > 140
                        ? 'text-rose-400 font-bold'
                        : 'text-slate-400'
                    }`}
                  >
                    {analyzedListing.productTitle?.length || 0}/140 chars
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={analyzedListing.productTitle || ''}
                    className="w-full text-xs bg-slate-950 text-white rounded-lg p-2.5 border border-slate-700 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyText(analyzedListing.productTitle || '', 'title')}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {copiedSection === 'title' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedSection === 'title' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* 13 Etsy Search Tags Section */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    13 Search Tags ({analyzedListing.etsyTags?.length || 0}/13)
                  </label>
                  <button
                    type="button"
                    onClick={() => handleCopyText((analyzedListing.etsyTags || []).join(', '), 'tags')}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-medium"
                  >
                    {copiedSection === 'tags' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedSection === 'tags' ? 'Copied 13 Tags!' : 'Copy All 13 Tags'}</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  {(analyzedListing.etsyTags || []).map((tag: string, idx: number) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-950/60 border border-indigo-700/50 text-indigo-200 text-[11px] font-medium"
                    >
                      <span className="text-[9px] text-indigo-400 font-mono">#{idx + 1}</span>
                      <span>{tag}</span>
                      <span className="text-[9px] text-slate-500">({tag.length}c)</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Description Section */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    Customer Product Description
                  </label>
                  <button
                    type="button"
                    onClick={() => handleCopyText(analyzedListing.productDescription || '', 'desc')}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-medium"
                  >
                    {copiedSection === 'desc' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedSection === 'desc' ? 'Copied Description!' : 'Copy Description'}</span>
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={6}
                  value={analyzedListing.productDescription || ''}
                  className="w-full text-xs bg-slate-950 text-slate-200 rounded-lg p-2.5 border border-slate-700 font-sans leading-relaxed"
                />
              </div>

              {/* Primary & Long-tail Keywords */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs">
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Primary Keywords:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(analyzedListing.primaryKeywords || []).map((kw: string, i: number) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] border border-slate-700/50"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Long-Tail Keywords:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(analyzedListing.longTailKeywords || []).map((lkw: string, i: number) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] border border-slate-700/50"
                      >
                        {lkw}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Strategic Rationale & Style Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-[11px] text-slate-300">
                <div>
                  <span className="text-slate-500 block">Category:</span>
                  <span className="font-medium text-slate-200">{analyzedListing.category || 'Phone Cases'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Colors:</span>
                  <span className="font-medium text-slate-200">
                    {analyzedListing.primaryColor || 'Multi'} / {analyzedListing.secondaryColor || 'Vibrant'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Occasion:</span>
                  <span className="font-medium text-slate-200">{analyzedListing.occasion || 'Everyday'}</span>
                </div>
              </div>
            </div>
          )}

          {activeDesign && <EtsyListingGenerator design={activeDesign} designs={designs} />}

          {/* Session Design History */}
          {designs.length > 1 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-indigo-400" />
                  Session History ({designs.length})
                </h4>
                <span className="text-[11px] text-slate-500">Click to switch</span>
              </div>
              <div className="grid grid-cols-4 gap-2.5 max-h-48 overflow-y-auto pr-1">
                {designs.map((design, index) => {
                  const isActive = activeDesign?.id === design.id;
                  return (
                    <div
                      key={`${design.id}-${index}`}
                      className={`group relative rounded-lg overflow-hidden border cursor-pointer aspect-[9/16] bg-slate-950 ${
                        isActive
                          ? 'border-indigo-500 ring-2 ring-indigo-500/50'
                          : 'border-slate-800 hover:border-slate-700 opacity-80 hover:opacity-100'
                      }`}
                      onClick={() => onSelectDesign(design)}
                    >
                      <img
                        src={design.imageUrl}
                        alt={design.title}
                        className="w-full h-full object-cover select-none"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteDesign(design.id);
                        }}
                        className="absolute top-1 right-1 p-1 rounded bg-black/70 text-slate-400 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
                        title="Delete design"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && activeDesign && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-slate-800">
              <h3 className="font-semibold text-white text-sm">{activeDesign.title}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadImage(activeDesign)}
                  className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => setLightboxOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-auto max-h-[75vh] rounded-lg">
              <img
                src={activeDesign.imageUrl}
                alt={activeDesign.title}
                className="max-h-[75vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
