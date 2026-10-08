import React, { useState } from 'react';
import {
  Upload,
  FileCheck,
  Image as ImageIcon,
  CheckCircle2,
  Trash2,
  ArrowRight,
  FolderUp,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { UnifiedProductRecord } from '../types/unifiedWorkflow';
import { PRINTIFY_TEMPLATES } from '../data/printifyReferences';

interface DirectUploaderWorkspaceProps {
  product: UnifiedProductRecord;
  onUpdateProduct: (updated: UnifiedProductRecord) => void;
  onContinueToDrive: () => void;
  onStartNewProduct: () => void;
}

export const DirectUploaderWorkspace: React.FC<DirectUploaderWorkspaceProps> = ({
  product,
  onUpdateProduct,
  onContinueToDrive,
  onStartNewProduct,
}) => {
  const [dragActive, setDragActive] = useState(false);

  // Handle single design artwork upload
  const handleUploadDesign = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      
      // Clean up file name for human-readable titles (e.g. "stained_glass-fox.png" -> "Stained Glass Fox")
      const rawName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const cleanFileName = rawName
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      onUpdateProduct({
        ...product,
        designName: cleanFileName,
        design: {
          ...product.design,
          title: cleanFileName,
          localUrl: reader.result,
          fileId: '',
          fileUrl: '',
          verified: false,
        },
        listing: {
          ...product.listing,
          title: `${cleanFileName} Tough Case - Premium Protective Cover`,
          description: `This durable, premium protective tough phone case features your custom high-resolution design: "${cleanFileName}". Engineered with dual-layer armor, impact-resistant polycarbonate shell, and a secure shock-absorbing TPU liner. Clean premium quality wrap print. \n\nFeatures:\n- Sourced directly from original custom design: ${cleanFileName}\n- Double-layer protection (tough polycarbonate exterior, impact-absorbent inner liner)\n- Perfect port alignments with precise responsive buttons\n- Designed for long-lasting vibrant color durability`,
        },
      });
    };
    reader.readAsDataURL(file);
  };

  // Process a list of mockup files
  const processMockupFiles = async (files: File[]) => {
    const readFiles = await Promise.all(
      files.slice(0, 6).map((file) => {
        return new Promise<{ name: string; url: string }>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, url: reader.result as string });
          reader.readAsDataURL(file);
        });
      })
    );

    let updatedMockups = [...product.mockups];
    const templates = PRINTIFY_TEMPLATES;

    readFiles.forEach((item, index) => {
      // Find an appropriate model template or fallback
      const reference = templates[index] || templates[0];
      const modelId = reference.id;
      const modelName = reference.modelName;

      // Assign to the specific mockup slots (0 to 5)
      const slotIndex = index;

      const newMockupItem = {
        slotIndex,
        modelId,
        modelName,
        sceneTitle: `${modelName} custom mockup`,
        localUrl: item.url,
        fileId: '',
        fileUrl: '',
        status: 'generated' as const,
      };

      // Replace if slot already occupied or add new
      updatedMockups = updatedMockups.filter((m) => m.slotIndex !== slotIndex);
      updatedMockups.push(newMockupItem);
    });

    updatedMockups.sort((a, b) => a.slotIndex - b.slotIndex);

    const activeModelNames = updatedMockups.map((m) => m.modelName);

    onUpdateProduct({
      ...product,
      mockups: updatedMockups,
      printify: {
        ...product.printify,
        selectedModels: activeModelNames,
      },
    });
  };

  // Handle multiple mockup files upload
  const handleUploadMockups = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processMockupFiles(Array.from(e.target.files));
    }
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processMockupFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Remove a mockup from a specific slot
  const handleRemoveMockup = (slotIndex: number) => {
    const updatedMockups = product.mockups.filter((m) => m.slotIndex !== slotIndex);
    const activeModelNames = updatedMockups.map((m) => m.modelName);
    onUpdateProduct({
      ...product,
      mockups: updatedMockups,
      printify: {
        ...product.printify,
        selectedModels: activeModelNames,
      },
    });
  };

  // Clear all mockups
  const handleClearAllMockups = () => {
    onUpdateProduct({
      ...product,
      mockups: [],
      printify: {
        ...product.printify,
        selectedModels: [],
      },
    });
  };

  const hasDesign = Boolean(product.design.localUrl);
  const mockupsCount = product.mockups.length;

  return (
    <div className="space-y-6">
      {/* Overview Intro Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-950/80 px-2.5 py-0.5 rounded border border-indigo-800/60">
              Direct Asset Uploader
            </span>
            <h2 className="text-xl font-bold text-white mt-1.5">Upload Your Own Original Design &amp; Finished Mockups</h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Bypass AI prompt building and image generation models. Drop your completed case artwork and up to 6 custom mockup images below to instantly feed your Google Drive storage and Sheets publishing pipelines.
            </p>
          </div>

          <button
            type="button"
            onClick={onStartNewProduct}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:text-white transition cursor-pointer"
          >
            Reset / New Product ID
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Artwork Upload Card (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2.5">
              <FileCheck className="w-4 h-4 text-indigo-400" />
              1. Original 2D Case Design Artwork
            </h3>

            {hasDesign ? (
              <div className="space-y-3">
                <div className="aspect-[3/4] max-w-[240px] mx-auto rounded-xl overflow-hidden border border-slate-700 bg-black shadow-2xl relative group">
                  <img
                    src={product.design.localUrl}
                    alt={product.design.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <label className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer">
                      <span>Replace Design</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadDesign}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/80 text-xs text-slate-300 space-y-1">
                  <p className="font-semibold text-white">Title: {product.design.title}</p>
                  <p className="text-slate-400 text-[11px] truncate">Width-to-Height: 9:16 aspect ratio</p>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl bg-slate-950/50 hover:bg-indigo-950/10 transition duration-200 cursor-pointer text-center">
                <Upload className="w-8 h-8 text-slate-500 mb-2" />
                <span className="text-xs font-bold text-slate-300">Upload Original Case Art</span>
                <span className="text-[10px] text-slate-500 mt-1">PNG, JPG, or WebP</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadDesign}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <div className="text-[10px] text-slate-500 leading-relaxed bg-slate-950/50 p-2.5 rounded-lg">
            Note: This artwork will be uploaded to your Google Drive <code>Design/</code> canonical folder in Step 3.
          </div>
        </div>

        {/* Right Column: Multiple Mockups Drag & Drop Zone (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-sky-400" />
                2. Finished Mockup Images (Upload Up to 6)
              </h3>

              {mockupsCount > 0 && (
                <button
                  onClick={handleClearAllMockups}
                  className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Drag & Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl transition duration-200 text-center ${
                dragActive
                  ? 'border-sky-500 bg-sky-950/20 text-sky-300'
                  : 'border-slate-800 bg-slate-950/50 hover:bg-slate-950/80 hover:border-slate-700 text-slate-400'
              }`}
            >
              <Upload className="w-10 h-10 text-sky-400 mb-2.5" />
              <p className="text-xs font-bold text-white">Drag &amp; Drop Multiple Mockup Files Here</p>
              <p className="text-[10px] text-slate-500 mt-1 max-w-xs">
                Or click below to browse. You can upload up to 6 custom mockup images at the same time.
              </p>

              <label className="mt-4 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md shadow-sky-950 transition cursor-pointer">
                <span>Browse Mockup Files</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleUploadMockups}
                  className="hidden"
                />
              </label>
            </div>

            {/* Grid display of uploaded mockups */}
            {mockupsCount > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Uploaded Mockups ({mockupsCount} of 6)
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {Array.from({ length: 6 }).map((_, idx) => {
                    const item = product.mockups.find((m) => m.slotIndex === idx);
                    return (
                      <div
                        key={idx}
                        className={`aspect-3/4 rounded-lg border overflow-hidden bg-slate-950 relative flex flex-col justify-between group ${
                          item ? 'border-sky-500/50' : 'border-slate-800/80 border-dashed'
                        }`}
                      >
                        {item && item.localUrl ? (
                          <>
                            <img
                              src={item.localUrl}
                              alt={item.modelName}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-1 left-1 bg-slate-950/80 rounded px-1 text-[8px] text-sky-400 border border-slate-800 font-bold">
                              Slot {idx + 1}
                            </div>
                            <button
                              onClick={() => handleRemoveMockup(idx)}
                              className="absolute bottom-1 right-1 p-1 rounded bg-black/80 text-slate-400 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center">
                            <span className="text-[9px] font-bold text-slate-600">Slot {idx + 1}</span>
                            <span className="text-[8px] text-slate-700 mt-0.5">Empty</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="text-[10px] text-slate-500 bg-slate-950/50 p-2.5 rounded-lg">
            Note: These mockup files will automatically map to your Google Drive <code>Mockups/</code> directory during Step 3.
          </div>
        </div>
      </div>

      {/* Continuation Action Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            {hasDesign && mockupsCount > 0
              ? 'Artwork design and mockup files are uploaded and synced! Ready to proceed.'
              : 'Please upload at least 1 design and 1 mockup image to unlock canonical automation.'}
          </span>
        </div>

        <button
          type="button"
          disabled={!hasDesign || mockupsCount === 0}
          onClick={onContinueToDrive}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-xs font-semibold text-white transition shadow-md shadow-indigo-950 cursor-pointer"
        >
          <span>Proceed to Google Drive Storage</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
