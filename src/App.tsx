import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import JSZip from 'jszip';
import { WorkflowNav } from './components/WorkflowNav';
import { DesignStudio } from './design-studio/components/DesignStudio';
import { WorkflowStudio } from './components/WorkflowStudio';
import { DriveAssetManager } from './components/DriveAssetManager';
import { ListingWorkspace } from './components/ListingWorkspace';
import { SheetsExportWorkspace } from './components/SheetsExportWorkspace';
import { PinterestCsvWorkspace } from './components/PinterestCsvWorkspace';
import { GoogleAuthModal } from './components/GoogleAuthModal';
import { PrintifyPublishPanel } from './components/PrintifyPublishPanel';
import { PrintifyKeyModal } from './components/PrintifyKeyModal';
import { getStoredPrintifyToken } from './services/printifyClient';
import { DirectUploaderWorkspace } from './components/DirectUploaderWorkspace';
import { ExcelPrintifyImporter } from './components/ExcelPrintifyImporter';
import { GeneratedDesign } from './design-studio/types';
import { PRINTIFY_TEMPLATES } from './data/printifyReferences';
import {
  ProductWorkflowStep,
  UnifiedProductRecord,
} from './types/unifiedWorkflow';
import { GeneratedWorkflowMockup, MockupWorkflowState } from './types';
import {
  createInitialProductRecord,
  saveProductRecord,
  loadStoredProducts,
} from './services/productWorkflowManager';
import {
  connectGoogleDriveAndSheets,
  DEFAULT_GOOGLE_CLIENT_ID,
  getStoredGoogleSession,
  clearGoogleSession,
} from './services/unifiedGoogleService';

const GOOGLE_CLIENT_ID = DEFAULT_GOOGLE_CLIENT_ID;

export const INITIAL_VITRAIL_DESIGN: GeneratedDesign = {
  id: 'preset-sample-vitrail-01',
  title: 'Woodland Fox & Sunburst (Stained Glass)',
  prompt: `Masterpiece authentic cathedral stained glass window (vitrail), symmetrical arched vertical composition.

In the center, a peaceful sleeping red fox curled in a tight circle with fluffy tail wrapped around its body.

Directly behind the subject is a radiant segmented sunburst halo with glowing amber and golden glass rays, with a golden crescent moon and twinkling stars in the upper arch.

Framed and grounded along the base and sides by red fly agaric mushrooms with white dots, golden chanterelles, acorns, autumn oak leaves, forest berries, and woodland fern fronds, and accompanied by subtle glowing woodland sprites and tiny sleeping dormice tucked among the leaves.

Rich translucent jewel-tone color palette of warm amber gold, fiery autumn orange, deep russet red, forest moss green, deep teal indigo, and dark leaded came metallic outlines.

Enclosed within an intricate Art Nouveau cathedral arched stained-glass frame with curving leadline came tracery, amber glass cabochons, and decorative border tiles.

Authentic leaded came solder outlines, segmented colored glass panes, translucent backlit stained glass radiance, Louis Comfort Tiffany stained glass style, fine Art Nouveau botanical tracery, subtle glass textures and beveled leadlines.

Pure 2D flat-lay graphic art print, vertical 9:16 aspect ratio, clean full-bleed decorative art piece, sharp fine details, high-end collector print.

Do not include: phone, phone case, mockup, device, realistic photography, 3D render, modern clutter, shadows.`,
  imageUrl: '/src/assets/images/sample_vitrail_pure2d_1790462384613.jpg',
  niche: 'Woodland Fox & Sunburst (Stained Glass)',
  createdAt: Date.now(),
  placeholders: {
    SUBJECT_POSE:
      'a peaceful sleeping red fox curled in a tight circle with fluffy tail wrapped around its body',
    HALO_BACKGROUND:
      'a radiant segmented sunburst halo with glowing amber and golden glass rays, with a golden crescent moon and twinkling stars in the upper arch',
    BOTANICAL:
      'red fly agaric mushrooms with white dots, golden chanterelles, acorns, autumn oak leaves, forest berries, and woodland fern fronds',
    COMPANION:
      'subtle glowing woodland sprites and tiny sleeping dormice tucked among the leaves',
    COLOR_PALETTE:
      'warm amber gold, fiery autumn orange, deep russet red, forest moss green, deep teal indigo, and dark leaded came metallic outlines',
    BORDER_THEME:
      'Art Nouveau cathedral arched stained-glass frame with curving leadline came tracery, amber glass cabochons, and decorative border tiles',
  },
  isPreset: true,
  aspectRatio: '9:16',
};

const generateCaseScene = async (
  artworkImageUrl: string,
  sceneDescription: string,
  referenceId: string,
  variationIndex: number,
  productMockupUrl?: string,
  sceneReferenceImageUrls: string[] = []
) => {
  const reference = PRINTIFY_TEMPLATES.find((item) => item.id === referenceId);
  if (!reference) throw new Error('The selected Printify model is unavailable.');

  const featureDescription = [
    reference.caseFeatures.toughBumper ? 'reinforced tough bumper' : '',
    reference.caseFeatures.raisedBezel ? 'raised protective bezel' : '',
    reference.caseFeatures.wrapBleed ? 'full-bleed wrap print' : '',
  ].filter(Boolean).join(', ');

  const response = await fetch('/api/generate-lifestyle-scene', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      designImageUrl: artworkImageUrl,
      productMockupUrl,
      sceneReferenceImages: sceneReferenceImageUrls,
      userScenePrompt: sceneDescription,
      styleDirection: `Maintain this shared visual theme while making this case's composition distinct. Variation ${variationIndex}: vary camera angle, phone placement, lighting, environment, and props.`,
      modelName: reference.modelName,
      brand: reference.brand,
      dimensions: reference.dimensions,
      cameraCutoutDesc: `${reference.cameraCutout.description}; ${reference.cameraCutout.position}; ${reference.cameraCutout.cornerCurvature} corners`,
      caseShapeDesc: `${reference.dimensions.mmWidth}mm x ${reference.dimensions.mmHeight}mm case, ${reference.cameraCutout.aspectRatio.toFixed(4)} width-to-height ratio, ${reference.cameraCutout.cornerCurvature} corner curvature; ${featureDescription}`,
      variationIndex,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as { imageUrl?: string; error?: string };
  if (!response.ok || !data.imageUrl) throw new Error(data.error || `Failed to generate ${reference.modelName}.`);
  return { reference, imageUrl: data.imageUrl };
};

export default function App() {
  // 1. Unified Pipeline Step: design -> mockup -> drive -> listing -> export
  const [pipelineStep, setPipelineStep] = useState<ProductWorkflowStep>('design');

  // 2. Centralized Product Record State
  const [product, setProduct] = useState<UnifiedProductRecord>(() => {
    return createInitialProductRecord(
      INITIAL_VITRAIL_DESIGN.title,
      INITIAL_VITRAIL_DESIGN.prompt,
      INITIAL_VITRAIL_DESIGN.imageUrl
    );
  });

  // 3. Google OAuth & Drive Authentication State (persisted across sessions)
  const [googleToken, setGoogleToken] = useState<string | null>(() => getStoredGoogleSession().token);
  const [googleEmail, setGoogleEmail] = useState<string>(() => getStoredGoogleSession().email);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [isPrintifyKeyModalOpen, setIsPrintifyKeyModalOpen] = useState(false);
  const [isDownloadingAssets, setIsDownloadingAssets] = useState(false);
  const [assetDownloadError, setAssetDownloadError] = useState<string | null>(null);

  // Auto-verify and restore Google auth on reload
  useEffect(() => {
    const session = getStoredGoogleSession();
    if (session.token && session.email && !googleToken) {
      setGoogleToken(session.token);
      setGoogleEmail(session.email);
    }
  }, []);

  // Workflow products cache for Pinterest & global export
  const [workflowProducts, setWorkflowProducts] = useState<Record<string, UnifiedProductRecord>>({});

  useEffect(() => {
    setWorkflowProducts(loadStoredProducts());
  }, [product]);

  // 4. Design Studio State (Preserved)
  const [designs, setDesigns] = useState<GeneratedDesign[]>([INITIAL_VITRAIL_DESIGN]);
  const [activeDesign, setActiveDesign] = useState<GeneratedDesign | null>(INITIAL_VITRAIL_DESIGN);

  // 5. Mockup Studio Workflow State (Preserved)
  const [mockupWorkflow, setMockupWorkflow] = useState<MockupWorkflowState>({
    activeStep: 'upload-design',
    artwork: {
      fileName: 'woodland-fox-stained-glass.jpg',
      imageUrl: INITIAL_VITRAIL_DESIGN.imageUrl,
    },
    productReferenceIds: ['iphone-15-pro-max', 'iphone-15-pro', 'samsung-galaxy-s24-ultra'],
    productReferenceImages: {},
    sceneReferenceImages: [],
    sceneDescription:
      'Artisanal coffee shop wooden table, latte cup and notebook beside smartphone resting at a slight angle showcasing the case artwork',
    generatedMockups: [],
    generatedImageUrl: null,
    isGenerating: false,
    generationProgress: null,
    generationError: null,
  });

  // Save product record whenever updated
  const handleUpdateProduct = (updated: UnifiedProductRecord) => {
    setProduct(updated);
    saveProductRecord(updated);
  };

  // Google OAuth flow
  const handleConnectGoogle = async (customClientId?: unknown, customScope?: unknown) => {
    setGoogleAuthError(null);
    const resolvedClientId =
      typeof customClientId === 'string' && customClientId.trim() && !customClientId.includes('[object')
        ? customClientId.trim()
        : GOOGLE_CLIENT_ID;
    const resolvedScope =
      typeof customScope === 'string' && customScope.trim()
        ? customScope.trim()
        : undefined;

    try {
      const res = await connectGoogleDriveAndSheets(resolvedClientId, resolvedScope);
      setGoogleToken(res.token);
      setGoogleEmail(res.email);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('closed') || msg.includes('cancelled') || msg.includes('popup')) {
        console.log('Google authorization prompt was closed or cancelled by user.');
        setGoogleAuthError('Sign-in cancelled. You can retry whenever you are ready.');
        return;
      }
      console.warn('Google OAuth notice:', err);
      setGoogleAuthError(err.message || 'Google authorization failed.');
    }
  };

  const handleDisconnectGoogle = () => {
    clearGoogleSession();
    setGoogleToken(null);
    setGoogleEmail('');
  };

  // When a design is generated in Design Studio, update the centralized product design
  const handleDesignGenerated = (newDesign: GeneratedDesign, listingData?: any) => {
    setDesigns((prev) => {
      const filtered = prev.filter((d) => d.id !== newDesign.id);
      return [newDesign, ...filtered];
    });
    setActiveDesign(newDesign);

    // Keep product record connected
    const updated: UnifiedProductRecord = {
      ...product,
      designName: newDesign.title,
      design: {
        ...product.design,
        id: newDesign.id,
        title: newDesign.title,
        prompt: newDesign.prompt,
        localUrl: newDesign.imageUrl,
        sourceUrl: newDesign.sourceUrl,
        niche: newDesign.niche,
        aspectRatio: newDesign.aspectRatio,
        // Reset Drive file ID if design changed so it gets uploaded fresh
        fileId: '',
        fileUrl: '',
        verified: false,
      },
      product: {
        ...product.product,
        sku: product.productId,
      },
      listing: listingData
        ? {
            title: listingData.productTitle || product.listing.title || `${newDesign.title} Tough Phone Case`,
            description: listingData.productDescription || product.listing.description,
            tags: Array.isArray(listingData.etsyTags) ? listingData.etsyTags.slice(0, 13) : product.listing.tags,
            category: listingData.category || product.listing.category,
            primaryColor: listingData.primaryColor || product.listing.primaryColor,
            secondaryColor: listingData.secondaryColor || product.listing.secondaryColor,
            style: Array.isArray(listingData.designStyle)
              ? listingData.designStyle.join(', ')
              : (listingData.designStyle || product.listing.style),
            occasion: listingData.occasion || product.listing.occasion,
            recipient: Array.isArray(listingData.targetCustomer)
              ? listingData.targetCustomer.join(', ')
              : (listingData.targetCustomer || product.listing.recipient),
            primaryKeywords: listingData.primaryKeywords || product.listing.primaryKeywords,
            longTailKeywords: listingData.longTailKeywords || product.listing.longTailKeywords,
            searchIntent: listingData.searchIntent || product.listing.searchIntent,
            keywordRationale: listingData.keywordRationale || product.listing.keywordRationale,
          }
        : product.listing,
    };
    handleUpdateProduct(updated);

    // Also update Mockup Studio artwork automatically!
    setMockupWorkflow((prev) => ({
      ...prev,
      artwork: {
        fileName: `${newDesign.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`,
        imageUrl: newDesign.imageUrl,
      },
    }));
  };

  const handleSelectDesign = (selected: GeneratedDesign) => {
    setActiveDesign(selected);

    // Sync to product record
    const updated: UnifiedProductRecord = {
      ...product,
      designName: selected.title,
      design: {
        ...product.design,
        id: selected.id,
        title: selected.title,
        prompt: selected.prompt,
        localUrl: selected.imageUrl,
        sourceUrl: selected.sourceUrl,
        niche: selected.niche,
        aspectRatio: selected.aspectRatio,
      },
    };
    handleUpdateProduct(updated);

    // Sync to Mockup Studio
    setMockupWorkflow((prev) => ({
      ...prev,
      artwork: {
        fileName: `${selected.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`,
        imageUrl: selected.imageUrl,
      },
    }));
  };

  const handleDeleteDesign = (id: string) => {
    setDesigns((prev) => {
      const filtered = prev.filter((d) => d.id !== id);
      if (activeDesign?.id === id) {
        setActiveDesign(filtered.length > 0 ? filtered[0] : null);
      }
      return filtered;
    });
  };

  // Action button to send design directly to Mockup Generation step
  const handleSendDesignToMockup = (design: GeneratedDesign) => {
    handleSelectDesign(design);
    setPipelineStep('mockup');
  };

  // Mockup Studio Handlers
  const handleUploadArtwork = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const imageUrl = reader.result as string;
      setMockupWorkflow((current) => ({
        ...current,
        artwork: { fileName: file.name, imageUrl },
        generatedMockups: [],
        generatedImageUrl: null,
        generationError: null,
      }));

      // Update product record
      handleUpdateProduct({
        ...product,
        design: {
          ...product.design,
          title: file.name.replace(/\.[^/.]+$/, ''),
          localUrl: imageUrl,
          fileId: '',
          fileUrl: '',
          verified: false,
        },
      });
    };
    reader.readAsDataURL(file);
  };

  const handleUploadProductReference = (modelId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setMockupWorkflow((current) => ({
        ...current,
        productReferenceImages: {
          ...current.productReferenceImages,
          [modelId]: { fileName: file.name, imageUrl: reader.result as string },
        },
        generatedMockups: [],
        generatedImageUrl: null,
        generationError: null,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSceneReference = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setMockupWorkflow((current) => ({
        ...current,
        sceneReferenceImages: [
          ...current.sceneReferenceImages,
          { id: crypto.randomUUID(), fileName: file.name, imageUrl: reader.result as string },
        ],
        generatedMockups: [],
        generatedImageUrl: null,
        generationError: null,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateMockups = async () => {
    const request = mockupWorkflow;
    if (
      !request.artwork ||
      request.productReferenceIds.length === 0 ||
      !request.sceneDescription.trim()
    ) {
      setMockupWorkflow((current) => ({
        ...current,
        generationError: 'Upload artwork, select at least one case model, and describe the scene.',
      }));
      return;
    }

    const references = request.productReferenceIds
      .map((id) => PRINTIFY_TEMPLATES.find((reference) => reference.id === id))
      .filter((reference) => reference !== undefined);

    const generatedMockups: GeneratedWorkflowMockup[] = references.map((reference) => ({
      modelId: reference.id,
      modelName: reference.modelName,
      sceneTitle: `${reference.modelName} scene`,
      prompt: request.sceneDescription,
      imageUrl: null,
      status: 'generating',
    }));

    setMockupWorkflow((current) => ({
      ...current,
      generatedMockups,
      generatedImageUrl: null,
      isGenerating: true,
      generationProgress: `Preparing ${references.length} case scenes...`,
      generationError: null,
    }));

    try {
      for (const [index, reference] of references.entries()) {
        setMockupWorkflow((current) => ({
          ...current,
          generationProgress: `Generating ${reference.modelName} scene (${index + 1} of ${references.length})...`,
        }));

        try {
          const { imageUrl } = await generateCaseScene(
            request.artwork.imageUrl,
            request.sceneDescription,
            reference.id,
            index + 1,
            request.productReferenceImages[reference.id]?.imageUrl,
            request.sceneReferenceImages.map((image) => image.imageUrl)
          );

          generatedMockups[index] = {
            ...generatedMockups[index],
            imageUrl,
            status: 'generated',
          };
        } catch (error) {
          generatedMockups[index] = {
            ...generatedMockups[index],
            status: 'failed',
            error: error instanceof Error ? error.message : 'Scene generation failed.',
          };
        }

        setMockupWorkflow((current) => ({ ...current, generatedMockups: [...generatedMockups] }));
      }

      setMockupWorkflow((current) => ({
        ...current,
        activeStep: 'preview-result',
        generatedMockups,
        generatedImageUrl: generatedMockups.find((m) => m.imageUrl)?.imageUrl ?? null,
        isGenerating: false,
        generationProgress: null,
      }));

      // Synchronize generated mockups into centralized product model slots (0..5)
      const successfulMockups = generatedMockups
        .filter((m) => m.imageUrl)
        .slice(0, 6)
        .map((m, slotIndex) => {
          // Check if product already has an existing Drive fileId for this slot
          const existingSlot = product.mockups.find((item) => item.slotIndex === slotIndex);
          return {
            slotIndex,
            modelId: m.modelId,
            modelName: m.modelName,
            sceneTitle: m.sceneTitle,
            prompt: m.prompt,
            localUrl: m.imageUrl,
            fileId: existingSlot?.fileId || '',
            fileUrl: existingSlot?.fileUrl || '',
            verified: Boolean(existingSlot?.fileId),
            status: 'generated' as const,
          };
        });

      const updatedProduct: UnifiedProductRecord = {
        ...product,
        mockups: successfulMockups,
        printify: {
          ...product.printify,
          selectedModels: references.map((r) => r.modelName),
        },
      };
      handleUpdateProduct(updatedProduct);
    } catch (err: any) {
      setMockupWorkflow((current) => ({
        ...current,
        isGenerating: false,
        generationProgress: null,
        generationError: err.message || 'Mockup generation failed.',
      }));
    }
  };

  const handleRegenerateMockup = async (modelId: string) => {
    if (!mockupWorkflow.artwork) return;
    const index = mockupWorkflow.generatedMockups.findIndex((item) => item.modelId === modelId);
    if (index < 0) return;

    setMockupWorkflow((current) => ({
      ...current,
      generatedMockups: current.generatedMockups.map((item) =>
        item.modelId === modelId ? { ...item, status: 'generating', error: undefined } : item
      ),
    }));

    try {
      const { imageUrl } = await generateCaseScene(
        mockupWorkflow.artwork.imageUrl,
        mockupWorkflow.sceneDescription,
        modelId,
        index + 1,
        mockupWorkflow.productReferenceImages[modelId]?.imageUrl,
        mockupWorkflow.sceneReferenceImages.map((image) => image.imageUrl)
      );

      setMockupWorkflow((current) => ({
        ...current,
        generatedMockups: current.generatedMockups.map((item) =>
          item.modelId === modelId ? { ...item, imageUrl, status: 'generated', error: undefined } : item
        ),
        generatedImageUrl: imageUrl,
      }));

      // Update specific mockup slot in product record
      const updatedMockups = product.mockups.map((m) =>
        m.modelId === modelId
          ? {
              ...m,
              localUrl: imageUrl,
              fileId: '', // Reset drive fileId so it gets re-uploaded
              fileUrl: '',
              verified: false,
              status: 'generated' as const,
            }
          : m
      );
      handleUpdateProduct({ ...product, mockups: updatedMockups });
    } catch (error) {
      setMockupWorkflow((current) => ({
        ...current,
        generatedMockups: current.generatedMockups.map((item) =>
          item.modelId === modelId
            ? { ...item, status: 'failed', error: error instanceof Error ? error.message : 'Scene generation failed.' }
            : item
        ),
      }));
    }
  };

  const handleUploadFinishedMockup = (modelId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const imageUrl = reader.result;

      // Find if we already have this mockup in the mockup slots
      // If not, find the first empty slot index (0..5)
      let slotIndex = product.mockups.findIndex((m) => m.modelId === modelId);
      if (slotIndex === -1) {
        // Find first unoccupied slotIndex (0..5)
        const occupiedSlots = product.mockups.map((m) => m.slotIndex);
        slotIndex = [0, 1, 2, 3, 4, 5].find((idx) => !occupiedSlots.includes(idx)) ?? 0;
      }

      const reference = PRINTIFY_TEMPLATES.find((r) => r.id === modelId);
      const modelName = reference?.modelName || modelId;

      const newMockupItem = {
        slotIndex,
        modelId,
        modelName,
        sceneTitle: `${modelName} custom mockup`,
        localUrl: imageUrl,
        fileId: '',
        fileUrl: '',
        status: 'generated' as const,
      };

      const updatedMockups = product.mockups.filter((m) => m.modelId !== modelId);
      updatedMockups.push(newMockupItem);
      updatedMockups.sort((a, b) => a.slotIndex - b.slotIndex);

      handleUpdateProduct({
        ...product,
        mockups: updatedMockups,
        printify: {
          ...product.printify,
          selectedModels: Array.from(new Set([...product.printify.selectedModels, modelName])),
        },
      });

      // Also update Mockup Studio state so it displays in preview!
      setMockupWorkflow((prev) => {
        const existing = prev.generatedMockups.filter((m) => m.modelId !== modelId);
        existing.push({
          modelId,
          modelName,
          sceneTitle: `${modelName} custom mockup`,
          prompt: 'Custom uploaded mockup',
          imageUrl,
          status: 'generated',
        });
        const activeIds = prev.productReferenceIds.includes(modelId)
          ? prev.productReferenceIds
          : [...prev.productReferenceIds, modelId];
        return {
          ...prev,
          productReferenceIds: activeIds,
          generatedMockups: existing,
          generatedImageUrl: imageUrl,
        };
      });
    };
    reader.readAsDataURL(file);
  };

  const handleUploadMultipleFinishedMockups = async (files: File[]) => {
    // Read all files as base64 URLs
    const readFiles = await Promise.all(
      files.map((file) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      })
    );

    // Get selected models
    const selectedIds = [...mockupWorkflow.productReferenceIds];
    
    // If no models are selected, or we have more files than selected models,
    // let's ensure we have enough models selected to match the files!
    if (selectedIds.length < files.length) {
      const unselectedTemplates = PRINTIFY_TEMPLATES.filter((t) => !selectedIds.includes(t.id));
      const extraNeededCount = files.length - selectedIds.length;
      const extraIds = unselectedTemplates.slice(0, extraNeededCount).map((t) => t.id);
      selectedIds.push(...extraIds);
    }

    // Now update product mockups and mockupWorkflow state!
    let updatedMockups = [...product.mockups];
    const generatedMockups = [...mockupWorkflow.generatedMockups];

    readFiles.forEach((imageUrl, index) => {
      const modelId = selectedIds[index] || `custom-model-${index + 1}`;
      const reference = PRINTIFY_TEMPLATES.find((r) => r.id === modelId);
      const modelName = reference?.modelName || `Model ${index + 1}`;

      // Slot Index
      let slotIndex = updatedMockups.findIndex((m) => m.modelId === modelId);
      if (slotIndex === -1) {
        const occupiedSlots = updatedMockups.map((m) => m.slotIndex);
        slotIndex = [0, 1, 2, 3, 4, 5].find((idx) => !occupiedSlots.includes(idx)) ?? 0;
      }

      const newMockupItem = {
        slotIndex,
        modelId,
        modelName,
        sceneTitle: `${modelName} custom mockup`,
        localUrl: imageUrl,
        fileId: '',
        fileUrl: '',
        status: 'generated' as const,
      };

      // Filter out any existing mockup in this slot or modelId
      updatedMockups = updatedMockups.filter((m) => m.modelId !== modelId && m.slotIndex !== slotIndex);
      updatedMockups.push(newMockupItem);

      // Update mockupWorkflow.generatedMockups list
      const genIndex = generatedMockups.findIndex((m) => m.modelId === modelId);
      const newGenItem = {
        modelId,
        modelName,
        sceneTitle: `${modelName} custom mockup`,
        prompt: 'Custom uploaded mockup',
        imageUrl,
        status: 'generated' as const,
      };
      if (genIndex > -1) {
        generatedMockups[genIndex] = newGenItem;
      } else {
        generatedMockups.push(newGenItem);
      }
    });

    updatedMockups.sort((a, b) => a.slotIndex - b.slotIndex);

    // Get names of all selected models to store in printify specs
    const selectedModelNames = selectedIds.map(id => PRINTIFY_TEMPLATES.find(r => r.id === id)?.modelName || id);

    handleUpdateProduct({
      ...product,
      mockups: updatedMockups,
      printify: {
        ...product.printify,
        selectedModels: selectedModelNames,
      },
    });

    setMockupWorkflow((prev) => ({
      ...prev,
      productReferenceIds: selectedIds,
      generatedMockups,
      generatedImageUrl: readFiles[0] || prev.generatedImageUrl,
    }));
  };

  // Start a fresh product with new sequential Product ID
  const handleStartNewProduct = () => {
    const nextProduct = createInitialProductRecord(
      activeDesign?.title || 'New Phone Case Art',
      activeDesign?.prompt || '',
      activeDesign?.imageUrl || ''
    );
    setProduct(nextProduct);
    saveProductRecord(nextProduct);
    setPipelineStep('design');
  };

  const handleDownloadDesignAndMockups = async () => {
    const designUrl = activeDesign?.imageUrl || product.design.localUrl;
    const generatedMockups = mockupWorkflow.generatedMockups
      .filter((mockup) => mockup.imageUrl)
      .map((mockup) => ({ name: mockup.modelName, imageUrl: mockup.imageUrl as string }));
    const savedMockups = product.mockups
      .filter((mockup) => mockup.localUrl)
      .map((mockup) => ({ name: mockup.modelName, imageUrl: mockup.localUrl as string }));
    const mockups = generatedMockups.length > 0 ? generatedMockups : savedMockups;

    if (!designUrl || mockups.length === 0) return;

    setIsDownloadingAssets(true);
    setAssetDownloadError(null);

    try {
      const zip = new JSZip();
      const safeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image';
      const addImage = async (folder: string, name: string, imageUrl: string) => {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Could not download ${name} (${response.status}).`);
        const image = await response.blob();
        if (!image.type.startsWith('image/')) throw new Error(`${name} is not a valid image file.`);
        const extension = image.type.includes('jpeg') ? 'jpg' : image.type.split('/')[1] || 'png';
        zip.file(`${folder}/${safeName(name)}.${extension}`, image);
      };

      const designName = activeDesign?.title || product.design.title || 'design';
      await addImage('design', designName, designUrl);
      await Promise.all(
        mockups.map((mockup, index) =>
          addImage('mockups', `${String(index + 1).padStart(2, '0')}-${mockup.name}`, mockup.imageUrl),
        ),
      );
      zip.file('product-info.json', JSON.stringify({
        productId: product.productId,
        design: designName,
        mockups: mockups.map((mockup) => mockup.name),
        exportedAt: new Date().toISOString(),
      }, null, 2));

      const archive = await zip.generateAsync({ type: 'blob' });
      const archiveUrl = URL.createObjectURL(archive);
      const link = document.createElement('a');
      link.href = archiveUrl;
      link.download = `${safeName(product.productId)}-design-and-mockups.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(archiveUrl), 30_000);
    } catch (error) {
      console.error('Could not prepare design and mockup downloads:', error);
      setAssetDownloadError(error instanceof Error ? error.message : 'Could not prepare the asset download.');
    } finally {
      setIsDownloadingAssets(false);
    }
  };

  const hasDownloadableMockups = mockupWorkflow.generatedMockups.some((mockup) => mockup.imageUrl) ||
    product.mockups.some((mockup) => mockup.localUrl);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Unified 5-Stage Pipeline Header */}
      <WorkflowNav
        currentStep={pipelineStep}
        onSelectStep={setPipelineStep}
        productId={product.productId}
        hasDesign={Boolean(product.design.localUrl)}
        mockupsCount={product.mockups.length}
        hasDriveAssets={Boolean(product.design.fileId && product.mockups.some((m) => m.fileId))}
        hasListing={Boolean(product.listing.title && product.listing.description)}
        isReadyForExport={Boolean(
          product.design.fileId &&
            product.mockups.length > 0 &&
            product.mockups.every((m) => m.fileId) &&
            product.listing.title &&
            product.listing.tags.filter((t) => t.trim()).length === 13
        )}
        printifyCreated={Boolean(product.automation.printifyProductId)}
        printifyConnected={Boolean(getStoredPrintifyToken())}
        onOpenPrintifyKeyModal={() => setIsPrintifyKeyModalOpen(true)}
        googleConnected={Boolean(googleToken)}
        googleEmail={googleEmail}
        onConnectGoogle={() => handleConnectGoogle()}
        onOpenGoogleSettings={() => setIsGoogleModalOpen(true)}
      />

      {/* Main View Area Rendered by Pipeline Step */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Step 1: Design Generation */}
        {pipelineStep === 'design' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h1 className="text-xl font-bold text-white sm:text-2xl">
                  Step 1: Design Generation & Prompt Customization
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Design custom 2D artwork for Product <span className="font-mono text-indigo-300 font-semibold">{product.productId}</span> with dynamic niche placeholders.
                </p>
              </div>
            </div>

            <DesignStudio
              activeDesign={activeDesign}
              designs={designs}
              onSelectDesign={handleSelectDesign}
              onDeleteDesign={handleDeleteDesign}
              onDesignGenerated={handleDesignGenerated}
              onSendToMockup={handleSendDesignToMockup}
            />
          </div>
        )}

        {/* Step 2: Mockup Generation */}
        {pipelineStep === 'mockup' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h1 className="text-xl font-bold text-white sm:text-2xl">
                  Step 2: Printify Lifestyle Mockup Generation
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Generate lifestyle mockups locally with ComfyUI, guided by the artwork and selected Printify case references for <span className="font-mono text-indigo-300 font-semibold">{product.productId}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadDesignAndMockups}
                disabled={isDownloadingAssets || !hasDownloadableMockups || !(activeDesign?.imageUrl || product.design.localUrl)}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-4 w-4" />
                {isDownloadingAssets ? 'Preparing ZIP…' : 'Download design + mockups'}
              </button>
            </div>
            {assetDownloadError && <p role="alert" className="text-sm text-rose-300">{assetDownloadError}</p>}

            <WorkflowStudio
              workflow={mockupWorkflow}
              onSelectStep={(activeStep) => setMockupWorkflow((current) => ({ ...current, activeStep }))}
              onUploadArtwork={handleUploadArtwork}
              onUploadProductReference={handleUploadProductReference}
              onUploadSceneReference={handleUploadSceneReference}
              onRemoveSceneReference={(imageId) =>
                setMockupWorkflow((current) => ({
                  ...current,
                  sceneReferenceImages: current.sceneReferenceImages.filter((image) => image.id !== imageId),
                  generatedMockups: [],
                  generatedImageUrl: null,
                }))
              }
              onGenerate={handleGenerateMockups}
              onToggleReference={(productReferenceId) =>
                setMockupWorkflow((current) => ({
                  ...current,
                  productReferenceIds: current.productReferenceIds.includes(productReferenceId)
                    ? current.productReferenceIds.filter((id) => id !== productReferenceId)
                    : [...current.productReferenceIds, productReferenceId],
                  generatedMockups: [],
                  generatedImageUrl: null,
                }))
              }
              onSelectAllReferences={(productReferenceIds) =>
                setMockupWorkflow((current) => ({
                  ...current,
                  productReferenceIds,
                  generatedMockups: [],
                  generatedImageUrl: null,
                }))
              }
              onChangeSceneDescription={(sceneDescription) =>
                setMockupWorkflow((current) => ({
                  ...current,
                  sceneDescription,
                }))
              }
              onRemoveProductReference={(modelId) =>
                setMockupWorkflow((current) => {
                  const productReferenceImages = { ...current.productReferenceImages };
                  delete productReferenceImages[modelId];
                  return { ...current, productReferenceImages };
                })
              }
              onRegenerateMockup={handleRegenerateMockup}
              onRemoveMockup={(modelId) =>
                setMockupWorkflow((current) => ({
                  ...current,
                  generatedMockups: current.generatedMockups.filter((item) => item.modelId !== modelId),
                }))
              }
              onContinueToDrive={() => setPipelineStep('drive')}
              onUploadFinishedMockup={handleUploadFinishedMockup}
              onUploadMultipleFinishedMockups={handleUploadMultipleFinishedMockups}
            />
          </div>
        )}

        {/* Step 2b: Direct Asset Uploader */}
        {pipelineStep === 'direct-upload' && (
          <DirectUploaderWorkspace
            product={product}
            onUpdateProduct={handleUpdateProduct}
            onContinueToDrive={() => setPipelineStep('drive')}
            onStartNewProduct={handleStartNewProduct}
          />
        )}

        {/* Step 3: Google Drive Canonical Storage */}
        {pipelineStep === 'drive' && (
          <DriveAssetManager
            product={product}
            googleToken={googleToken}
            onConnectGoogle={() => handleConnectGoogle()}
            onUpdateProduct={handleUpdateProduct}
            onContinueToListing={() => setPipelineStep('listing')}
          />
        )}

        {/* Step 4: Generate Etsy Listing Information */}
        {pipelineStep === 'listing' && (
          <ListingWorkspace
            product={product}
            onUpdateProduct={handleUpdateProduct}
            onContinueToExport={() => setPipelineStep('export')}
          />
        )}

        {/* Step 5: Export to Google Sheets for Make.com */}
        {pipelineStep === 'export' && (
          <SheetsExportWorkspace
            product={product}
            googleToken={googleToken}
            onConnectGoogle={() => handleConnectGoogle()}
            onUpdateProduct={handleUpdateProduct}
            onStartNewProduct={handleStartNewProduct}
          />
        )}

        {/* Step 6: Pinterest Bulk Pin CSV & Google Sheets Integration */}
        {pipelineStep === 'pinterest' && (
          <PinterestCsvWorkspace
            product={product}
            workflowProducts={workflowProducts}
            googleToken={googleToken}
            googleEmail={googleEmail}
            onConnectGoogle={() => handleConnectGoogle()}
            onOpenGoogleSettings={() => setIsGoogleModalOpen(true)}
          />
        )}

        {/* Step 7: Prepare & publish on Printify */}
        {pipelineStep === 'printify' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h1 className="text-xl font-bold text-white sm:text-2xl">Step 7: Prepare & publish on Printify</h1>
                <p className="mt-1 text-xs text-slate-400">
                  Select this product’s artwork and mockups, set case variants, review your profit, and create or publish a Printify product.
                </p>
              </div>
            </div>
            <PrintifyPublishPanel
              product={product}
              designs={designs}
              onUpdateProduct={handleUpdateProduct}
              onOpenExcelImporter={() => setPipelineStep('excel-printify')}
            />
          </div>
        )}

        {/* Step 8: Excel to Printify Bulk Importer */}
        {pipelineStep === 'excel-printify' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h1 className="text-xl font-bold text-white sm:text-2xl">Step 8: Excel to Printify Bulk Importer</h1>
                <p className="mt-1 text-xs text-slate-400">
                  Upload an Excel spreadsheet with title, description, tags, and design image URLs to sequentially import products into Printify.
                </p>
              </div>
            </div>
            <ExcelPrintifyImporter
              googleToken={googleToken}
              googleEmail={googleEmail}
              onConnectGoogle={() => handleConnectGoogle()}
              onOpenGoogleSettings={() => setIsGoogleModalOpen(true)}
              onNavigateToPublishPanel={() => setPipelineStep('printify')}
            />
          </div>
        )}
      </main>

      {/* Google OAuth & Account Settings Modal */}
      <GoogleAuthModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        googleConnected={Boolean(googleToken)}
        googleEmail={googleEmail}
        googleAuthError={googleAuthError}
        onConnect={handleConnectGoogle}
        onDisconnect={handleDisconnectGoogle}
      />

      {/* Global Printify Key Import & Verification Modal */}
      <PrintifyKeyModal
        isOpen={isPrintifyKeyModalOpen}
        onClose={() => setIsPrintifyKeyModalOpen(false)}
      />

      {/* Global Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-4 text-center text-xs text-slate-500">
        <p>
          CaseCraft Unified Studio • DESIGN GENERATION → MOCKUPS → GOOGLE DRIVE → ETSY LISTING → GOOGLE SHEETS → MAKE.COM
        </p>
      </footer>
    </div>
  );
}
