import React, { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Calendar,
  Layers,
  Eye,
  RefreshCw,
  Share2,
  FileText,
  Tag,
  Info,
  Sheet,
  Key,
  FolderOpen,
  ArrowRight,
  Database,
  Cloud,
  CheckSquare,
  Link2,
  Wand2,
  Sliders,
  RotateCcw,
  TrendingUp,
  Zap,
  BarChart2,
  ShieldCheck,
  CheckCheck,
  X,
} from 'lucide-react';
import {
  PinterestCsvRow,
  PINTEREST_CSV_HEADERS,
  PinterestGenerationOptions,
  PinterestAiAnalysis,
  PinterestAiOptimizeResultItem,
  PinterestAiOptimizeRequest,
  PinterestAiOptimizeItem,
} from '../types/pinterest';
import { UnifiedProductRecord } from '../types/unifiedWorkflow';
import {
  serializePinterestCsv,
  parsePinterestCsv,
  mapProductToPinterestPins,
  downloadCsvFile,
  SAMPLE_PINTEREST_CSV_ROWS,
  optimizePinterestPinsWithAi,
  localSummarizeDescription,
  localOptimizeTitle,
} from '../services/pinterestCsvService';
import {
  listSpreadsheets,
  listWorksheets,
  createPinterestSpreadsheet,
  exportPinterestPinsToSpreadsheet,
  readPinterestPinsFromSpreadsheet,
  getSpreadsheetInfo,
  extractSpreadsheetId,
  GoogleSpreadsheetRef,
  GoogleWorksheetRef,
} from '../services/unifiedGoogleService';

interface PinterestCsvWorkspaceProps {
  product?: UnifiedProductRecord;
  workflowProducts?: Record<string, UnifiedProductRecord>;
  googleToken?: string | null;
  googleEmail?: string;
  onConnectGoogle?: () => void;
  onOpenGoogleSettings?: () => void;
}

interface RowMetadata {
  isAiOptimized?: boolean;
  originalTitle?: string;
  originalDescription?: string;
  analysis?: PinterestAiAnalysis;
}

export const PinterestCsvWorkspace: React.FC<PinterestCsvWorkspaceProps> = ({
  product,
  workflowProducts,
  googleToken,
  googleEmail,
  onConnectGoogle,
  onOpenGoogleSettings,
}) => {
  // Current active rows in workspace
  const [rows, setRows] = useState<PinterestCsvRow[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [showRawPreview, setShowRawPreview] = useState<boolean>(false);
  const [copiedCsv, setCopiedCsv] = useState<boolean>(false);

  // Auto-generation options
  const [boardName, setBoardName] = useState<string>('Phone Cases');
  const [destinationLink, setDestinationLink] = useState<string>(
    'https://www.etsy.com/shop/CraftCasesStudio?ref=seller-platform-mcnav'
  );
  const [includeDesign, setIncludeDesign] = useState<boolean>(true);
  const [includePrimaryMockup, setIncludePrimaryMockup] = useState<boolean>(true);
  const [includeAllMockups, setIncludeAllMockups] = useState<boolean>(false);
  const [titleFormat, setTitleFormat] = useState<'product-title' | 'title-with-callout' | 'seo-focused'>('product-title');
  const [utmCampaign, setUtmCampaign] = useState<string>('phone_cases_q4');
  const [scheduleIntervalDays, setScheduleIntervalDays] = useState<number>(1);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [autoAiOptimizeOnPopulate, setAutoAiOptimizeOnPopulate] = useState<boolean>(true);

  // AI Optimization Settings & State
  const [isAiOptimizing, setIsAiOptimizing] = useState<boolean>(false);
  const [isSinglePinOptimizing, setIsSinglePinOptimizing] = useState<boolean>(false);
  const [aiProgress, setAiProgress] = useState<{ current: number; total: number; stage: string }>({
    current: 0,
    total: 0,
    stage: '',
  });
  const [aiOptions, setAiOptions] = useState<{
    maxDescriptionLength: number; // strictly max 700
    maxTitleLength: number;
    titleStyle: 'concise' | 'seo' | 'aesthetic' | 'punchy';
    tone: 'viral' | 'luxury' | 'modern' | 'minimalist';
  }>({
    maxDescriptionLength: 700,
    maxTitleLength: 80,
    titleStyle: 'concise',
    tone: 'viral',
  });
  const [showAiSettingsModal, setShowAiSettingsModal] = useState<boolean>(false);
  const [showAiDiffModal, setShowAiDiffModal] = useState<boolean>(false);
  const [aiDiffResults, setAiDiffResults] = useState<PinterestAiOptimizeResultItem[]>([]);
  const [selectedDiffIndices, setSelectedDiffIndices] = useState<Set<number>>(new Set());
  const [rowMetadata, setRowMetadata] = useState<Record<number, RowMetadata>>({});

  // Selected row for detail drawer/modal
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Derived current CSV serialization
  const currentSerializedCsv = useMemo(() => {
    return serializePinterestCsv(rows);
  }, [rows]);

  // Validation metrics
  const validationSummary = useMemo(() => {
    let titleWarnings = 0;
    let descWarnings = 0;
    let missingMedia = 0;
    let missingBoard = 0;
    let aiOptimizedCount = 0;

    rows.forEach((row, idx) => {
      if (!row.Title || row.Title.length > 100) titleWarnings++;
      if (row.Description && row.Description.length > 700) descWarnings++;
      if (!row['Media URL']) missingMedia++;
      if (!row['Pinterest board']) missingBoard++;
      if (rowMetadata[idx]?.isAiOptimized) aiOptimizedCount++;
    });

    return {
      total: rows.length,
      titleWarnings,
      descWarnings,
      missingMedia,
      missingBoard,
      aiOptimizedCount,
      isValid: missingMedia === 0 && missingBoard === 0,
    };
  }, [rows, rowMetadata]);

  // Handle uploading existing CSV
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setSuccessMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const res = parsePinterestCsv(content);
        if (res.errors.length > 0) {
          setUploadError(`CSV validation error: ${res.errors.join('; ')}`);
          return;
        }
        setRows(res.rows);
        setRowMetadata({});
        setSuccessMessage(`Successfully imported ${res.rows.length} Pinterest pins from ${file.name}!`);
        if (res.warnings.length > 0) {
          setUploadError(`Imported with warnings: ${res.warnings.slice(0, 3).join('; ')}`);
        }
      } catch (err: any) {
        setUploadError(`Failed to parse file: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Populate from current product
  const handleAutoPopulateFromProduct = async (targetProduct?: UnifiedProductRecord) => {
    const prod = targetProduct || product;
    if (!prod) {
      setUploadError('No product selected to populate pins from.');
      return;
    }

    const options: PinterestGenerationOptions = {
      boardName,
      defaultDestinationLink: destinationLink,
      includeDesignAsset: includeDesign,
      includePrimaryMockup: includePrimaryMockup,
      includeAllMockups: includeAllMockups,
      titleFormat,
      descriptionFormat: 'hook-and-tags',
      tagsAsKeywords: true,
      utmCampaign,
      startDate,
      scheduleIntervalDays,
      aiMaxDescriptionChars: aiOptions.maxDescriptionLength,
    };

    const generated = mapProductToPinterestPins(prod, options);
    if (generated.length === 0) {
      setUploadError('Could not generate pins: Ensure the product has artwork or generated mockups.');
      return;
    }

    // If auto AI optimization is enabled, run Gemini batch optimization on generated pins
    if (autoAiOptimizeOnPopulate) {
      setIsAiOptimizing(true);
      setAiProgress({ current: 0, total: generated.length, stage: 'AI optimizing generated pin titles & descriptions...' });
      try {
        const itemsToOptimize: PinterestAiOptimizeItem[] = generated.map((pin, i) => ({
          id: String(i),
          title: pin.Title,
          description: pin.Description,
          board: pin['Pinterest board'],
          keywords: pin.Keywords,
          productId: pin['Product ID'],
        }));

        const aiResponse = await optimizePinterestPinsWithAi(itemsToOptimize, {
          maxDescriptionLength: aiOptions.maxDescriptionLength,
          maxTitleLength: aiOptions.maxTitleLength,
          titleStyle: aiOptions.titleStyle,
          tone: aiOptions.tone,
        });

        const newMetadata: Record<number, RowMetadata> = {};
        const optimizedGenerated = generated.map((pin, i) => {
          const aiItem = aiResponse.results[i];
          if (aiItem) {
            newMetadata[i] = {
              isAiOptimized: true,
              originalTitle: pin.Title,
              originalDescription: pin.Description,
              analysis: aiItem.analysis,
            };
            return {
              ...pin,
              Title: aiItem.optimizedTitle,
              Description: aiItem.summarizedDescription,
            };
          }
          return pin;
        });

        setRows((prev) => [...optimizedGenerated, ...prev]);
        setRowMetadata((prev) => {
          const shifted: Record<number, RowMetadata> = {};
          const offset = optimizedGenerated.length;
          Object.entries(prev).forEach(([k, v]) => {
            shifted[Number(k) + offset] = v;
          });
          return { ...newMetadata, ...shifted };
        });

        setSuccessMessage(
          `Generated and AI-optimized ${generated.length} Pinterest pins for ${prod.productId} (${prod.designName})!`
        );
      } catch (err: any) {
        setRows((prev) => [...generated, ...prev]);
        setSuccessMessage(`Generated ${generated.length} Pinterest pins (Local format applied).`);
      } finally {
        setIsAiOptimizing(false);
      }
    } else {
      setRows((prev) => [...generated, ...prev]);
      setSuccessMessage(`Generated ${generated.length} Pinterest pin rows for ${prod.productId} (${prod.designName})!`);
    }
  };

  // Populate batch from all workflows
  const handlePopulateAllWorkflows = async () => {
    if (!workflowProducts) return;
    const allGenerated: PinterestCsvRow[] = [];

    Object.values(workflowProducts).forEach((prod) => {
      const options: PinterestGenerationOptions = {
        boardName,
        defaultDestinationLink: destinationLink,
        includeDesignAsset: includeDesign,
        includePrimaryMockup: includePrimaryMockup,
        includeAllMockups: includeAllMockups,
        titleFormat,
        descriptionFormat: 'hook-and-tags',
        tagsAsKeywords: true,
        utmCampaign,
        startDate,
        scheduleIntervalDays,
        aiMaxDescriptionChars: aiOptions.maxDescriptionLength,
      };
      const pins = mapProductToPinterestPins(prod, options);
      allGenerated.push(...pins);
    });

    if (allGenerated.length > 0) {
      setRows((prev) => [...allGenerated, ...prev]);
      setSuccessMessage(`Batch generated ${allGenerated.length} Pinterest pins from all active product workflows!`);
    }
  };

  // Batch AI Optimize selected or all pins
  const handleBatchAiOptimize = async (targetIndices?: number[]) => {
    const indicesToProcess =
      targetIndices && targetIndices.length > 0
        ? targetIndices
        : selectedIndices.size > 0
        ? Array.from(selectedIndices)
        : rows.map((_, i) => i);

    if (indicesToProcess.length === 0) {
      setUploadError('No pin rows available to optimize.');
      return;
    }

    setIsAiOptimizing(true);
    setUploadError(null);
    setSuccessMessage(null);
    setAiProgress({ current: 0, total: indicesToProcess.length, stage: 'Preparing pin records for Gemini analysis...' });

    try {
      const itemsToOptimize: PinterestAiOptimizeItem[] = indicesToProcess.map((idx) => {
        const r = rows[idx];
        return {
          id: String(idx),
          title: r.Title,
          description: r.Description,
          board: r['Pinterest board'],
          keywords: r.Keywords,
          productId: r['Product ID'],
        };
      });

      setAiProgress({
        current: 1,
        total: indicesToProcess.length,
        stage: 'Gemini 3.8 is analyzing context, summarizing descriptions (<= 700 chars), and optimizing titles...',
      });

      const batchSize = 10;
      const allResults: PinterestAiOptimizeResultItem[] = [];

      for (let i = 0; i < itemsToOptimize.length; i += batchSize) {
        const slice = itemsToOptimize.slice(i, i + batchSize);
        setAiProgress({
          current: Math.min(i + slice.length, itemsToOptimize.length),
          total: itemsToOptimize.length,
          stage: `Optimizing pins ${i + 1}-${Math.min(i + slice.length, itemsToOptimize.length)} of ${itemsToOptimize.length}...`,
        });

        const response = await optimizePinterestPinsWithAi(slice, {
          maxDescriptionLength: aiOptions.maxDescriptionLength,
          maxTitleLength: aiOptions.maxTitleLength,
          titleStyle: aiOptions.titleStyle,
          tone: aiOptions.tone,
        });

        allResults.push(...response.results);
      }

      setAiDiffResults(allResults);
      setSelectedDiffIndices(new Set(allResults.map((_, i) => i)));
      setShowAiDiffModal(true);
      setSuccessMessage(`AI analysis complete for ${allResults.length} pins! Review and apply changes.`);
    } catch (err: any) {
      setUploadError(`AI optimization failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsAiOptimizing(false);
    }
  };

  // Apply AI Diff Results to Workspace
  const handleApplyAiDiffResults = () => {
    if (aiDiffResults.length === 0) return;

    const updatedRows = [...rows];
    const updatedMeta = { ...rowMetadata };
    let appliedCount = 0;

    aiDiffResults.forEach((diff, diffIdx) => {
      if (!selectedDiffIndices.has(diffIdx)) return;
      const rowIndex = Number(diff.id);
      if (rowIndex >= 0 && rowIndex < updatedRows.length) {
        const prev = updatedRows[rowIndex];
        updatedMeta[rowIndex] = {
          isAiOptimized: true,
          originalTitle: prev.Title,
          originalDescription: prev.Description,
          analysis: diff.analysis,
        };
        updatedRows[rowIndex] = {
          ...prev,
          Title: diff.optimizedTitle,
          Description: diff.summarizedDescription,
        };
        appliedCount++;
      }
    });

    setRows(updatedRows);
    setRowMetadata(updatedMeta);
    setShowAiDiffModal(false);
    setSuccessMessage(`Applied AI optimization to ${appliedCount} Pinterest pins!`);
  };

  // Single Pin AI Optimize from Inspector
  const handleSinglePinAiOptimize = async (mode: 'full' | 'title-only' | 'desc-only') => {
    if (activeRowIndex === null || !rows[activeRowIndex]) return;
    const r = rows[activeRowIndex];
    setIsSinglePinOptimizing(true);
    setUploadError(null);

    try {
      const item: PinterestAiOptimizeItem = {
        id: String(activeRowIndex),
        title: r.Title,
        description: r.Description,
        board: r['Pinterest board'],
        keywords: r.Keywords,
        productId: r['Product ID'],
      };

      const response = await optimizePinterestPinsWithAi([item], {
        maxDescriptionLength: aiOptions.maxDescriptionLength,
        maxTitleLength: aiOptions.maxTitleLength,
        titleStyle: aiOptions.titleStyle,
        tone: aiOptions.tone,
      });

      if (response.results.length > 0) {
        const result = response.results[0];
        const updatedRows = [...rows];
        const prevTitle = r.Title;
        const prevDesc = r.Description;

        if (mode === 'full' || mode === 'title-only') {
          updatedRows[activeRowIndex].Title = result.optimizedTitle;
        }
        if (mode === 'full' || mode === 'desc-only') {
          updatedRows[activeRowIndex].Description = result.summarizedDescription;
        }

        setRows(updatedRows);
        setRowMetadata((prev) => {
          const currentMeta = prev[activeRowIndex];
          return {
            ...prev,
            [activeRowIndex]: {
              isAiOptimized: true,
              originalTitle: currentMeta?.originalTitle || prevTitle,
              originalDescription: currentMeta?.originalDescription || prevDesc,
              analysis: result.analysis,
            },
          };
        });

        setSuccessMessage(
          `AI optimized Pin #${activeRowIndex + 1}! (${result.summarizedDescription.length} chars description, ${result.optimizedTitle.length} chars title)`
        );
      }
    } catch (err: any) {
      setUploadError(`Single pin AI optimization failed: ${err.message}`);
    } finally {
      setIsSinglePinOptimizing(false);
    }
  };

  // Revert single pin to original
  const handleRevertPin = (index: number) => {
    const meta = rowMetadata[index];
    if (!meta || (!meta.originalTitle && !meta.originalDescription)) return;

    const updated = [...rows];
    if (meta.originalTitle) updated[index].Title = meta.originalTitle;
    if (meta.originalDescription) updated[index].Description = meta.originalDescription;
    setRows(updated);

    setRowMetadata((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });

    setSuccessMessage(`Reverted Pin #${index + 1} to original values.`);
  };

  // Add empty custom row
  const handleAddRow = () => {
    const newRow: PinterestCsvRow = {
      'Product ID': product?.productId || 'CASE-00001',
      Title: 'New Aesthetic Phone Case Pin Title',
      Description: 'Discover this unique artistic phone case. Sleek, dual-layer tough protection with vivid wrap art.',
      'Media URL': product?.mockups?.[0]?.localUrl || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=800',
      'Pinterest board': boardName,
      Thumbnail: '',
      Link: destinationLink,
      'Publish date': startDate,
      Keywords: 'aesthetic phone case, tough iphone case, gift for her',
    };
    setRows([newRow, ...rows]);
    setActiveRowIndex(0);
  };

  // Multi-select toggle row
  const handleToggleSelectRow = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Select all / Deselect all
  const handleToggleSelectAll = () => {
    if (selectedIndices.size === rows.length && rows.length > 0) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(rows.map((_, i) => i)));
    }
  };

  // Delete all selected rows
  const handleDeleteSelected = () => {
    if (selectedIndices.size === 0) return;
    const remaining = rows.filter((_, idx) => !selectedIndices.has(idx));
    setRows(remaining);
    setSelectedIndices(new Set());
    setActiveRowIndex(remaining.length > 0 ? 0 : null);
    setSuccessMessage(`Deleted ${selectedIndices.size} selected pin record${selectedIndices.size === 1 ? '' : 's'}.`);
  };

  // Clear all rows
  const handleClearAll = () => {
    if (rows.length === 0) return;
    const count = rows.length;
    setRows([]);
    setSelectedIndices(new Set());
    setActiveRowIndex(null);
    setRowMetadata({});
    setSuccessMessage(`Cleared all ${count} pin records.`);
  };

  // Remove single row
  const handleDeleteRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
    setSelectedIndices((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
    if (activeRowIndex === index) {
      setActiveRowIndex(rows.length > 1 ? 0 : null);
    } else if (activeRowIndex !== null && activeRowIndex > index) {
      setActiveRowIndex(activeRowIndex - 1);
    }
  };

  // Update specific field in a row
  const handleUpdateRowField = (index: number, field: keyof PinterestCsvRow, val: string) => {
    const updated = [...rows];
    updated[index] = {
      ...updated[index],
      [field]: val,
    };
    setRows(updated);
  };

  // Copy CSV to clipboard
  const handleCopyCsv = () => {
    navigator.clipboard.writeText(currentSerializedCsv);
    setCopiedCsv(true);
    setTimeout(() => setCopiedCsv(false), 2000);
  };

  // Download official CSV
  const handleDownloadCsv = () => {
    const filename = `pinterest_bulk_pins_${product?.productId || 'export'}_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCsvFile(currentSerializedCsv, filename);
  };

  // Reset to sample template
  const handleResetSample = () => {
    setRows(SAMPLE_PINTEREST_CSV_ROWS);
    setRowMetadata({});
    setSuccessMessage('Loaded Pinterest sample template.');
  };

  // Google Sheets Integration State
  const [spreadsheets, setSpreadsheets] = useState<GoogleSpreadsheetRef[]>([]);
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string>('');
  const [spreadsheetInputUrl, setSpreadsheetInputUrl] = useState<string>('');
  const [worksheets, setWorksheets] = useState<GoogleWorksheetRef[]>([]);
  const [selectedWorksheetTitle, setSelectedWorksheetTitle] = useState<string>('Pins');
  const [exportMode, setExportMode] = useState<'append' | 'overwrite'>('append');

  const [isLoadingSheets, setIsLoadingSheets] = useState<boolean>(false);
  const [isExportingToSheet, setIsExportingToSheet] = useState<boolean>(false);
  const [isImportingFromSheet, setIsImportingFromSheet] = useState<boolean>(false);
  const [isCreatingSheet, setIsCreatingSheet] = useState<boolean>(false);
  const [newSheetTitle, setNewSheetTitle] = useState<string>('');

  const [sheetSuccessMessage, setSheetSuccessMessage] = useState<string | null>(null);
  const [sheetErrorMessage, setSheetErrorMessage] = useState<string | null>(null);
  const [activeSheetUrl, setActiveSheetUrl] = useState<string | null>(null);
  const [activeSpreadsheetTitle, setActiveSpreadsheetTitle] = useState<string>('');

  // Auto-fetch spreadsheets when googleToken changes
  useEffect(() => {
    if (!googleToken) {
      setSpreadsheets([]);
      return;
    }

    const fetchSpreadsheets = async () => {
      setIsLoadingSheets(true);
      try {
        const list = await listSpreadsheets(googleToken, 'my-drive');
        setSpreadsheets(list);
        if (list.length > 0 && !selectedSpreadsheetId) {
          setSelectedSpreadsheetId(list[0].id);
          setActiveSpreadsheetTitle(list[0].name);
          setActiveSheetUrl(`https://docs.google.com/spreadsheets/d/${list[0].id}/edit`);
        }
      } catch (err: any) {
        console.error('Failed to list spreadsheets:', err);
      } finally {
        setIsLoadingSheets(false);
      }
    };

    fetchSpreadsheets();
  }, [googleToken]);

  // Load worksheets when selectedSpreadsheetId changes
  useEffect(() => {
    if (!googleToken || !selectedSpreadsheetId) {
      setWorksheets([]);
      return;
    }

    const fetchWorksheets = async () => {
      try {
        const sheets = await listWorksheets(googleToken, selectedSpreadsheetId);
        setWorksheets(sheets);
        if (sheets.length > 0) {
          const pinSheet = sheets.find(
            (s) =>
              s.title.toLowerCase().includes('pin') ||
              s.title.toLowerCase().includes('pinterest')
          );
          setSelectedWorksheetTitle(pinSheet ? pinSheet.title : sheets[0].title);
        }
      } catch (err: any) {
        console.error('Failed to list worksheets:', err);
      }
    };

    fetchWorksheets();
  }, [googleToken, selectedSpreadsheetId]);

  // Connect via pasted URL or raw Spreadsheet ID
  const handleConnectSpreadsheetByUrl = async () => {
    if (!googleToken) {
      onConnectGoogle?.();
      return;
    }
    const cleanId = extractSpreadsheetId(spreadsheetInputUrl);
    if (!cleanId) {
      setSheetErrorMessage('Please paste a valid Google Spreadsheet URL or ID.');
      return;
    }

    setIsLoadingSheets(true);
    setSheetErrorMessage(null);
    setSheetSuccessMessage(null);
    try {
      const info = await getSpreadsheetInfo(googleToken, cleanId);
      setSelectedSpreadsheetId(info.id);
      setActiveSpreadsheetTitle(info.title);
      setActiveSheetUrl(`https://docs.google.com/spreadsheets/d/${info.id}/edit`);
      setWorksheets(info.sheets);
      if (info.sheets.length > 0) {
        const pinSheet = info.sheets.find(
          (s: GoogleWorksheetRef) =>
            s.title.toLowerCase().includes('pin') ||
            s.title.toLowerCase().includes('pinterest')
        );
        setSelectedWorksheetTitle(pinSheet ? pinSheet.title : info.sheets[0].title);
      }

      setSpreadsheets((prev) => {
        if (prev.some((s) => s.id === info.id)) return prev;
        return [{ id: info.id, name: info.title }, ...prev];
      });

      setSheetSuccessMessage(`Connected to spreadsheet: "${info.title}" (${info.sheets.length} sheets found)`);
    } catch (err: any) {
      setSheetErrorMessage(`Could not access spreadsheet: ${err.message || 'Please check sharing permissions or URL'}`);
    } finally {
      setIsLoadingSheets(false);
    }
  };

  // Create brand new Pinterest spreadsheet
  const handleCreateNewSpreadsheet = async () => {
    if (!googleToken) {
      onConnectGoogle?.();
      return;
    }
    setIsCreatingSheet(true);
    setSheetErrorMessage(null);
    setSheetSuccessMessage(null);
    try {
      const title = newSheetTitle.trim() || `Pinterest Bulk Pins (${new Date().toISOString().split('T')[0]})`;
      const created = await createPinterestSpreadsheet(googleToken, title);
      setSpreadsheets((prev) => [{ id: created.id, name: created.title }, ...prev]);
      setSelectedSpreadsheetId(created.id);
      setActiveSpreadsheetTitle(created.title);
      setActiveSheetUrl(created.url);
      setSelectedWorksheetTitle(created.worksheetTitle);
      setWorksheets([{ id: 0, title: created.worksheetTitle, index: 0 }]);
      setNewSheetTitle('');
      setSheetSuccessMessage(`Created and connected new Pinterest spreadsheet: "${created.title}"!`);
    } catch (err: any) {
      setSheetErrorMessage(`Failed to create spreadsheet: ${err.message}`);
    } finally {
      setIsCreatingSheet(false);
    }
  };

  // Export pins to Google Sheet
  const handleExportToSheet = async () => {
    if (!googleToken) {
      onConnectGoogle?.();
      return;
    }
    const targetSpreadsheetId = selectedSpreadsheetId || extractSpreadsheetId(spreadsheetInputUrl);
    if (!targetSpreadsheetId) {
      setSheetErrorMessage('Please select or paste a Google Spreadsheet to export to.');
      return;
    }
    if (rows.length === 0) {
      setSheetErrorMessage('No Pinterest pins in workspace to export. Click "Auto-Populate" or add custom pins first.');
      return;
    }

    setIsExportingToSheet(true);
    setSheetErrorMessage(null);
    setSheetSuccessMessage(null);

    try {
      const targetWorksheet = selectedWorksheetTitle || 'Pins';
      const result = await exportPinterestPinsToSpreadsheet(
        googleToken,
        targetSpreadsheetId,
        targetWorksheet,
        rows,
        exportMode
      );
      setActiveSheetUrl(result.spreadsheetUrl);
      setSheetSuccessMessage(
        `Successfully exported ${result.count} Pinterest pins to "${activeSpreadsheetTitle || 'Google Sheet'}" [Tab: ${targetWorksheet}] (${exportMode === 'overwrite' ? 'Overwrote existing data rows' : 'Appended rows to sheet'})!`
      );
    } catch (err: any) {
      setSheetErrorMessage(`Export to Google Sheet failed: ${err.message}`);
    } finally {
      setIsExportingToSheet(false);
    }
  };

  // Import pins from Google Sheet
  const handleImportFromSheet = async () => {
    if (!googleToken) {
      onConnectGoogle?.();
      return;
    }
    const targetSpreadsheetId = selectedSpreadsheetId || extractSpreadsheetId(spreadsheetInputUrl);
    if (!targetSpreadsheetId) {
      setSheetErrorMessage('Please select or paste a Google Spreadsheet to import from.');
      return;
    }

    setIsImportingFromSheet(true);
    setSheetErrorMessage(null);
    setSheetSuccessMessage(null);

    try {
      const targetWorksheet = selectedWorksheetTitle || 'Pins';
      const imported = await readPinterestPinsFromSpreadsheet(
        googleToken,
        targetSpreadsheetId,
        targetWorksheet
      );
      if (imported.length === 0) {
        setSheetErrorMessage(`No pin rows found in "${targetWorksheet}". Make sure row 1 has headers and row 2+ has pin data.`);
        return;
      }
      setRows(imported);
      setRowMetadata({});
      setActiveRowIndex(0);
      setSheetSuccessMessage(`Successfully imported ${imported.length} Pinterest pins from Google Sheet [${targetWorksheet}]!`);
    } catch (err: any) {
      setSheetErrorMessage(`Import from Google Sheet failed: ${err.message}`);
    } finally {
      setIsImportingFromSheet(false);
    }
  };

  const activeRow = activeRowIndex !== null ? rows[activeRowIndex] : null;
  const activeRowMeta = activeRowIndex !== null ? rowMetadata[activeRowIndex] : null;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-rose-600 via-red-500 to-amber-500 p-0.5 shadow-md shadow-rose-500/20">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
                <Share2 className="h-5 w-5 text-rose-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Pinterest Bulk Pin CSV Generator</h2>
                <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-300">
                  Step 1: CSV Handler
                </span>
                <span className="flex items-center gap-1 rounded-full border border-purple-500/40 bg-purple-950/50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-300 shadow-sm">
                  <Sparkles className="h-3 w-3 text-purple-400" />
                  <span>AI Powered</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Generate, edit, and validate RFC-4180 bulk creation CSV files with Gemini-powered title optimization and description summarization (max 700 chars).
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Google Sheets Status Pill */}
            {googleToken ? (
              <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-300">
                <Sheet className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-medium truncate max-w-[140px]">{googleEmail || 'Google Connected'}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
            ) : (
              <button
                type="button"
                onClick={onConnectGoogle}
                className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 hover:bg-amber-900/50 px-3 py-1.5 text-xs font-semibold text-amber-300 transition cursor-pointer"
              >
                <Key className="h-3.5 w-3.5 text-amber-400" />
                <span>Connect Google Sheets</span>
              </button>
            )}

            <label className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition cursor-pointer">
              <Upload className="h-3.5 w-3.5 text-indigo-400" />
              <span>Import CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handleCopyCsv}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition cursor-pointer"
            >
              {copiedCsv ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
              <span>{copiedCsv ? 'Copied!' : 'Copy CSV'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportToSheet}
              disabled={isExportingToSheet || rows.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/60 hover:bg-emerald-900/70 disabled:opacity-50 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition shadow-md shadow-emerald-950/30 cursor-pointer"
            >
              {isExportingToSheet ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              ) : (
                <Sheet className="h-3.5 w-3.5 text-emerald-400" />
              )}
              <span>{isExportingToSheet ? 'Exporting...' : 'Export to Sheets'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={rows.length === 0}
              className="flex items-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition shadow-md shadow-rose-950 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>Download CSV ({rows.length} Pins)</span>
            </button>
          </div>
        </div>

        {/* Notifications */}
        {uploadError && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-800/60 bg-rose-950/40 p-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <p>{uploadError}</p>
          </div>
        )}
        {successMessage && (
          <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-emerald-800/60 bg-emerald-950/40 p-3 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <p>{successMessage}</p>
          </div>
        )}

        {/* Status Metrics Ribbon */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <span className="text-[10px] font-semibold uppercase text-slate-400">Total Pins</span>
            <p className="mt-0.5 text-xl font-bold text-white">{rows.length}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <span className="text-[10px] font-semibold uppercase text-purple-400 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              <span>AI Optimized</span>
            </span>
            <p className="mt-0.5 text-xl font-bold text-purple-300">
              {validationSummary.aiOptimizedCount} <span className="text-xs font-normal text-slate-500">/ {rows.length}</span>
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <span className="text-[10px] font-semibold uppercase text-slate-400">Description Rule</span>
            <p className="mt-0.5 text-xs font-semibold text-emerald-400">Max 700 chars compliant</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <span className="text-[10px] font-semibold uppercase text-slate-400">Format Health</span>
            <p className={`mt-0.5 text-xs font-semibold ${validationSummary.isValid && validationSummary.descWarnings === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {validationSummary.descWarnings > 0
                ? `${validationSummary.descWarnings} pins exceed 700 chars`
                : validationSummary.isValid
                ? '100% Valid & Formatted'
                : 'Missing required fields'}
            </p>
          </div>
        </div>

        {/* AI Bulk Optimization Feature Bar */}
        <div className="mt-5 rounded-xl border border-purple-500/30 bg-gradient-to-r from-purple-950/50 via-slate-900 to-indigo-950/50 p-4 shadow-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600/30 border border-purple-500/40 text-purple-300">
                <Wand2 className="h-4 w-4 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-purple-200">
                    AI Pinterest Copy &amp; Summarization Engine
                  </h3>
                  <span className="rounded bg-purple-500/20 text-[10px] font-mono font-medium text-purple-300 px-1.5 py-0.5 border border-purple-500/30">
                    Gemini 3.8 Flash
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Automatically summarize long descriptions to &lt;= 700 characters, optimize titles for high search CTR, and evaluate contextual coherence.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAiSettingsModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition cursor-pointer"
              >
                <Sliders className="h-3.5 w-3.5 text-purple-400" />
                <span>AI Tuning ({aiOptions.maxDescriptionLength}ch / {aiOptions.titleStyle})</span>
              </button>

              <button
                type="button"
                onClick={() => handleBatchAiOptimize()}
                disabled={isAiOptimizing || rows.length === 0}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 px-4 py-1.5 text-xs font-bold text-white transition shadow-md shadow-purple-950 cursor-pointer"
              >
                {isAiOptimizing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>
                  {isAiOptimizing
                    ? 'AI Analyzing & Optimizing...'
                    : selectedIndices.size > 0
                    ? `AI Optimize Selected (${selectedIndices.size} Pins)`
                    : `AI Optimize All (${rows.length} Pins)`}
                </span>
              </button>
            </div>
          </div>

          {/* AI Progress Bar if active */}
          {isAiOptimizing && (
            <div className="rounded-lg border border-purple-500/30 bg-slate-950/80 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-purple-400" />
                  <span>{aiProgress.stage}</span>
                </span>
                <span className="font-mono text-purple-400 font-bold">
                  {aiProgress.current} / {aiProgress.total} Pins
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300 rounded-full"
                  style={{
                    width: `${aiProgress.total > 0 ? (aiProgress.current / aiProgress.total) * 100 : 30}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Auto-populate Generator Controls */}
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-rose-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Automated Pin Population Settings
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-purple-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAiOptimizeOnPopulate}
                  onChange={(e) => setAutoAiOptimizeOnPopulate(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 accent-purple-500"
                />
                <span className="font-medium">Auto-apply AI summarization (max 700 chars) on generate</span>
              </label>
              <button
                type="button"
                onClick={handleResetSample}
                className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
              >
                Load Sample Rows
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Pinterest Board Name *
              </label>
              <input
                type="text"
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                placeholder="e.g. Aesthetic Tech & Accessories"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Destination Product Link *
              </label>
              <input
                type="url"
                value={destinationLink}
                onChange={(e) => setDestinationLink(e.target.value)}
                placeholder="https://myshop.com/products/case"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Pin Title Style
              </label>
              <select
                value={titleFormat}
                onChange={(e) => setTitleFormat(e.target.value as any)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none"
              >
                <option value="product-title">Direct Product / Design Title</option>
                <option value="title-with-callout">On Device Callout ("On Device • Model | Title")</option>
                <option value="seo-focused">SEO Focused ("Niche • Title")</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                UTM Campaign Tag
              </label>
              <input
                type="text"
                value={utmCampaign}
                onChange={(e) => setUtmCampaign(e.target.value)}
                placeholder="e.g. holiday_cases_2026"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Media Inclusion Checkboxes */}
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDesign}
                onChange={(e) => setIncludeDesign(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 accent-rose-500"
              />
              <span>Generate Design Art Pin</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includePrimaryMockup}
                onChange={(e) => setIncludePrimaryMockup(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 accent-rose-500"
              />
              <span>Generate Primary Lifestyle Mockup Pin</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAllMockups}
                onChange={(e) => setIncludeAllMockups(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 accent-rose-500"
              />
              <span>Generate All Mockup Angles (Slots 1-6)</span>
            </label>
          </div>

          {/* Trigger Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleAutoPopulateFromProduct()}
              disabled={isAiOptimizing}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition shadow-md shadow-rose-950 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Auto-Populate Pins from Current Product ({product?.productId || 'Active'})</span>
            </button>

            {workflowProducts && Object.keys(workflowProducts).length > 1 && (
              <button
                type="button"
                onClick={handlePopulateAllWorkflows}
                disabled={isAiOptimizing}
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                <Layers className="h-3.5 w-3.5 text-indigo-400" />
                <span>Batch Populate from All Active Workflows</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 transition cursor-pointer ml-auto"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Custom Row</span>
            </button>
          </div>
        </div>
      </div>

      {/* Google Sheets Live Export & Sync Card */}
      <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 p-0.5 shadow-md shadow-emerald-500/20">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
                <Sheet className="h-4 w-4 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Google Spreadsheet Live Export &amp; Sync</h3>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Direct Integration
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Connect your Pinterest CSV pin records directly with any Google Spreadsheet to export, update, or import bulk pins.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {googleToken ? (
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-300 font-medium">
                  Connected: {googleEmail || 'Active'}
                </span>
                {onOpenGoogleSettings && (
                  <button
                    type="button"
                    onClick={onOpenGoogleSettings}
                    className="rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1 text-[11px] text-slate-300 transition"
                  >
                    OAuth Settings
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onConnectGoogle}
                className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/50 hover:bg-amber-900/60 px-3.5 py-1.5 text-xs font-semibold text-amber-300 transition cursor-pointer shadow-sm"
              >
                <Key className="h-3.5 w-3.5 text-amber-400" />
                <span>Connect Google Account</span>
              </button>
            )}
          </div>
        </div>

        {/* Spreadsheet Selector & URL Connect Section */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Option 1: Paste Spreadsheet Link or ID */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Option 1: Paste Spreadsheet URL or ID</span>
              </label>
              <span className="text-[10px] text-slate-500 font-mono">e.g. /d/1BxiMVs...</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={spreadsheetInputUrl}
                onChange={(e) => setSpreadsheetInputUrl(e.target.value)}
                placeholder="Paste Google Spreadsheet URL or raw ID here..."
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={handleConnectSpreadsheetByUrl}
                disabled={isLoadingSheets || !spreadsheetInputUrl.trim()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
              >
                {isLoadingSheets ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>Connect</span>
              </button>
            </div>
          </div>

          {/* Option 2: Select from Google Drive */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5 text-indigo-400" />
                <span>Option 2: Select from Google Drive</span>
              </label>
              {selectedSpreadsheetId && (
                <span className="text-[10px] text-emerald-400 font-mono">
                  ID: {selectedSpreadsheetId.slice(0, 8)}...
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <select
                value={selectedSpreadsheetId}
                onChange={(e) => {
                  setSelectedSpreadsheetId(e.target.value);
                  const found = spreadsheets.find((s) => s.id === e.target.value);
                  if (found) {
                    setActiveSpreadsheetTitle(found.name);
                    setActiveSheetUrl(`https://docs.google.com/spreadsheets/d/${found.id}/edit`);
                  }
                }}
                disabled={isLoadingSheets || spreadsheets.length === 0}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                {spreadsheets.length === 0 ? (
                  <option value="">
                    {googleToken ? 'No spreadsheets found in Drive' : 'Connect Google account to list spreadsheets'}
                  </option>
                ) : (
                  spreadsheets.map((sheet) => (
                    <option key={sheet.id} value={sheet.id}>
                      {sheet.name}
                    </option>
                  ))
                )}
              </select>

              <button
                type="button"
                onClick={handleCreateNewSpreadsheet}
                disabled={isCreatingSheet || !googleToken}
                title="Create a new Google Spreadsheet formatted with Pinterest columns"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                {isCreatingSheet ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-emerald-400" />
                )}
                <span>New Sheet</span>
              </button>
            </div>
          </div>
        </div>

        {/* Worksheet / Tab & Export Mode Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400">Target Worksheet/Tab:</span>
              <select
                value={selectedWorksheetTitle}
                onChange={(e) => setSelectedWorksheetTitle(e.target.value)}
                disabled={worksheets.length === 0}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                {worksheets.length === 0 ? (
                  <option value="Pins">Pins (Auto-created)</option>
                ) : (
                  worksheets.map((ws) => (
                    <option key={ws.id} value={ws.title}>
                      {ws.title}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400">Sync Mode:</span>
              <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setExportMode('append')}
                  className={`px-2.5 py-0.5 rounded font-medium transition cursor-pointer ${
                    exportMode === 'append'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Append Rows
                </button>
                <button
                  type="button"
                  onClick={() => setExportMode('overwrite')}
                  className={`px-2.5 py-0.5 rounded font-medium transition cursor-pointer ${
                    exportMode === 'overwrite'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Overwrite / Replace
                </button>
              </div>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleImportFromSheet}
              disabled={isImportingFromSheet || !selectedSpreadsheetId}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 px-3 py-1.5 text-xs font-semibold text-slate-300 transition cursor-pointer"
            >
              {isImportingFromSheet ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-400" />
              ) : (
                <Upload className="h-3.5 w-3.5 text-indigo-400" />
              )}
              <span>Import from Sheet</span>
            </button>

            <button
              type="button"
              onClick={handleExportToSheet}
              disabled={isExportingToSheet || rows.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 px-4 py-1.5 text-xs font-semibold text-white transition shadow-md shadow-emerald-950 cursor-pointer"
            >
              {isExportingToSheet ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sheet className="h-3.5 w-3.5" />
              )}
              <span>Export {rows.length} Pins to Spreadsheet</span>
            </button>

            {activeSheetUrl && (
              <a
                href={activeSheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-950/40 hover:bg-emerald-900/40 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 transition cursor-pointer"
              >
                <span>View Sheet</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Main Table & Editor Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Interactive Data Grid (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-rose-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    CSV Pin Records ({rows.length})
                  </h3>
                </div>
                {rows.length > 0 && (
                  <span className="text-[11px] text-slate-500 font-mono">
                    {selectedIndices.size > 0 ? `(${selectedIndices.size} selected)` : ''}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {selectedIndices.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleBatchAiOptimize()}
                      disabled={isAiOptimizing}
                      className="flex items-center gap-1.5 rounded-lg bg-purple-600/90 hover:bg-purple-500 text-white px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer shadow-sm shadow-purple-950"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>AI Optimize ({selectedIndices.size})</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className="flex items-center gap-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer shadow-sm shadow-rose-950"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Delete ({selectedIndices.size})</span>
                    </button>
                  </>
                )}

                {rows.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-rose-300 hover:border-rose-800/50 transition cursor-pointer"
                  >
                    Clear All
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowRawPreview(!showRawPreview)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition cursor-pointer"
                >
                  {showRawPreview ? 'Show Visual Table' : 'Show Raw CSV Text'}
                </button>
              </div>
            </div>

            {showRawPreview ? (
              <div className="p-4 bg-slate-950 font-mono text-xs text-slate-300 overflow-x-auto max-h-[500px]">
                <pre className="select-all">{currentSerializedCsv}</pre>
              </div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500">
                  <FileSpreadsheet className="h-6 w-6 text-slate-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">No Pinterest Pins in Workspace</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Generate pins from your current design &amp; mockups above, import a CSV, or add custom pins manually.
                  </p>
                </div>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleAutoPopulateFromProduct()}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-950 transition cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Generate Pins from Active Product</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Single Pin</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-300 border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3 w-8">
                        <input
                          type="checkbox"
                          checked={selectedIndices.size === rows.length && rows.length > 0}
                          onChange={handleToggleSelectAll}
                          title="Select all / Deselect all"
                          className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 accent-rose-500 cursor-pointer"
                        />
                      </th>
                      <th className="py-2.5 px-2">#</th>
                      <th className="py-2.5 px-3">Product ID</th>
                      <th className="py-2.5 px-3">Media</th>
                      <th className="py-2.5 px-3">Title</th>
                      <th className="py-2.5 px-3">Description (Max 700ch)</th>
                      <th className="py-2.5 px-3">AI Quality</th>
                      <th className="py-2.5 px-3">Board</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {rows.map((row, idx) => {
                      const isSelected = activeRowIndex === idx;
                      const isChecked = selectedIndices.has(idx);
                      const meta = rowMetadata[idx];
                      const isDescTooLong = row.Description && row.Description.length > 700;
                      const isTitleTooLong = row.Title && row.Title.length > 100;

                      return (
                        <tr
                          key={idx}
                          onClick={() => setActiveRowIndex(idx)}
                          className={`cursor-pointer transition ${
                            isChecked
                              ? 'bg-rose-950/40 text-white'
                              : isSelected
                              ? 'bg-rose-950/20 text-white'
                              : 'hover:bg-slate-800/40 text-slate-300'
                          }`}
                        >
                          <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSelectRow(idx)}
                              className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 accent-rose-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-2 font-mono text-[10px] text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-mono text-[11px] font-semibold text-indigo-300 bg-indigo-950/60 border border-indigo-800/50 px-2 py-0.5 rounded">
                              {row['Product ID'] || product?.productId || 'CASE-00001'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {row['Media URL'] ? (
                              <div className="h-10 w-8 rounded overflow-hidden border border-slate-700 bg-slate-950 shrink-0">
                                <img
                                  src={row['Media URL']}
                                  alt="Pin Preview"
                                  className="h-full w-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              </div>
                            ) : (
                              <span className="text-[10px] text-rose-400">No Image</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 max-w-[170px]">
                            <p className="font-semibold text-white truncate" title={row.Title}>
                              {row.Title || <span className="text-slate-500 italic">Untitled</span>}
                            </p>
                            <span className={`text-[10px] font-mono ${isTitleTooLong ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                              {row.Title.length}/100 chars
                            </span>
                          </td>
                          <td className="py-2.5 px-3 max-w-[220px]">
                            <p className="text-[11px] text-slate-300 line-clamp-2" title={row.Description}>
                              {row.Description || <span className="text-amber-400/80 italic">No description</span>}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className={`text-[10px] font-mono ${
                                  isDescTooLong
                                    ? 'text-rose-400 font-bold bg-rose-950/50 px-1 rounded border border-rose-800'
                                    : 'text-emerald-400'
                                }`}
                              >
                                {row.Description.length}/700 chars
                              </span>
                              {isDescTooLong && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveRowIndex(idx);
                                    handleSinglePinAiOptimize('desc-only');
                                  }}
                                  className="text-[9px] text-purple-300 hover:text-purple-200 underline cursor-pointer"
                                >
                                  ✨ Summarize
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {meta?.isAiOptimized ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-purple-950/70 border border-purple-500/40 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                                <Sparkles className="h-2.5 w-2.5 text-purple-400" />
                                <span>{meta.analysis?.coherenceScore || 96}% Coherence</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500">Standard</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="rounded bg-slate-950 border border-slate-800 px-2 py-0.5 text-[10px] text-slate-300 truncate max-w-[110px] block">
                              {row['Pinterest board']}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRow(idx);
                              }}
                              title="Delete Pin Row"
                              className="rounded p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right: Active Row Quick Inspector / Editor */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Pin Inspector {activeRowIndex !== null ? `(#${activeRowIndex + 1})` : ''}
                </h3>
                {activeRowMeta?.isAiOptimized && (
                  <span className="rounded-full bg-purple-500/20 text-[10px] font-semibold text-purple-300 px-2 py-0.5 border border-purple-500/30">
                    AI Enhanced ✓
                  </span>
                )}
              </div>
              {activeRow && (
                <span className="text-[11px] text-rose-300 font-mono truncate max-w-[120px]">
                  {activeRow['Pinterest board']}
                </span>
              )}
            </div>

            {activeRow ? (
              <div className="space-y-4 text-xs">
                {/* Media Image Preview */}
                {activeRow['Media URL'] && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-2 flex items-center gap-3">
                    <img
                      src={activeRow['Media URL']}
                      alt="Pin Asset"
                      className="h-16 w-12 rounded object-cover border border-slate-700"
                    />
                    <div className="overflow-hidden space-y-1 flex-1">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase">Image Asset URL:</p>
                      <a
                        href={activeRow['Media URL']}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-indigo-400 hover:underline truncate block"
                      >
                        {activeRow['Media URL']}
                      </a>
                    </div>
                  </div>
                )}

                {/* AI Pin Coherence & Actions Box */}
                <div className="rounded-xl border border-purple-500/30 bg-purple-950/30 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                      <span className="font-bold text-purple-200 text-xs">AI Copy Refinement</span>
                    </div>
                    {activeRowMeta?.isAiOptimized && activeRowMeta.originalTitle && (
                      <button
                        type="button"
                        onClick={() => handleRevertPin(activeRowIndex!)}
                        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-300 cursor-pointer"
                        title="Revert back to pre-AI values"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Revert</span>
                      </button>
                    )}
                  </div>

                  {/* Character Limits Progress Meters */}
                  <div className="space-y-2 pt-1">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Description Length (Max 700):</span>
                        <span
                          className={`font-mono font-semibold ${
                            activeRow.Description.length > 700 ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {activeRow.Description.length} / 700 chars
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            activeRow.Description.length > 700
                              ? 'bg-rose-500'
                              : activeRow.Description.length > 550
                              ? 'bg-amber-400'
                              : 'bg-emerald-500'
                          }`}
                          style={{
                            width: `${Math.min((activeRow.Description.length / 700) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Title Length (Recommended &le; 80):</span>
                        <span
                          className={`font-mono font-semibold ${
                            activeRow.Title.length > 100 ? 'text-rose-400' : 'text-indigo-300'
                          }`}
                        >
                          {activeRow.Title.length} / 100 chars
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            activeRow.Title.length > 100
                              ? 'bg-rose-500'
                              : activeRow.Title.length > 80
                              ? 'bg-amber-400'
                              : 'bg-indigo-500'
                          }`}
                          style={{
                            width: `${Math.min((activeRow.Title.length / 100) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* AI Quick Actions */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSinglePinAiOptimize('desc-only')}
                      disabled={isSinglePinOptimizing}
                      className="flex items-center justify-center gap-1 rounded-lg border border-purple-500/40 bg-purple-900/40 hover:bg-purple-800/50 text-purple-200 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 cursor-pointer"
                    >
                      {isSinglePinOptimizing ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      <span>Summarize &le; 700ch</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSinglePinAiOptimize('title-only')}
                      disabled={isSinglePinOptimizing}
                      className="flex items-center justify-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-900/40 hover:bg-indigo-800/50 text-indigo-200 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 cursor-pointer"
                    >
                      {isSinglePinOptimizing ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Wand2 className="h-3 w-3" />
                      )}
                      <span>Optimize Title</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSinglePinAiOptimize('full')}
                    disabled={isSinglePinOptimizing}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white py-1.5 text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isSinglePinOptimizing ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    <span>Full AI Context Analysis &amp; Polish</span>
                  </button>

                  {/* AI Analysis Card Details */}
                  {activeRowMeta?.analysis && (
                    <div className="rounded-lg bg-slate-950/80 border border-purple-500/20 p-2.5 space-y-1.5 mt-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Contextual Coherence:</span>
                        <span className="font-bold text-emerald-400 font-mono">
                          {activeRowMeta.analysis.coherenceScore}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Keyword Relevance:</span>
                        <span className="font-bold text-purple-300 font-mono">
                          {activeRowMeta.analysis.relevanceScore}%
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-300 italic pt-1 border-t border-slate-800">
                        "{activeRowMeta.analysis.summaryNote}"
                      </p>
                      {activeRowMeta.analysis.extractedHooks && activeRowMeta.analysis.extractedHooks.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {activeRowMeta.analysis.extractedHooks.map((h, i) => (
                            <span
                              key={i}
                              className="rounded bg-purple-950/80 text-[9px] text-purple-300 px-1.5 py-0.5 border border-purple-800/40"
                            >
                              #{h}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Edit Product ID */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Product ID</label>
                  <input
                    type="text"
                    value={activeRow['Product ID'] || ''}
                    onChange={(e) => handleUpdateRowField(activeRowIndex!, 'Product ID', e.target.value)}
                    placeholder="e.g. CASE-00001"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none font-mono"
                  />
                </div>

                {/* Edit Title */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-300">Title</label>
                    <span className={`text-[10px] font-mono ${activeRow.Title.length > 100 ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>
                      {activeRow.Title.length}/100 chars
                    </span>
                  </div>
                  <input
                    type="text"
                    value={activeRow.Title}
                    onChange={(e) => handleUpdateRowField(activeRowIndex!, 'Title', e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>

                {/* Edit Description */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-300">Description (Max 700 chars)</label>
                    <span className={`text-[10px] font-mono ${activeRow.Description.length > 700 ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                      {activeRow.Description.length}/700 chars
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={activeRow.Description}
                    onChange={(e) => handleUpdateRowField(activeRowIndex!, 'Description', e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>

                {/* Edit Media URL */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Media URL</label>
                  <input
                    type="url"
                    value={activeRow['Media URL']}
                    onChange={(e) => handleUpdateRowField(activeRowIndex!, 'Media URL', e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none font-mono"
                  />
                </div>

                {/* Edit Board */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Pinterest Board</label>
                  <input
                    type="text"
                    value={activeRow['Pinterest board']}
                    onChange={(e) => handleUpdateRowField(activeRowIndex!, 'Pinterest board', e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>

                {/* Edit Link */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Destination Link</label>
                  <input
                    type="url"
                    value={activeRow.Link}
                    onChange={(e) => handleUpdateRowField(activeRowIndex!, 'Link', e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none font-mono"
                  />
                </div>

                {/* Edit Keywords */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Keywords (Comma-separated)
                  </label>
                  <textarea
                    rows={2}
                    value={activeRow.Keywords}
                    onChange={(e) => handleUpdateRowField(activeRowIndex!, 'Keywords', e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>

                {/* Publish Date */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Publish Date (Optional Scheduled Date)
                  </label>
                  <input
                    type="date"
                    value={activeRow['Publish date']}
                    onChange={(e) => handleUpdateRowField(activeRowIndex!, 'Publish date', e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-500 space-y-2">
                <FileText className="h-8 w-8 mx-auto text-slate-600" />
                <p>Select a pin row from the table to inspect, edit, or run AI optimization.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Settings Tuning Modal */}
      {showAiSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-purple-500/30 bg-slate-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="h-5 w-5 text-purple-400" />
                <h3 className="text-sm font-bold text-white">AI Copy Tuning Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAiSettingsModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Max Description Length Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <label className="font-semibold text-slate-300">Max Description Length</label>
                  <span className="font-mono font-bold text-purple-400">
                    {aiOptions.maxDescriptionLength} characters
                  </span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="700"
                  step="25"
                  value={aiOptions.maxDescriptionLength}
                  onChange={(e) =>
                    setAiOptions((prev) => ({
                      ...prev,
                      maxDescriptionLength: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-purple-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>200 chars (Punchy)</span>
                  <span className="text-purple-400 font-medium">700 chars (Max Allowed)</span>
                </div>
              </div>

              {/* Title Style Selector */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">Title Optimization Style</label>
                <select
                  value={aiOptions.titleStyle}
                  onChange={(e) =>
                    setAiOptions((prev) => ({
                      ...prev,
                      titleStyle: e.target.value as any,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="concise">Concise &amp; Punchy (Clean design title, removes clutter)</option>
                  <option value="seo">SEO &amp; Search Keyword Rich (High Pinterest discovery)</option>
                  <option value="aesthetic">Aesthetic &amp; Artistic (Emphasis on theme and vibe)</option>
                  <option value="punchy">Ultra-Short Hook (&le; 50 chars)</option>
                </select>
              </div>

              {/* Copy Tone Selector */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">Marketing &amp; Audience Tone</label>
                <select
                  value={aiOptions.tone}
                  onChange={(e) =>
                    setAiOptions((prev) => ({
                      ...prev,
                      tone: e.target.value as any,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="viral">Viral &amp; High-Converting E-commerce</option>
                  <option value="luxury">Luxury &amp; Boutique Aesthetic</option>
                  <option value="modern">Modern Tech &amp; Everyday Protection</option>
                  <option value="minimalist">Minimalist &amp; Understated</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setShowAiSettingsModal(false)}
                className="rounded-lg bg-purple-600 hover:bg-purple-500 px-4 py-2 text-xs font-semibold text-white transition cursor-pointer"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Diff / Review Modal */}
      {showAiDiffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-purple-500/40 bg-slate-900 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 p-5 bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600/30 border border-purple-500/40 text-purple-300">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Review AI Optimizations</h3>
                  <p className="text-xs text-slate-400">
                    Gemini 3.8 summarized descriptions (under 700 chars) and optimized titles. Select pins to apply.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDiffIndices.size === aiDiffResults.length) {
                      setSelectedDiffIndices(new Set());
                    } else {
                      setSelectedDiffIndices(new Set(aiDiffResults.map((_, i) => i)));
                    }
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1 text-xs text-slate-300 transition"
                >
                  {selectedDiffIndices.size === aiDiffResults.length ? 'Deselect All' : 'Select All'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAiDiffModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Diff List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {aiDiffResults.map((diff, diffIdx) => {
                const isChecked = selectedDiffIndices.has(diffIdx);
                const originalRow = rows[Number(diff.id)];

                return (
                  <div
                    key={diffIdx}
                    className={`rounded-xl border p-4 transition ${
                      isChecked
                        ? 'border-purple-500/50 bg-slate-950/70'
                        : 'border-slate-800 bg-slate-950/30 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedDiffIndices((prev) => {
                              const next = new Set(prev);
                              if (next.has(diffIdx)) next.delete(diffIdx);
                              else next.add(diffIdx);
                              return next;
                            });
                          }}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-purple-500 cursor-pointer"
                        />
                        <span className="font-mono text-xs font-bold text-indigo-300 bg-indigo-950/60 border border-indigo-800/50 px-2 py-0.5 rounded">
                          Pin #{Number(diff.id) + 1} ({originalRow?.['Product ID'] || 'Item'})
                        </span>
                        {originalRow?.['Pinterest board'] && (
                          <span className="text-[11px] text-slate-400">
                            Board: <strong className="text-slate-300">{originalRow['Pinterest board']}</strong>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-2.5 py-0.5 text-[10px] font-semibold">
                          {diff.analysis.coherenceScore}% Coherence
                        </span>
                        <span className="rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300 px-2.5 py-0.5 text-[10px] font-semibold">
                          {diff.analysis.relevanceScore}% Relevance
                        </span>
                      </div>
                    </div>

                    {/* Side-by-side diff */}
                    <div className="grid gap-4 md:grid-cols-2 text-xs">
                      {/* Before Column */}
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase text-slate-500">Original</span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Title: {diff.originalTitle.length}ch | Desc: {diff.originalDescription.length}ch
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-300">{diff.originalTitle}</p>
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-3">{diff.originalDescription}</p>
                        </div>
                      </div>

                      {/* After Column */}
                      <div className="rounded-lg border border-purple-500/40 bg-purple-950/30 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase text-purple-300 flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-purple-400" />
                            <span>AI Optimized</span>
                          </span>
                          <span className="text-[10px] font-mono font-bold text-emerald-400">
                            Title: {diff.titleCharCount}ch | Desc: {diff.descriptionCharCount}/700ch
                          </span>
                        </div>
                        <div>
                          <p className="font-bold text-white">{diff.optimizedTitle}</p>
                          <p className="text-[11px] text-purple-100 mt-1">{diff.summarizedDescription}</p>
                        </div>
                      </div>
                    </div>

                    {/* AI Analysis rationale note */}
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <p className="text-slate-400 italic">
                        <strong>AI Insight:</strong> {diff.analysis.summaryNote}
                      </p>
                      {diff.analysis.extractedHooks && diff.analysis.extractedHooks.length > 0 && (
                        <div className="flex gap-1">
                          {diff.analysis.extractedHooks.map((h, i) => (
                            <span key={i} className="text-[9px] bg-slate-900 text-purple-300 px-1.5 py-0.5 rounded border border-slate-800">
                              #{h}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-800 p-4 bg-slate-950/60">
              <span className="text-xs text-slate-400">
                Selected <strong className="text-white">{selectedDiffIndices.size}</strong> of {aiDiffResults.length} pin optimizations
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAiDiffModal(false)}
                  className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyAiDiffResults}
                  disabled={selectedDiffIndices.size === 0}
                  className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 px-5 py-2 text-xs font-bold text-white transition shadow-md shadow-purple-950 cursor-pointer"
                >
                  Apply Selected Changes ({selectedDiffIndices.size})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
