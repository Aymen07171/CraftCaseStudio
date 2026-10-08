import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
  ExternalLink,
  Download,
  Eye,
  Sliders,
  Sparkles,
  ShoppingBag,
  Layers,
  Key,
  Trash2,
  Tag,
  Image as ImageIcon,
  Check,
  X,
  FileText,
  HelpCircle,
  ArrowRight,
  CheckSquare,
  Square,
  MinusSquare,
  HardDrive,
  FolderDown,
  FolderCheck,
  Link2,
} from 'lucide-react';
import {
  ExcelProductRow,
  ExcelColumnMapping,
  ExcelParseResult,
  parseExcelFile,
  generateReferenceExcelFile,
  generateReferenceCsvFile,
  processSequentialPrintifyImport,
  resolveGoogleDriveImagesForRows,
} from '../services/excelPrintifyService';
import {
  getStoredPrintifyToken,
  fetchPrintifyApi,
  saveAndVerifyPrintifyToken,
} from '../services/printifyClient';
import {
  connectGoogleDriveAndSheets,
  getStoredGoogleSession,
} from '../services/unifiedGoogleService';
import { UnifiedProductRecord } from '../types/unifiedWorkflow';

interface ExcelPrintifyImporterProps {
  onImportToWorkflow?: (products: UnifiedProductRecord[]) => void;
  onNavigateToPublishPanel?: () => void;
  googleToken?: string | null;
  googleEmail?: string;
  onConnectGoogle?: () => Promise<void> | void;
  onOpenGoogleSettings?: () => void;
}

export const ExcelPrintifyImporter: React.FC<ExcelPrintifyImporterProps> = ({
  onImportToWorkflow,
  onNavigateToPublishPanel,
  googleToken: googleTokenProp,
  googleEmail: googleEmailProp,
  onConnectGoogle,
  onOpenGoogleSettings,
}) => {
  // Token & Connection
  const [token, setToken] = useState(() => getStoredPrintifyToken());
  const [tokenInput, setTokenInput] = useState(() => getStoredPrintifyToken());
  const [isConnectingToken, setIsConnectingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenSuccess, setTokenSuccess] = useState<string | null>(null);

  // Printify Catalog Settings
  const [shops, setShops] = useState<any[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [blueprints, setBlueprints] = useState<any[]>([]);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>('269'); // Tough Phone Cases
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('1'); // Spoke Custom Products
  const [variants, setVariants] = useState<any[]>([]);
  const [selectedVariantIds, setSelectedVariantIds] = useState<number[]>([]);
  const [defaultPrice, setDefaultPrice] = useState<number>(24.99);

  // Loading states
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  // Excel File State
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ExcelParseResult | null>(null);
  const [rows, setRows] = useState<ExcelProductRow[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [columnMapping, setColumnMapping] = useState<ExcelColumnMapping>({
    titleColumn: '',
    descriptionColumn: '',
    tagsColumn: '',
    imageColumn: '',
  });
  const [showMappingModal, setShowMappingModal] = useState(false);

  // Processing & Sequential Engine State
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [currentProcessingItem, setCurrentProcessingItem] = useState<ExcelProductRow | null>(null);
  const [currentStepMessage, setCurrentStepMessage] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed' | 'failed'>('all');
  const [delayBetweenItems, setDelayBetweenItems] = useState<number>(800); // ms

  // Multi-selection & Bulk Deletion State
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState<boolean>(false);
  const [deletingSingleIndex, setDeletingSingleIndex] = useState<number | null>(null);

  // Google Drive Connection & Folder Resolution State
  const [activeGoogleToken, setActiveGoogleToken] = useState<string | null>(
    () => googleTokenProp || getStoredGoogleSession().token
  );
  const [activeGoogleEmail, setActiveGoogleEmail] = useState<string>(
    () => googleEmailProp || getStoredGoogleSession().email
  );
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [googleConnectError, setGoogleConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (googleTokenProp) setActiveGoogleToken(googleTokenProp);
    if (googleEmailProp) setActiveGoogleEmail(googleEmailProp);
  }, [googleTokenProp, googleEmailProp]);

  const [masterDriveFolderUrl, setMasterDriveFolderUrl] = useState<string>('');
  const [isResolvingDrive, setIsResolvingDrive] = useState(false);
  const [driveResolveMessage, setDriveResolveMessage] = useState<string>('');

  // Cancellation and pause signal
  const signalRef = useRef({ isCancelled: false, isPaused: false });

  // Notifications
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  // Load shops and initial catalog when token is present
  useEffect(() => {
    if (!token) return;

    const loadInitialPrintifyData = async () => {
      setIsLoadingCatalog(true);
      try {
        const shopsRes = await fetchPrintifyApi('connection');
        const shopList = Array.isArray(shopsRes.shops) ? shopsRes.shops : [];
        setShops(shopList);
        if (shopList.length > 0 && !selectedShopId) {
          setSelectedShopId(String(shopList[0].id));
        }

        // Fetch blueprints
        const bpRes = await fetchPrintifyApi('blueprints');
        const bpList = Array.isArray(bpRes) ? bpRes : Array.isArray(bpRes.data) ? bpRes.data : [];
        setBlueprints(bpList);

        // Find Tough Phone Cases (Blueprint 269) or default
        const phoneCaseBp = bpList.find(
          (b: any) =>
            b.id === 269 ||
            b.title?.toLowerCase().includes('tough') ||
            b.title?.toLowerCase().includes('phone case')
        );
        const activeBpId = phoneCaseBp ? String(phoneCaseBp.id) : bpList[0] ? String(bpList[0].id) : '269';
        setSelectedBlueprintId(activeBpId);
      } catch (err: any) {
        console.warn('Failed to load Printify catalog:', err);
      } finally {
        setIsLoadingCatalog(false);
      }
    };

    loadInitialPrintifyData();
  }, [token]);

  // Load providers when blueprint changes
  useEffect(() => {
    if (!token || !selectedBlueprintId) return;

    const loadProviders = async () => {
      try {
        const provRes = await fetchPrintifyApi('providers', { blueprintId: selectedBlueprintId });
        const provList = Array.isArray(provRes) ? provRes : [];
        setProviders(provList);
        if (provList.length > 0) {
          setSelectedProviderId(String(provList[0].id));
        }
      } catch (err: any) {
        console.warn('Failed to load providers:', err);
      }
    };

    loadProviders();
  }, [token, selectedBlueprintId]);

  // Load variants when provider changes
  useEffect(() => {
    if (!token || !selectedBlueprintId || !selectedProviderId) return;

    const loadVariants = async () => {
      try {
        const varRes = await fetchPrintifyApi('variants', {
          blueprintId: selectedBlueprintId,
          providerId: selectedProviderId,
        });
        const varList = Array.isArray(varRes?.variants)
          ? varRes.variants
          : Array.isArray(varRes)
          ? varRes
          : [];
        setVariants(varList);
        // Select all available variants by default
        const availableIds = varList.filter((v: any) => v.is_available !== false).map((v: any) => Number(v.id));
        setSelectedVariantIds(availableIds.length > 0 ? availableIds : varList.map((v: any) => Number(v.id)));
      } catch (err: any) {
        console.warn('Failed to load variants:', err);
      }
    };

    loadVariants();
  }, [token, selectedBlueprintId, selectedProviderId]);

  // Save Token Handler
  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setTokenError(null);
    setTokenSuccess(null);
    setIsConnectingToken(true);

    try {
      const res = await saveAndVerifyPrintifyToken(tokenInput);
      setToken(tokenInput.trim());
      const shopList = Array.isArray(res.shops) ? res.shops : [];
      setShops(shopList);
      if (shopList.length > 0) {
        setSelectedShopId(String(shopList[0].id));
      }
      setTokenSuccess(`Connected successfully! Found ${shopList.length} shop(s).`);
    } catch (err: any) {
      setTokenError(err.message || 'Failed to verify Printify token.');
    } finally {
      setIsConnectingToken(false);
    }
  };

  // File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setGlobalError(null);
    setGlobalSuccess(null);
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    try {
      const result = await parseExcelFile(uploadedFile, uploadedFile.name);
      setFile(uploadedFile);
      setParseResult(result);
      setSelectedSheet(result.activeSheet);
      setColumnMapping(result.mapping);
      setRows(result.rows);
      setSelectedRowIndices(new Set());
      if (result.detectedDriveFolderUrl) {
        setMasterDriveFolderUrl(result.detectedDriveFolderUrl);
      }
      setGlobalSuccess(
        `Successfully loaded ${result.totalRows} product rows from "${uploadedFile.name}"!${
          result.hasDriveLinks ? ' Google Drive folder links detected.' : ''
        }`
      );
      if (result.warnings.length > 0) {
        setGlobalError(`Notice: ${result.warnings.slice(0, 2).join('; ')}`);
      }
    } catch (err: any) {
      setGlobalError(`Failed to parse file: ${err.message}`);
    }
    e.target.value = '';
  };

  // Re-parse when sheet changes
  const handleSheetChange = async (sheetName: string) => {
    if (!file) return;
    try {
      const result = await parseExcelFile(file, file.name, sheetName, columnMapping);
      setParseResult(result);
      setSelectedSheet(sheetName);
      setRows(result.rows);
      setSelectedRowIndices(new Set());
      if (result.detectedDriveFolderUrl && !masterDriveFolderUrl) {
        setMasterDriveFolderUrl(result.detectedDriveFolderUrl);
      }
    } catch (err: any) {
      setGlobalError(`Failed to switch sheet: ${err.message}`);
    }
  };

  // Apply custom column mapping
  const handleApplyMapping = async (newMapping: ExcelColumnMapping) => {
    setColumnMapping(newMapping);
    setShowMappingModal(false);
    if (!file) return;

    try {
      const result = await parseExcelFile(file, file.name, selectedSheet, newMapping);
      setParseResult(result);
      setRows(result.rows);
      setSelectedRowIndices(new Set());
      if (result.detectedDriveFolderUrl && !masterDriveFolderUrl) {
        setMasterDriveFolderUrl(result.detectedDriveFolderUrl);
      }
      setGlobalSuccess('Updated column mappings successfully.');
    } catch (err: any) {
      setGlobalError(`Failed to update mapping: ${err.message}`);
    }
  };

  // Load sample demo data
  const handleLoadSampleData = async () => {
    setGlobalError(null);
    setGlobalSuccess(null);

    const sampleRows: ExcelProductRow[] = [
      {
        index: 0,
        rawRow: {
          'Google Drive Folder': 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
          'Design File Name': 'fox_stained_glass.png',
        },
        title: 'Stained Glass Woodland Fox Tough Phone Case',
        description:
          'Premium double-layer protective phone case featuring vibrant stained glass cathedral fox artwork. Impact-resistant polycarbonate shell with shock-absorbing TPU interior liner. UV-protected full bleed wrap print.',
        tags: [
          'stained glass case',
          'woodland fox',
          'aesthetic iphone case',
          'tough phone case',
          'autumn leaves',
          'cottagecore case',
          'animal artwork',
          'gift for her',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1200&q=80',
        price: 24.99,
        sku: 'FOX-VITRAIL-TOUGH',
        driveFolderUrl: 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
        driveFileName: 'fox_stained_glass.png',
        isDriveResolved: true,
        status: 'pending',
      },
      {
        index: 1,
        rawRow: {
          'Google Drive Folder': 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
          'Design File Name': 'wildflower_meadow.png',
        },
        title: 'Botanical Wildflower Garden Floral Case',
        description:
          'Hand-drawn vintage wildflower meadow pattern with golden buttercups, lavender, and pressed daisies. Ultra-clear protective case with raised camera bezel and precision button covers.',
        tags: [
          'wildflower case',
          'botanical flowers',
          'floral phone case',
          'pressed flower art',
          'vintage botanical',
          'nature lover gift',
          'spring phone case',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=1200&q=80',
        price: 24.99,
        sku: 'FLORAL-MEADOW-002',
        driveFolderUrl: 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
        driveFileName: 'wildflower_meadow.png',
        isDriveResolved: true,
        status: 'pending',
      },
      {
        index: 2,
        rawRow: {
          'Google Drive Folder': 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
          'Design File Name': 'cosmic_nebula.png',
        },
        title: 'Cosmic Galaxy Nebula Starfield Case',
        description:
          'Deep space spiral nebula with luminous celestial dust and glowing star clusters. Dual-layer shockproof construction engineered for high drop protection and everyday style.',
        tags: [
          'galaxy phone case',
          'space nebula',
          'astronomy gift',
          'cosmic stars',
          'deep space art',
          'celestial cover',
          'aesthetic dark case',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=1200&q=80',
        price: 26.99,
        sku: 'COSMIC-NEBULA-003',
        driveFolderUrl: 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
        driveFileName: 'cosmic_nebula.png',
        isDriveResolved: true,
        status: 'pending',
      },
      {
        index: 3,
        rawRow: {},
        title: 'Japanese Wave Art Minimalist Phone Case',
        description:
          'Traditional ukiyo-e ocean wave woodblock print aesthetic rendered in modern indigo blue and seafoam white. Matte textured surface with reinforced bumper corners.',
        tags: [
          'great wave',
          'japanese art',
          'ocean waves',
          'ukiyo-e aesthetic',
          'minimal phone case',
          'kanagawa wave',
          'blue phone case',
        ],
        imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80',
        price: 24.99,
        sku: 'JAPAN-WAVE-004',
        status: 'pending',
      },
    ];

    setRows(sampleRows);
    setMasterDriveFolderUrl('https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ');
    setParseResult({
      fileName: 'Sample_Template_Reference.xlsx',
      sheetNames: ['Printify_Products'],
      activeSheet: 'Printify_Products',
      headers: ['Product ID', 'Title', 'Description', 'Tags', 'Design Image', 'Google Drive Folder', 'Price', 'SKU'],
      mapping: {
        titleColumn: 'Title',
        descriptionColumn: 'Description',
        tagsColumn: 'Tags',
        imageColumn: 'Design Image',
        driveFolderColumn: 'Google Drive Folder',
        priceColumn: 'Price',
        skuColumn: 'SKU',
      },
      rows: sampleRows,
      totalRows: 4,
      validRows: 4,
      hasDriveLinks: true,
      detectedDriveFolderUrl: 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
      errors: [],
      warnings: [],
    });
    setSelectedRowIndices(new Set());
    setGlobalSuccess('Loaded 4 sample reference products with Google Drive folder links!');
  };

  // Start Sequential Execution
  const handleStartImport = async (targetRows?: ExcelProductRow[]) => {
    if (!token) {
      setGlobalError('Please connect your Printify Personal Access Token first.');
      return;
    }

    let shopIdToUse = selectedShopId;
    if (!shopIdToUse && shops.length > 0) {
      shopIdToUse = String(shops[0].id);
      setSelectedShopId(shopIdToUse);
    }
    if (!shopIdToUse) {
      try {
        const shopsRes = await fetchPrintifyApi('connection', {}, token);
        const shopList = Array.isArray(shopsRes?.shops) ? shopsRes.shops : [];
        if (shopList.length > 0) {
          shopIdToUse = String(shopList[0].id);
          setSelectedShopId(shopIdToUse);
          setShops(shopList);
        }
      } catch (err) {
        console.warn('Could not auto-fetch shops:', err);
      }
    }

    if (!shopIdToUse) {
      setGlobalError('Please select a target Printify Shop. No shops were found on your Printify account.');
      return;
    }

    const blueprintIdToUse = selectedBlueprintId || '269';
    const providerIdToUse = selectedProviderId || '1';

    const itemsToProcess = (targetRows || rows).filter((r) => r.status !== 'completed');
    if (itemsToProcess.length === 0) {
      setGlobalError('All items in the list are already completed!');
      return;
    }

    // Reset status and clear old errors for items being processed
    itemsToProcess.forEach((r) => {
      r.status = 'pending';
      r.error = undefined;
    });
    setRows((prev) => [...prev]);

    setIsProcessing(true);
    setIsPaused(false);
    signalRef.current = { isCancelled: false, isPaused: false };
    setGlobalError(null);
    setGlobalSuccess(null);
    setProgress({ current: 0, total: itemsToProcess.length, percentage: 0 });

    try {
      await processSequentialPrintifyImport(
        itemsToProcess,
        {
          shopId: shopIdToUse,
          defaultBlueprintId: blueprintIdToUse,
          defaultPrintProviderId: providerIdToUse,
          defaultVariantIds: selectedVariantIds,
          defaultPrice,
          customToken: token,
          googleToken: activeGoogleToken || undefined,
          masterDriveFolderUrl: masterDriveFolderUrl.trim() || parseResult?.detectedDriveFolderUrl,
          delayBetweenItemsMs: delayBetweenItems,
        },
        {
          onItemStart: (idx, item) => {
            setCurrentProcessingItem(item);
            setCurrentStepMessage(`Starting item #${idx + 1}: "${item.title}"`);
            setRows((prev) => [...prev]);
          },
          onItemUploadingImage: (idx, item) => {
            setCurrentStepMessage(`Uploading design artwork to Printify for "${item.title}"...`);
            setRows((prev) => [...prev]);
          },
          onItemCreatingProduct: (idx, item) => {
            setCurrentStepMessage(`Creating product draft on Printify for "${item.title}"...`);
            setRows((prev) => [...prev]);
          },
          onItemSuccess: (idx, item, productId) => {
            setCurrentStepMessage(`✓ Created product ${productId}!`);
            setRows((prev) => [...prev]);
          },
          onItemError: (idx, item, error) => {
            setCurrentStepMessage(`✗ Failed: ${error.message}`);
            setRows((prev) => [...prev]);
          },
          onProgress: (current, total, percentage) => {
            setProgress({ current, total, percentage });
          },
          onComplete: (summary) => {
            setGlobalSuccess(
              `Sequential import finished: ${summary.success} succeeded, ${summary.failed} failed out of ${summary.total} items.`
            );
          },
        },
        signalRef.current
      );
    } catch (err: any) {
      setGlobalError(`Import process encountered an error: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setIsPaused(false);
      setCurrentProcessingItem(null);
      setCurrentStepMessage('');
    }
  };

  // Pause / Resume handler
  const handleTogglePause = () => {
    if (isPaused) {
      signalRef.current.isPaused = false;
      setIsPaused(false);
      setCurrentStepMessage('Resuming import...');
    } else {
      signalRef.current.isPaused = true;
      setIsPaused(true);
      setCurrentStepMessage('Paused. Click Resume to continue.');
    }
  };

  // Cancel handler
  const handleCancel = () => {
    signalRef.current.isCancelled = true;
    setIsProcessing(false);
    setIsPaused(false);
    setCurrentStepMessage('Import cancelled.');
  };

  // Single Item Retry
  const handleRetryItem = (row: ExcelProductRow) => {
    row.status = 'pending';
    row.error = undefined;
    handleStartImport([row]);
  };

  // Filtered rows for display
  const displayedRows = useMemo(() => {
    if (filterStatus === 'all') return rows;
    return rows.filter((r) => r.status === filterStatus);
  }, [rows, filterStatus]);

  // Counts
  const counts = useMemo(() => {
    let completed = 0;
    let failed = 0;
    let pending = 0;
    rows.forEach((r) => {
      if (r.status === 'completed') completed++;
      else if (r.status === 'failed') failed++;
      else pending++;
    });
    return { completed, failed, pending, total: rows.length };
  }, [rows]);

  // Google Drive asset statistics
  const driveStats = useMemo(() => {
    const total = rows.length;
    const resolved = rows.filter(
      (r) =>
        r.isDriveResolved ||
        (Boolean(r.imageUrl) && !r.imageUrl.includes('drive.google.com') && !r.driveFolderUrl)
    ).length;
    const hasDriveReference = rows.filter(
      (r) =>
        Boolean(r.driveFolderUrl) ||
        (r.imageUrl && r.imageUrl.includes('drive.google.com')) ||
        Boolean(r.driveFileName)
    ).length;
    const pendingFromDrive = rows.filter(
      (r) =>
        !r.isDriveResolved &&
        (Boolean(r.driveFolderUrl) ||
          (r.imageUrl && r.imageUrl.includes('drive.google.com')) ||
          !r.imageUrl)
    ).length;
    return { total, resolved, hasDriveReference, pendingFromDrive };
  }, [rows]);

  // Connect Google Drive
  const handleConnectDrive = async () => {
    setIsConnectingGoogle(true);
    setGoogleConnectError(null);
    try {
      if (onConnectGoogle) {
        await onConnectGoogle();
      } else {
        const res = await connectGoogleDriveAndSheets();
        setActiveGoogleToken(res.token);
        setActiveGoogleEmail(res.email);
      }
      setGlobalSuccess('Google Drive connected successfully!');
    } catch (err: any) {
      const msg = err?.message || '';
      if (!msg.includes('closed') && !msg.includes('cancelled') && !msg.includes('popup')) {
        setGoogleConnectError(err.message || 'Failed to connect to Google Drive.');
      }
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  // Bulk Resolve Design Images from Google Drive
  const handleResolveDriveImages = async () => {
    if (rows.length === 0) return;
    setIsResolvingDrive(true);
    setDriveResolveMessage('Connecting to Google Drive folder...');
    setGlobalError(null);
    setGlobalSuccess(null);

    try {
      const targetFolder = masterDriveFolderUrl.trim() || parseResult?.detectedDriveFolderUrl;
      const result = await resolveGoogleDriveImagesForRows(
        rows,
        targetFolder,
        activeGoogleToken,
        (current, total, message) => {
          setDriveResolveMessage(`[${current}/${total}] ${message}`);
        }
      );

      setRows(result.updatedRows);
      if (parseResult) {
        setParseResult({
          ...parseResult,
          rows: result.updatedRows,
          validRows: result.updatedRows.filter((r) => Boolean(r.imageUrl && r.title)).length,
        });
      }

      if (result.resolvedCount > 0) {
        setGlobalSuccess(
          `Successfully imported ${result.resolvedCount} design image(s) directly from Google Drive! All product entries are now ready for Printify publishing.`
        );
      }
      if (result.failedCount > 0) {
        setGlobalError(
          `${result.failedCount} product(s) could not locate matching images in Google Drive. Check folder sharing settings or confirm design filenames.`
        );
      }
    } catch (err: any) {
      setGlobalError(`Google Drive import failed: ${err.message}`);
    } finally {
      setIsResolvingDrive(false);
      setDriveResolveMessage('');
    }
  };

  // Single Row Resolve from Google Drive
  const handleResolveSingleDriveImage = async (rowIndex: number) => {
    const targetRow = rows[rowIndex];
    if (!targetRow) return;

    setIsResolvingDrive(true);
    setDriveResolveMessage(`Importing design for "${targetRow.title || `Item #${rowIndex + 1}`}" from Google Drive...`);

    try {
      const targetFolder =
        targetRow.driveFolderUrl || masterDriveFolderUrl.trim() || parseResult?.detectedDriveFolderUrl;
      const result = await resolveGoogleDriveImagesForRows(
        [targetRow],
        targetFolder,
        activeGoogleToken
      );

      const updated = [...rows];
      if (result.updatedRows[0]) {
        updated[rowIndex] = result.updatedRows[0];
        setRows(updated);
        if (parseResult) {
          setParseResult({
            ...parseResult,
            rows: updated,
            validRows: updated.filter((r) => Boolean(r.imageUrl && r.title)).length,
          });
        }
        if (result.updatedRows[0].isDriveResolved) {
          setGlobalSuccess(`Successfully imported image from Google Drive for "${targetRow.title}"!`);
        } else if (result.updatedRows[0].driveError) {
          setGlobalError(result.updatedRows[0].driveError);
        }
      }
    } catch (err: any) {
      setGlobalError(`Google Drive import failed: ${err.message}`);
    } finally {
      setIsResolvingDrive(false);
      setDriveResolveMessage('');
    }
  };

  // Multi-selection computed states
  const allSelected = useMemo(() => {
    return rows.length > 0 && selectedRowIndices.size === rows.length;
  }, [rows.length, selectedRowIndices]);

  const allDisplayedSelected = useMemo(() => {
    return (
      displayedRows.length > 0 &&
      displayedRows.every((r) => selectedRowIndices.has(r.index))
    );
  }, [displayedRows, selectedRowIndices]);

  const someDisplayedSelected = useMemo(() => {
    return (
      displayedRows.length > 0 &&
      displayedRows.some((r) => selectedRowIndices.has(r.index))
    );
  }, [displayedRows, selectedRowIndices]);

  // Select all products simultaneously
  const handleSelectAll = () => {
    setSelectedRowIndices(new Set(rows.map((r) => r.index)));
  };

  // Deselect all
  const handleDeselectAll = () => {
    setSelectedRowIndices(new Set());
  };

  // Toggle select all (or all displayed)
  const handleToggleSelectAll = () => {
    if (allSelected || allDisplayedSelected) {
      setSelectedRowIndices(new Set());
    } else {
      setSelectedRowIndices(new Set(rows.map((r) => r.index)));
    }
  };

  // Toggle individual row selection
  const handleToggleSelectRow = (index: number) => {
    setSelectedRowIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Select all and immediately trigger deletion confirmation
  const handleSelectAllAndDelete = () => {
    if (rows.length === 0) return;
    setSelectedRowIndices(new Set(rows.map((r) => r.index)));
    setDeletingSingleIndex(null);
    setShowDeleteConfirmModal(true);
  };

  // Delete selected button click
  const handleDeleteSelected = () => {
    if (selectedRowIndices.size === 0) return;
    setDeletingSingleIndex(null);
    setShowDeleteConfirmModal(true);
  };

  // Single row delete click
  const handleDeleteSingleRow = (index: number) => {
    setDeletingSingleIndex(index);
    setShowDeleteConfirmModal(true);
  };

  // Confirm delete handler: cleans rows, updates indices and parse result
  const handleConfirmDelete = () => {
    if (deletingSingleIndex !== null) {
      const target = rows.find((r) => r.index === deletingSingleIndex);
      const remaining = rows
        .filter((r) => r.index !== deletingSingleIndex)
        .map((r, i) => ({ ...r, index: i }));

      setRows(remaining);
      if (parseResult) {
        setParseResult({
          ...parseResult,
          rows: remaining,
          totalRows: remaining.length,
          validRows: remaining.filter((r) => Boolean(r.imageUrl && r.title)).length,
        });
      }
      setSelectedRowIndices((prev) => {
        const next = new Set<number>();
        prev.forEach((idx) => {
          if (idx < deletingSingleIndex) next.add(idx);
          else if (idx > deletingSingleIndex) next.add(idx - 1);
        });
        return next;
      });
      setDeletingSingleIndex(null);
      setShowDeleteConfirmModal(false);
      setGlobalSuccess(`Removed "${target?.title || 'Product'}" from import queue.`);
      return;
    }

    const countToDelete = selectedRowIndices.size;
    if (countToDelete === 0) {
      setShowDeleteConfirmModal(false);
      return;
    }

    const remaining = rows
      .filter((r) => !selectedRowIndices.has(r.index))
      .map((r, i) => ({ ...r, index: i }));

    setRows(remaining);
    if (parseResult) {
      setParseResult({
        ...parseResult,
        rows: remaining,
        totalRows: remaining.length,
        validRows: remaining.filter((r) => Boolean(r.imageUrl && r.title)).length,
      });
    }

    setSelectedRowIndices(new Set());
    setShowDeleteConfirmModal(false);
    setGlobalSuccess(
      `Successfully deleted ${countToDelete} product${countToDelete === 1 ? '' : 's'} simultaneously.`
    );
  };

  // Preview products to delete in modal
  const previewProductsToDelete = useMemo(() => {
    if (deletingSingleIndex !== null) {
      const single = rows.find((r) => r.index === deletingSingleIndex);
      return single ? [single] : [];
    }
    const selected = rows.filter((r) => selectedRowIndices.has(r.index));
    return selected.slice(0, 5);
  }, [rows, deletingSingleIndex, selectedRowIndices]);

  const previewExtraCount = useMemo(() => {
    if (deletingSingleIndex !== null) return 0;
    return Math.max(0, selectedRowIndices.size - 5);
  }, [deletingSingleIndex, selectedRowIndices]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-indigo-500 p-0.5 shadow-md shadow-emerald-500/20">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
                <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Excel to Printify Bulk Product Importer</h2>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                  Sequential 1-by-1 Pipeline
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Upload your reference Excel or CSV file containing titles, descriptions, tags, and design image URLs to automatically import every item into Printify.
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generateReferenceExcelFile}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition cursor-pointer"
              title="Download official sample Excel template"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              <span>Download Excel Template (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={generateReferenceCsvFile}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition cursor-pointer"
              title="Download official sample CSV template"
            >
              <Download className="h-3.5 w-3.5 text-indigo-400" />
              <span>Download CSV Template</span>
            </button>

            <button
              type="button"
              onClick={handleLoadSampleData}
              className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-950/40 hover:bg-purple-900/50 px-3.5 py-2 text-xs font-semibold text-purple-200 transition cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              <span>Load Demo Reference Data</span>
            </button>
          </div>
        </div>

        {/* Notifications */}
        {globalError && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-800/60 bg-rose-950/40 p-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <p>{globalError}</p>
          </div>
        )}
        {globalSuccess && (
          <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-emerald-800/60 bg-emerald-950/40 p-3 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <p>{globalSuccess}</p>
          </div>
        )}

        {/* Printify Connection & Target Configuration Bar */}
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Printify Target Shop &amp; Product Model Configuration
              </h3>
            </div>
            {token ? (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-300 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Connected ({shops.length} shop{shops.length === 1 ? '' : 's'})</span>
              </span>
            ) : (
              <span className="text-xs text-amber-400 font-medium flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Token not configured</span>
              </span>
            )}
          </div>

          {/* If token not configured, show quick token input */}
          {!token && (
            <form onSubmit={handleSaveToken} className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-4 space-y-3">
              <div className="flex items-start gap-2 text-xs text-amber-200">
                <Key className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Connect your Printify Account</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Generate a Personal Access Token in your Printify account settings under <strong>My Account &gt; API &gt; Generate Token</strong>.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste Printify Personal Access Token here..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none font-mono"
                />
                <button
                  type="submit"
                  disabled={isConnectingToken || !tokenInput.trim()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition cursor-pointer"
                >
                  {isConnectingToken ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  <span>Connect</span>
                </button>
              </div>
              {tokenError && <p className="text-xs text-rose-400">{tokenError}</p>}
              {tokenSuccess && <p className="text-xs text-emerald-400">{tokenSuccess}</p>}
            </form>
          )}

          {/* Configuration Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            {/* Target Shop */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Target Printify Shop *
              </label>
              <select
                value={selectedShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
                disabled={shops.length === 0}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                {shops.length === 0 ? (
                  <option value="">No shops found (Check API token)</option>
                ) : (
                  shops.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.title} ({s.sales_channel || 'Store'})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Blueprint / Product Model */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Product Template (Blueprint) *
              </label>
              <select
                value={selectedBlueprintId}
                onChange={(e) => setSelectedBlueprintId(e.target.value)}
                disabled={blueprints.length === 0}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                {blueprints.length === 0 ? (
                  <option value="269">Tough Phone Cases (Blueprint 269)</option>
                ) : (
                  blueprints.map((bp) => (
                    <option key={bp.id} value={String(bp.id)}>
                      {bp.title}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Print Provider */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Print Provider *
              </label>
              <select
                value={selectedProviderId}
                onChange={(e) => setSelectedProviderId(e.target.value)}
                disabled={providers.length === 0}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                {providers.length === 0 ? (
                  <option value="16">Spoke Custom Products (Provider 16)</option>
                ) : (
                  providers.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.title}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Default Price */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Default Retail Price (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(parseFloat(e.target.value) || 24.99)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 pl-7 pr-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-[11px] text-slate-400 border-t border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-slate-300 font-medium">Selected Variants:</span>
              <span className="font-mono text-emerald-400 font-bold">
                {selectedVariantIds.length} device variant(s) enabled
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>Throttle Delay between items:</span>
              <select
                value={delayBetweenItems}
                onChange={(e) => setDelayBetweenItems(Number(e.target.value))}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-white"
              >
                <option value={400}>400ms (Fast)</option>
                <option value={800}>800ms (Recommended)</option>
                <option value={1500}>1500ms (Safe)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Zone & Column Mapping Ribbon */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Upload Excel Reference File
            </h3>
          </div>

          {parseResult && (
            <div className="flex items-center gap-2">
              {parseResult.sheetNames.length > 1 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400">Sheet:</span>
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white"
                  >
                    {parseResult.sheetNames.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowMappingModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition cursor-pointer"
              >
                <Sliders className="h-3.5 w-3.5 text-indigo-400" />
                <span>Verify / Edit Column Mapping</span>
              </button>
            </div>
          )}
        </div>

        {/* Drag and Drop Zone */}
        <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-700 hover:border-emerald-500/80 bg-slate-950/60 hover:bg-slate-950/80 p-8 text-center cursor-pointer transition group">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 group-hover:scale-105 transition">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-white">
            {file ? file.name : 'Click or drag & drop your Excel file here'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Supports <strong className="text-slate-300">.xlsx</strong>,{' '}
            <strong className="text-slate-300">.xls</strong>, and{' '}
            <strong className="text-slate-300">.csv</strong> formats containing Title, Description, Tags, and Design Image URLs.
          </p>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {/* Detected Mapping Summary Badge */}
        {parseResult && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400 font-semibold">Active Mapping:</span>
              <span className="rounded bg-indigo-950 border border-indigo-800/60 px-2 py-0.5 text-indigo-300">
                Title &rarr; <strong>{columnMapping.titleColumn || 'Not mapped'}</strong>
              </span>
              <span className="rounded bg-indigo-950 border border-indigo-800/60 px-2 py-0.5 text-indigo-300">
                Desc &rarr; <strong>{columnMapping.descriptionColumn || 'Not mapped'}</strong>
              </span>
              <span className="rounded bg-indigo-950 border border-indigo-800/60 px-2 py-0.5 text-indigo-300">
                Tags &rarr; <strong>{columnMapping.tagsColumn || 'Tag columns'}</strong>
              </span>
              <span className="rounded bg-indigo-950 border border-indigo-800/60 px-2 py-0.5 text-indigo-300">
                Image &rarr; <strong>{columnMapping.imageColumn || 'Not mapped'}</strong>
              </span>
            </div>

            <span className="font-mono text-emerald-400 font-semibold">
              {parseResult.validRows} valid / {parseResult.totalRows} total rows
            </span>
          </div>
        )}
      </div>

      {/* Execution Progress Banner (When Running) */}
      {isProcessing && (
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/60 via-slate-900 to-indigo-950/60 p-5 shadow-2xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/30 border border-emerald-500/50 text-emerald-300">
                <RefreshCw className="h-5 w-5 animate-spin" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Importing Products to Printify...</h4>
                <p className="text-xs text-emerald-300 font-medium">{currentStepMessage || 'Processing queue one-by-one...'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTogglePause}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                {isPaused ? <Play className="h-3.5 w-3.5 text-emerald-400" /> : <Pause className="h-3.5 w-3.5 text-amber-400" />}
                <span>{isPaused ? 'Resume' : 'Pause'}</span>
              </button>

              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1.5 rounded-lg border border-rose-800 bg-rose-950 hover:bg-rose-900 px-3 py-1.5 text-xs font-semibold text-rose-200 transition cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">
                Item {progress.current} of {progress.total}
              </span>
              <span className="text-emerald-400 font-bold">{progress.percentage}% Completed</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden border border-slate-700">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 rounded-full"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Design Images Integration Card */}
      <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-slate-900 via-blue-950/20 to-slate-900 p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 shadow-inner">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Google Drive Design Images Integration
                </h3>
                {parseResult?.hasDriveLinks && (
                  <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-blue-300 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                    Drive Folder Links Detected
                  </span>
                )}
                {driveStats.hasDriveReference > 0 && (
                  <span className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                    {driveStats.hasDriveReference} product{driveStats.hasDriveReference === 1 ? '' : 's'} linked to Drive
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Import each design image directly from Google Drive based on links in your spreadsheet. Files are matched by filename, SKU, Product ID, or sequence.
              </p>
            </div>
          </div>

          {/* Google Account Connection Status */}
          <div className="flex items-center gap-2">
            {activeGoogleToken ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-300 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Drive Connected: {activeGoogleEmail || 'Active'}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectDrive}
                disabled={isConnectingGoogle}
                className="flex items-center gap-1.5 rounded-lg border border-blue-500/50 bg-blue-950/60 hover:bg-blue-900/80 px-3 py-1.5 text-xs font-semibold text-blue-200 transition cursor-pointer shadow-sm"
              >
                {isConnectingGoogle ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5 text-blue-400" />
                )}
                <span>Connect Google Drive</span>
              </button>
            )}
          </div>
        </div>

        {googleConnectError && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-800/60 bg-rose-950/40 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <p>{googleConnectError}</p>
          </div>
        )}

        {/* Folder Link Configuration & Import Action Bar */}
        <div className="grid gap-4 md:grid-cols-12 items-end">
          <div className="md:col-span-8 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span>Google Drive Folder Link</span>
                <span className="text-[11px] text-slate-400 font-normal">
                  (Shared folder containing design artwork files)
                </span>
              </label>
              {parseResult?.detectedDriveFolderUrl && masterDriveFolderUrl === parseResult.detectedDriveFolderUrl && (
                <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Auto-detected from Excel file
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                value={masterDriveFolderUrl}
                onChange={(e) => setMasterDriveFolderUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Files in the folder are automatically matched to each row by filename, SKU, Product ID, title, or row sequence. Supports PNG, JPG, and WEBP.
            </p>
          </div>

          <div className="md:col-span-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleResolveDriveImages}
              disabled={isResolvingDrive || rows.length === 0}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-950 transition cursor-pointer"
            >
              {isResolvingDrive ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <FolderDown className="h-4 w-4" />
              )}
              <span>
                {isResolvingDrive
                  ? 'Importing from Drive...'
                  : 'Import Images from Google Drive'}
              </span>
            </button>

            {/* Quick Readiness Stats */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span>Artwork Readiness:</span>
              <span className={`font-mono font-semibold ${driveStats.resolved === driveStats.total && driveStats.total > 0 ? 'text-emerald-400' : 'text-blue-400'}`}>
                {driveStats.resolved} / {driveStats.total} Ready ({driveStats.total > 0 ? Math.round((driveStats.resolved / driveStats.total) * 100) : 0}%)
              </span>
            </div>
          </div>
        </div>

        {/* Active Resolution Live Banner */}
        {isResolvingDrive && (
          <div className="rounded-xl border border-blue-500/40 bg-blue-950/40 p-3.5 space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-xs text-blue-200">
              <span className="font-semibold flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
                {driveResolveMessage || 'Downloading design images directly from Google Drive...'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Data Table & Queue Controls */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden">
        {/* Table Top Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4 bg-slate-950/60">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Products to Import ({rows.length})
            </h3>

            {/* Select All & Bulk Deletion Action Controls */}
            {rows.length > 0 && (
              <div className="flex items-center gap-2">
                {/* Select All Button */}
                <button
                  type="button"
                  onClick={allSelected ? handleDeselectAll : handleSelectAll}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition cursor-pointer ${
                    allSelected
                      ? 'border-indigo-500/50 bg-indigo-950/70 text-indigo-300 hover:bg-indigo-900/60'
                      : 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                  title={allSelected ? 'Deselect all products' : 'Select all products simultaneously'}
                >
                  {allSelected ? (
                    <CheckSquare className="h-3.5 w-3.5 text-indigo-400" />
                  ) : someDisplayedSelected ? (
                    <MinusSquare className="h-3.5 w-3.5 text-indigo-400" />
                  ) : (
                    <Square className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <span>{allSelected ? 'All Selected' : `Select All (${rows.length})`}</span>
                </button>

                {/* When items are selected: show count + Delete Selected action */}
                {selectedRowIndices.size > 0 ? (
                  <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                    <span className="text-[11px] font-semibold text-slate-300 bg-slate-900 border border-slate-800 rounded-md px-2 py-0.5">
                      {selectedRowIndices.size} selected
                    </span>

                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      disabled={isProcessing}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-rose-700 bg-rose-950/90 hover:bg-rose-900 text-xs font-bold text-rose-200 transition shadow-sm cursor-pointer disabled:opacity-40"
                      title="Delete all selected products simultaneously in one action"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                      <span>
                        Delete {selectedRowIndices.size === rows.length ? `All (${rows.length})` : `Selected (${selectedRowIndices.size})`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer px-1"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  /* 1-Click Option: Select all products and delete in one action */
                  <button
                    type="button"
                    onClick={handleSelectAllAndDelete}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-rose-900/60 bg-rose-950/40 hover:bg-rose-900/60 text-xs font-medium text-rose-300 hover:text-rose-200 transition cursor-pointer disabled:opacity-40"
                    title="Select all products simultaneously and delete them in one action"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                    <span>Delete All ({rows.length})</span>
                  </button>
                )}
              </div>
            )}

            {/* Filter pills */}
            <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={`px-2.5 py-0.5 rounded font-medium transition cursor-pointer ${
                  filterStatus === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                All ({counts.total})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('pending')}
                className={`px-2.5 py-0.5 rounded font-medium transition cursor-pointer ${
                  filterStatus === 'pending' ? 'bg-amber-900/60 text-amber-200 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Pending ({counts.pending})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('completed')}
                className={`px-2.5 py-0.5 rounded font-medium transition cursor-pointer ${
                  filterStatus === 'completed' ? 'bg-emerald-900/60 text-emerald-200 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Completed ({counts.completed})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('failed')}
                className={`px-2.5 py-0.5 rounded font-medium transition cursor-pointer ${
                  filterStatus === 'failed' ? 'bg-rose-900/60 text-rose-200 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Failed ({counts.failed})
              </button>
            </div>
          </div>

          {/* Start Action */}
          <div className="flex items-center gap-2">
            {counts.failed > 0 && !isProcessing && (
              <button
                type="button"
                onClick={() => handleStartImport(rows.filter((r) => r.status === 'failed'))}
                className="flex items-center gap-1.5 rounded-lg border border-rose-700 bg-rose-950/60 hover:bg-rose-900/80 px-3 py-1.5 text-xs font-semibold text-rose-200 transition cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Retry Failed ({counts.failed})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleStartImport()}
              disabled={isProcessing || rows.length === 0 || counts.pending === 0}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 disabled:opacity-50 px-5 py-2 text-xs font-bold text-white transition shadow-lg shadow-emerald-950 cursor-pointer"
            >
              {isProcessing ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
              <span>
                {isProcessing
                  ? 'Importing Products...'
                  : `Start Import to Printify (${counts.pending} Pending)`}
              </span>
            </button>
          </div>
        </div>

        {/* Table Rows */}
        {rows.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500">
              <FileSpreadsheet className="h-6 w-6 text-slate-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">No Products Loaded Yet</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Upload your reference Excel or CSV file above, or click "Load Demo Reference Data" to test the pipeline immediately.
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-2">
              <button
                type="button"
                onClick={handleLoadSampleData}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Load Demo Products</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  {/* Select All Checkbox Column */}
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allDisplayedSelected}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = someDisplayedSelected && !allDisplayedSelected;
                        }
                      }}
                      onChange={handleToggleSelectAll}
                      title={allDisplayedSelected ? 'Deselect all products' : 'Select all products simultaneously'}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400 focus:ring-offset-slate-950 cursor-pointer accent-emerald-500"
                    />
                  </th>
                  <th className="py-2.5 px-3 w-10">#</th>
                  <th className="py-2.5 px-3 w-14">Artwork</th>
                  <th className="py-2.5 px-3">Title</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3">Tags</th>
                  <th className="py-2.5 px-3 w-20">Price</th>
                  <th className="py-2.5 px-3 w-32">Status</th>
                  <th className="py-2.5 px-3 text-right w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {displayedRows.map((row) => {
                  const isCurrent = currentProcessingItem?.index === row.index;
                  const isSelected = selectedRowIndices.has(row.index);
                  return (
                    <tr
                      key={row.index}
                      onClick={() => handleToggleSelectRow(row.index)}
                      className={`transition cursor-pointer ${
                        isCurrent
                          ? 'bg-emerald-950/30'
                          : isSelected
                          ? 'bg-indigo-950/40 hover:bg-indigo-900/40'
                          : row.status === 'completed'
                          ? 'bg-emerald-950/10 hover:bg-slate-800/30'
                          : row.status === 'failed'
                          ? 'bg-rose-950/20 hover:bg-rose-950/30'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(row.index)}
                          aria-label={`Select product ${row.title}`}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400 focus:ring-offset-slate-950 cursor-pointer accent-emerald-500"
                        />
                      </td>

                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">
                        {row.index + 1}
                      </td>

                      {/* Image Thumbnail & Google Drive Integration */}
                      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {row.imageUrl && (row.imageUrl.startsWith('http') || row.imageUrl.startsWith('data:')) ? (
                            <div className="relative group shrink-0">
                              <div className="h-10 w-9 rounded overflow-hidden border border-slate-700 bg-slate-950">
                                <img
                                  src={row.imageUrl}
                                  alt={row.title}
                                  className="h-full w-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              </div>
                              {row.isDriveResolved && (
                                <span
                                  className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[8px] shadow"
                                  title={`Imported from Google Drive: ${row.driveFileName || ''}`}
                                >
                                  <HardDrive className="h-2 w-2" />
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="h-10 w-9 rounded border border-blue-500/40 bg-blue-950/40 flex flex-col items-center justify-center text-blue-300 text-[8px] p-0.5 text-center shrink-0">
                              <HardDrive className="h-3.5 w-3.5 text-blue-400 mb-0.5" />
                              <span>Drive</span>
                            </div>
                          )}

                          {/* Individual Row Google Drive Import / Re-fetch Button */}
                          {(Boolean(row.driveFolderUrl) ||
                            (Boolean(row.imageUrl) && row.imageUrl.includes('drive.google.com')) ||
                            (!row.isDriveResolved && Boolean(masterDriveFolderUrl.trim() || parseResult?.detectedDriveFolderUrl))) && (
                            <button
                              type="button"
                              onClick={() => handleResolveSingleDriveImage(row.index)}
                              disabled={isResolvingDrive}
                              title={row.isDriveResolved ? "Re-sync artwork from Google Drive" : "Import design image from Google Drive folder"}
                              className={`px-1.5 py-1 rounded text-[9px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                                row.isDriveResolved
                                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                                  : 'bg-blue-900/80 hover:bg-blue-800 text-blue-200 border border-blue-500/50 shadow-sm'
                              }`}
                            >
                              <FolderDown className="h-2.5 w-2.5 text-blue-400" />
                              <span>{row.isDriveResolved ? 'Re-sync' : 'Fetch'}</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Title & Drive Source Metadata */}
                      <td className="py-2.5 px-3 max-w-[210px]">
                        <p className="font-semibold text-white truncate" title={row.title}>
                          {row.title || <span className="text-rose-400 italic">Missing Title</span>}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {row.sku && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              SKU: {row.sku}
                            </span>
                          )}
                          {row.driveFileName && (
                            <span
                              className="inline-flex items-center gap-1 text-[9px] text-blue-300 bg-blue-950/60 border border-blue-800/60 rounded px-1.5 py-0.2 font-mono truncate max-w-[130px]"
                              title={`Google Drive file: ${row.driveFileName}`}
                            >
                              <HardDrive className="h-2 w-2 text-blue-400 shrink-0" />
                              <span className="truncate">{row.driveFileName}</span>
                            </span>
                          )}
                          {row.driveFolderUrl && !row.isDriveResolved && (
                            <a
                              href={row.driveFolderUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-0.5 text-[9px] text-blue-400 hover:underline"
                              title="Open Google Drive folder link in new tab"
                            >
                              <span>Folder</span>
                              <ExternalLink className="h-2 w-2" />
                            </a>
                          )}
                          {row.driveError && (
                            <span
                              className="inline-flex items-center gap-1 text-[9px] text-rose-300 bg-rose-950/60 border border-rose-800/60 rounded px-1.5 py-0.2 truncate max-w-[150px]"
                              title={row.driveError}
                            >
                              <AlertCircle className="h-2 w-2 text-rose-400 shrink-0" />
                              <span className="truncate">{row.driveError}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Description */}
                      <td className="py-2.5 px-3 max-w-[240px]">
                        <p className="text-[11px] text-slate-300 line-clamp-2" title={row.description}>
                          {row.description || <span className="text-slate-500 italic">No description</span>}
                        </p>
                      </td>

                      {/* Tags */}
                      <td className="py-2.5 px-3 max-w-[180px]">
                        {row.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.tags.slice(0, 3).map((t, idx) => (
                              <span
                                key={idx}
                                className="rounded bg-slate-950 border border-slate-800 px-1.5 py-0.5 text-[9px] text-slate-300"
                              >
                                {t}
                              </span>
                            ))}
                            {row.tags.length > 3 && (
                              <span className="text-[9px] text-slate-500">+{row.tags.length - 3}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">-</span>
                        )}
                      </td>

                      {/* Price */}
                      <td className="py-2.5 px-3 font-mono text-xs text-white">
                        ${row.price ? row.price.toFixed(2) : defaultPrice.toFixed(2)}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {row.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                            <span>Imported</span>
                          </span>
                        ) : row.status === 'uploading-image' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-950/80 border border-indigo-500/40 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 animate-pulse">
                            <RefreshCw className="h-3 w-3 animate-spin text-indigo-400" />
                            <span>Uploading Img</span>
                          </span>
                        ) : row.status === 'creating-product' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-950/80 border border-purple-500/40 px-2 py-0.5 text-[10px] font-semibold text-purple-300 animate-pulse">
                            <RefreshCw className="h-3 w-3 animate-spin text-purple-400" />
                            <span>Creating Draft</span>
                          </span>
                        ) : row.status === 'failed' ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-950/80 border border-rose-500/40 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                              <AlertCircle className="h-3 w-3 text-rose-400" />
                              <span>Failed</span>
                            </span>
                            {row.error && (
                              <p className="text-[9px] text-rose-400 max-w-[140px] truncate" title={row.error}>
                                {row.error}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <span>Pending</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {row.status === 'completed' && row.printifyProductUrl ? (
                            <a
                              href={row.printifyProductUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline text-[11px] font-semibold"
                              title="Open created product in Printify"
                            >
                              <span>View</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : row.status === 'failed' ? (
                            <button
                              type="button"
                              onClick={() => handleRetryItem(row)}
                              className="text-[11px] font-semibold text-rose-300 hover:text-rose-200 underline cursor-pointer"
                            >
                              Retry
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => handleDeleteSingleRow(row.index)}
                            disabled={isProcessing && currentProcessingItem?.index === row.index}
                            title="Delete this product from queue"
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 transition disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-rose-900/60 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-950 border border-rose-700/60 text-rose-400 shadow-md shadow-rose-950/50">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">
                  {deletingSingleIndex !== null
                    ? 'Delete Product?'
                    : selectedRowIndices.size === rows.length
                    ? `Delete All ${rows.length} Products?`
                    : `Delete ${selectedRowIndices.size} Products?`}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {deletingSingleIndex !== null
                    ? 'This will remove this product from the import list.'
                    : selectedRowIndices.size === rows.length
                    ? 'This will remove all products simultaneously and empty the current import queue.'
                    : `This will remove the selected ${selectedRowIndices.size} products from the import queue.`}
                </p>
              </div>
            </div>

            {/* Preview of products being deleted */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 max-h-48 overflow-y-auto space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Products to be removed:
              </span>
              {previewProductsToDelete.map((p) => (
                <div key={p.index} className="flex items-center gap-2 text-xs text-slate-300">
                  <div className="h-6 w-6 rounded bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-slate-900" />
                    )}
                  </div>
                  <span className="truncate font-medium text-white flex-1">{p.title || `Item #${p.index + 1}`}</span>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0">#{p.index + 1}</span>
                </div>
              ))}
              {previewExtraCount > 0 && (
                <p className="text-[11px] text-slate-400 italic pt-1 pl-1">
                  ...and {previewExtraCount} more products
                </p>
              )}
            </div>

            {isProcessing && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-amber-800/60 bg-amber-950/40 text-amber-300 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Notice: Import pipeline is currently active. Deleting rows will safely adjust remaining queue.</span>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  setDeletingSingleIndex(null);
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-bold text-white transition shadow-lg shadow-rose-950 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>
                  {deletingSingleIndex !== null
                    ? 'Delete Product'
                    : selectedRowIndices.size === rows.length
                    ? `Delete All (${rows.length})`
                    : `Delete (${selectedRowIndices.size})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Column Mapping Modal */}
      {showMappingModal && parseResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="h-5 w-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Excel Column Mapping</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMappingModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Match the columns from your uploaded Excel sheet to the required Printify product fields.
            </p>

            <div className="space-y-3.5 text-xs">
              {/* Title Mapping */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Product Title Column *</label>
                <select
                  value={columnMapping.titleColumn}
                  onChange={(e) => setColumnMapping({ ...columnMapping, titleColumn: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Select Title Column --</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description Mapping */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Description Column *</label>
                <select
                  value={columnMapping.descriptionColumn}
                  onChange={(e) => setColumnMapping({ ...columnMapping, descriptionColumn: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Select Description Column --</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tags Mapping */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Tags / Keywords Column</label>
                <select
                  value={columnMapping.tagsColumn}
                  onChange={(e) => setColumnMapping({ ...columnMapping, tagsColumn: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Auto-detect (Tags or Tag_01..13) --</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Design Image URL Mapping */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Design Image URL Column *</label>
                <select
                  value={columnMapping.imageColumn}
                  onChange={(e) => setColumnMapping({ ...columnMapping, imageColumn: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Select Design Image Column --</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price Column */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Price Column (Optional)</label>
                <select
                  value={columnMapping.priceColumn || ''}
                  onChange={(e) => setColumnMapping({ ...columnMapping, priceColumn: e.target.value || undefined })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Default Price (${defaultPrice.toFixed(2)}) --</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setShowMappingModal(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleApplyMapping(columnMapping)}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition cursor-pointer"
              >
                Apply Mapping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
