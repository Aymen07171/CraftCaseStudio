import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  UploadCloud,
  CircleDollarSign,
  Calculator,
  Info,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  Trash2,
  Layers,
  Sparkles,
  ShoppingBag,
  FileSpreadsheet,
  Upload,
  FolderDown,
  Copy,
  Check,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import { GeneratedDesign } from '../design-studio/types';
import { UnifiedProductRecord } from '../types/unifiedWorkflow';
import {
  applyEtsyCountryDefaults,
  calculatePrice,
  createPricingForProduct,
  formatUsd,
  normalizePricing,
  PRICING_SCENARIOS,
  ProductPricing,
  requiredSellingPrice,
  saveEtsyFeeDefaults,
} from '../utils/printifyPricing';
import {
  getStoredPrintifyToken,
  setStoredPrintifyToken,
  clearStoredPrintifyToken,
  fetchPrintifyApi,
  saveAndVerifyPrintifyToken,
  clearPrintifyTokenOnServer,
  uploadPrintifyImage,
  getPrintifyHeaders,
  parsePrintifyKeyFromFile,
  diagnosePrintifyHealth,
} from '../services/printifyClient';
import { PrintifyKeyModal } from './PrintifyKeyModal';

type CatalogItem = {
  id: number | string;
  title: string;
  name?: string;
  is_available?: boolean;
  is_enabled?: boolean;
  options?: any;
  placeholders?: any;
  cost?: number;
};

type Shop = {
  id: number | string;
  title: string;
  sales_channel?: string;
};

type ShippingRow = {
  attributes?: {
    variantId?: number | string;
    country?: { code?: string };
    shippingCost?: { firstItem?: { amount?: number; currency?: string } };
  };
};

interface Props {
  product: UnifiedProductRecord;
  designs: GeneratedDesign[];
  onUpdateProduct: (product: UnifiedProductRecord) => void;
  onOpenExcelImporter?: () => void;
}

function catalogRows(value: any): CatalogItem[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.variants)) return value.variants;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400';
const labelClass = 'block text-xs text-slate-400';

const statusStyle: Record<string, string> = {
  draft: 'border-amber-700/60 bg-amber-950/40 text-amber-200',
  created: 'border-amber-700/60 bg-amber-950/40 text-amber-200',
  ready: 'border-amber-700/60 bg-amber-950/40 text-amber-200',
  publishing: 'border-sky-700/60 bg-sky-950/40 text-sky-200',
  uploading: 'border-sky-700/60 bg-sky-950/40 text-sky-200',
  published: 'border-emerald-700/60 bg-emerald-950/40 text-emerald-200',
  failed: 'border-rose-700/60 bg-rose-950/40 text-rose-200',
  error: 'border-rose-700/60 bg-rose-950/40 text-rose-200',
};

export const PrintifyPublishPanel: React.FC<Props> = ({
  product,
  designs,
  onUpdateProduct,
  onOpenExcelImporter,
}) => {
  // Token state
  const [tokenInput, setTokenInput] = useState(() => getStoredPrintifyToken());
  const [showToken, setShowToken] = useState(false);
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [tokenSuccessMessage, setTokenSuccessMessage] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const keyFileInputRef = useRef<HTMLInputElement>(null);

  // Catalog and Shop state
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState(String(product.printify.shopId || ''));
  const [blueprints, setBlueprints] = useState<CatalogItem[]>([]);
  const [providers, setProviders] = useState<CatalogItem[]>([]);
  const [variants, setVariants] = useState<CatalogItem[]>([]);
  const [shippingRows, setShippingRows] = useState<ShippingRow[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [variantsError, setVariantsError] = useState('');
  const [shippingError, setShippingError] = useState('');
  const [variantsReload, setVariantsReload] = useState(0);
  const [shippingReload, setShippingReload] = useState(0);

  // Connection & publishing state
  const [connected, setConnected] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [feeDefaultsSaved, setFeeDefaultsSaved] = useState(false);

  // Diagnostic health check state
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<any>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);

  const handleRunDiagnostics = async () => {
    setIsDiagnosing(true);
    setDiagnosticError(null);
    try {
      const res = await diagnosePrintifyHealth(tokenInput);
      setDiagnosticReport(res.report);
      if (res.ok) {
        setTokenSuccessMessage(res.message || 'All Printify diagnostic tests passed!');
        if (res.report?.shops?.length && !connected) {
          void loadConnection(tokenInput);
        }
      } else {
        setDiagnosticError(
          res.report?.recommendations?.join(' · ') ||
          res.message ||
          'Diagnostic check detected issues.'
        );
      }
    } catch (err: any) {
      setDiagnosticError(err.message || 'Diagnostic check failed to complete.');
    } finally {
      setIsDiagnosing(false);
    }
  };

  // Pricing & IDs
  const pricing = useMemo(
    () => normalizePricing(product.pricing, product.product.price),
    [product.pricing, product.product.price]
  );
  const blueprintId = product.printify.blueprintId;
  const providerId = product.printify.printProviderId;
  const enabledVariantIds = useMemo(
    () => new Set(product.printify.variantIds.map(String)),
    [product.printify.variantIds]
  );
  const selectedVariants = useMemo(
    () => variants.filter((item) => enabledVariantIds.has(String(item.id))),
    [variants, enabledVariantIds]
  );
  const selectedMockupSlots = useMemo(() => {
    if (product.printify.selectedMockupSlots && product.printify.selectedMockupSlots.length > 0) {
      return product.printify.selectedMockupSlots;
    }
    // Default to all mockups that have an image
    return product.mockups
      .filter((mockup) => mockup.fileUrl || mockup.localUrl)
      .map((mockup) => mockup.slotIndex);
  }, [product.printify.selectedMockupSlots, product.mockups]);

  // Selectable designs list
  const selectableDesigns = useMemo(() => {
    const list = [...designs];
    if (product.design && (product.design.localUrl || product.design.fileUrl)) {
      const alreadyInList = list.some(
        (d) => d.id === product.design.id || d.imageUrl === (product.design.localUrl || product.design.fileUrl)
      );
      if (!alreadyInList) {
        list.push({
          id: product.design.id || 'custom-uploaded-active',
          title: product.design.title || product.designName || 'Custom Uploaded Design',
          prompt: product.design.prompt || '',
          imageUrl: product.design.localUrl || product.design.fileUrl || '',
          niche: product.design.niche || '',
          createdAt: Date.now(),
          placeholders: {},
        });
      }
    }
    return list;
  }, [designs, product.design, product.designName]);

  const uploadedMockupCount = Math.max(0, (product.printify.uploadedImageIds?.length ?? 0) - 1);
  const savedProductId = product.automation.printifyProductId;
  const selectedShop = shops.find((shop) => String(shop.id) === selectedShopId);
  const shopChannel = (selectedShop?.sales_channel || 'disconnected').toLowerCase();

  const liveVariantCosts = selectedVariants
    .map((variant) => {
      const catalogCost = Number(variant.cost);
      return Number.isFinite(catalogCost)
        ? catalogCost
        : Number(product.printify.variantProductionCosts?.[String(variant.id)]);
    })
    .filter((cost) => Number.isFinite(cost) && cost >= 0);

  const liveProductionCost = liveVariantCosts.length ? Math.max(...liveVariantCosts) / 100 : undefined;
  const liveProductionRange = liveVariantCosts.length
    ? ([Math.min(...liveVariantCosts) / 100, Math.max(...liveVariantCosts) / 100] as const)
    : undefined;

  const shippingRates = selectedVariants
    .map((variant) => {
      const matching = shippingRows
        .map((row) => row.attributes)
        .filter((attributes) => String(attributes?.variantId) === String(variant.id));
      const rate =
        matching.find((attributes) => attributes?.country?.code === pricing.shippingCountryCode) ||
        matching.find((attributes) => attributes?.country?.code === 'REST_OF_THE_WORLD');
      return rate?.shippingCost?.firstItem;
    })
    .filter((cost): cost is { amount?: number; currency?: string } => Number.isFinite(Number(cost?.amount)));

  const liveShippingCost =
    shippingRates.length === selectedVariants.length &&
    shippingRates.length > 0 &&
    shippingRates.every((rate) => (rate.currency || 'USD') === 'USD')
      ? Math.max(...shippingRates.map((rate) => Number(rate.amount))) / 100
      : undefined;

  const calculation = useMemo(() => calculatePrice(pricing), [pricing]);
  const productionCostConfigured =
    pricing.productionCost > 0 ||
    (pricing.productionCostSource === 'printify' && liveProductionCost !== undefined);
  const shippingCostConfigured =
    pricing.shippingCost > 0 ||
    (pricing.shippingCostSource === 'printify' && liveShippingCost !== undefined);
  const status = product.printify.status || (savedProductId ? 'draft' : 'draft');
  const statusLabel =
    status === 'created' || status === 'ready' ? 'Draft' : status[0].toUpperCase() + status.slice(1);

  const updateRecord = (updated: UnifiedProductRecord) => onUpdateProduct(updated);
  const updatePrintify = (patch: Partial<UnifiedProductRecord['printify']>) => {
    updateRecord({ ...product, printify: { ...product.printify, ...patch } });
  };

  const savePricing = (next: ProductPricing) => {
    if (next.targetMode !== 'price') {
      const recommended = requiredSellingPrice(next, next.targetMode);
      if (recommended !== null) next = { ...next, sellingPrice: recommended };
    }
    setReviewed(false);
    setFeeDefaultsSaved(false);
    updateRecord({ ...product, pricing: next, product: { ...product.product, price: next.sellingPrice } });
  };

  const changePricing = (patch: Partial<ProductPricing>, recalculate = true) => {
    let next = { ...pricing, ...patch };
    if (recalculate && next.targetMode !== 'price') {
      const recommended = requiredSellingPrice(next, next.targetMode);
      if (recommended !== null) next = { ...next, sellingPrice: recommended };
    }
    savePricing(next);
  };

  const updateAmount = (key: keyof ProductPricing, value: string) => {
    const amount = value === '' ? 0 : Number(value);
    if (!Number.isFinite(amount)) return;
    if (key === 'productionCost' || key === 'shippingCost') {
      changePricing({
        [key]: amount,
        [key === 'productionCost' ? 'productionCostSource' : 'shippingCostSource']: 'manual',
      } as Partial<ProductPricing>);
    } else {
      changePricing({ [key]: amount } as Partial<ProductPricing>);
    }
  };

  // Connection Loader
  const loadConnection = async (overrideToken?: string) => {
    setLoading(true);
    setError('');
    const token = overrideToken !== undefined ? overrideToken : getStoredPrintifyToken();

    try {
      const result = await fetchPrintifyApi('connection', {}, token);
      const nextShops: Shop[] = result.shops || [];
      setShops(nextShops);
      setConfigured(Boolean(result.configured));
      setConnected(Boolean(result.connected));

      if (result.connected) {
        const nextShopId = String(
          nextShops.find((shop) => String(shop.id) === selectedShopId)?.id || nextShops[0]?.id || ''
        );
        setSelectedShopId(nextShopId);
        if (nextShopId && nextShopId !== product.printify.shopId) {
          updatePrintify({ shopId: nextShopId });
        }

        const blueprintsData = await fetchPrintifyApi('blueprints', {}, token);
        const list = catalogRows(blueprintsData).filter((item) => /case/i.test(item.title || ''));
        setBlueprints(list);

        // Auto-select first blueprint if none selected
        if (!product.printify.blueprintId && list.length > 0) {
          const firstBp = list[0];
          updatePrintify({
            blueprintId: String(firstBp.id),
            selectedModels: [firstBp.title],
          });
        }
      } else {
        if (result.error) {
          setError(result.error);
        }
      }
    } catch (err) {
      setConnected(false);
      setError(err instanceof Error ? err.message : 'Could not connect to Printify.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Save Token
  const handleSaveToken = async (e?: React.FormEvent, overrideToken?: string) => {
    if (e) e.preventDefault();
    const tokenToUse = (overrideToken !== undefined ? overrideToken : tokenInput).trim();
    if (!tokenToUse) {
      setError('Please enter your Printify Personal Access Token.');
      return;
    }
    setIsSavingToken(true);
    setError('');
    setTokenSuccessMessage('');
    try {
      const res = await saveAndVerifyPrintifyToken(tokenToUse);
      setTokenSuccessMessage(res.message || 'Token verified and connected!');
      await loadConnection(tokenToUse);
      setTimeout(() => setTokenSuccessMessage(''), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to verify Printify token. Check the token and try again.');
    } finally {
      setIsSavingToken(false);
    }
  };

  // Handle Import Key from File (.env, .txt, .json, .key)
  const handleKeyFileSelect = (file: File) => {
    setError('');
    setTokenSuccessMessage('');
    const reader = new FileReader();
    reader.onload = async () => {
      const content = String(reader.result || '');
      const parsedKey = parsePrintifyKeyFromFile(content);
      if (parsedKey) {
        setTokenInput(parsedKey);
        setNotice(`✓ Key extracted from "${file.name}". Verifying with Printify...`);
        await handleSaveToken(undefined, parsedKey);
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

  // Handle Paste from Clipboard
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parsePrintifyKeyFromFile(text) || text.trim();
      if (parsed) {
        setTokenInput(parsed);
        setTokenSuccessMessage('Key pasted from clipboard!');
        setTimeout(() => setTokenSuccessMessage(''), 3000);
      }
    } catch {
      setError('Unable to read from clipboard. Please paste into the field directly.');
    }
  };

  // Handle Clear Token
  const handleClearToken = async () => {
    setTokenInput('');
    clearStoredPrintifyToken();
    await clearPrintifyTokenOnServer();
    setConnected(false);
    setConfigured(false);
    setShops([]);
    setNotice('');
    setError('');
  };

  useEffect(() => {
    void loadConnection();
  }, []);

  // Load Print Providers when blueprintId changes
  useEffect(() => {
    if (!connected || !blueprintId) {
      setProviders([]);
      return;
    }
    let cancelled = false;
    fetchPrintifyApi('providers', { blueprintId })
      .then((data) => {
        if (cancelled) return;
        const list = catalogRows(data);
        setProviders(list);

        // Auto-select first provider if none selected
        if (!providerId && list.length > 0) {
          updatePrintify({ printProviderId: String(list[0].id), variantIds: [] });
        } else if (providerId && !list.some((item) => String(item.id) === providerId)) {
          updatePrintify({
            printProviderId: list.length > 0 ? String(list[0].id) : '',
            variantIds: [],
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load print providers.');
      });
    return () => {
      cancelled = true;
    };
  }, [connected, blueprintId]);

  // Load Variants when blueprintId and providerId change
  useEffect(() => {
    if (!connected || !blueprintId || !providerId) {
      setVariants([]);
      setVariantsError('');
      return;
    }
    let cancelled = false;
    setVariants([]);
    setVariantsLoading(true);
    setVariantsError('');
    fetchPrintifyApi('variants', { blueprintId, providerId })
      .then((data) => {
        if (cancelled) return;
        const list = catalogRows(data);
        setVariants(list);
        if (!list.length) {
          setVariantsError(
            'Printify returned no variants for this case and provider. Try another provider or reload variants.'
          );
        }

        // Auto-select all available variants if none selected
        if (product.printify.variantIds.length === 0 && list.length > 0) {
          const availableIds = list.filter((v) => v.is_available !== false).map((v) => String(v.id));
          updatePrintify({
            variantIds: availableIds,
            selectedModels: list
              .filter((v) => availableIds.includes(String(v.id)))
              .map((v) => v.title || `Variant ${v.id}`),
          });
        } else {
          const validIds = new Set(list.map((item) => String(item.id)));
          if (product.printify.variantIds.some((id) => !validIds.has(String(id)))) {
            updatePrintify({
              variantIds: product.printify.variantIds.filter((id) => validIds.has(String(id))),
            });
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Could not load variants.';
          setVariantsError(
            message.toLowerCase().includes('too many attempts')
              ? 'Printify is temporarily rate limiting catalog requests. Wait about one minute, then reload variants.'
              : message
          );
        }
      })
      .finally(() => {
        if (!cancelled) setVariantsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, blueprintId, providerId, variantsReload]);

  // Load Shipping Estimates
  useEffect(() => {
    if (!connected || !blueprintId || !providerId) {
      setShippingRows([]);
      return;
    }
    let cancelled = false;
    setShippingRows([]);
    setShippingLoading(true);
    setShippingError('');
    fetchPrintifyApi('shipping', { blueprintId, providerId, method: pricing.shippingMethod })
      .then((data) => {
        if (cancelled) return;
        setShippingRows(Array.isArray(data?.data) ? data.data : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load shipping estimates.');
      })
      .finally(() => {
        if (!cancelled) setShippingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, blueprintId, providerId, pricing.shippingMethod, shippingReload]);

  // Sync Live Production Cost
  useEffect(() => {
    if (
      !enabledVariantIds.size &&
      (pricing.productionCostSource === 'printify' || pricing.shippingCostSource === 'printify')
    ) {
      if (pricing.productionCost !== 0 || pricing.shippingCost !== 0) {
        savePricing({
          ...pricing,
          productionCost: pricing.productionCostSource === 'printify' ? 0 : pricing.productionCost,
          shippingCost: pricing.shippingCostSource === 'printify' ? 0 : pricing.shippingCost,
        });
      }
      return;
    }
    if (
      liveProductionCost === undefined ||
      pricing.productionCostSource !== 'printify' ||
      pricing.productionCost === liveProductionCost
    ) {
      return;
    }
    savePricing({ ...pricing, productionCost: liveProductionCost });
  }, [enabledVariantIds.size, liveProductionCost, pricing.productionCostSource]);

  // Sync Live Shipping Cost
  useEffect(() => {
    if (
      liveShippingCost === undefined ||
      pricing.shippingCostSource !== 'printify' ||
      pricing.shippingCost === liveShippingCost
    ) {
      return;
    }
    savePricing({ ...pricing, shippingCost: liveShippingCost });
  }, [liveShippingCost, pricing.shippingCostSource]);

  const handleBlueprintChange = (value: string) => {
    const next = blueprints.find((item) => String(item.id) === value);
    setReviewed(false);
    updateRecord({
      ...product,
      printify: {
        ...product.printify,
        blueprintId: value,
        printProviderId: '',
        variantIds: [],
        selectedModels: next ? [next.title] : [],
        variantProductionCosts: {},
      },
      pricing: {
        ...pricing,
        productionCost: pricing.productionCostSource === 'printify' ? 0 : pricing.productionCost,
        shippingCost: pricing.shippingCostSource === 'printify' ? 0 : pricing.shippingCost,
      },
    });
    setError('');
  };

  const handleProviderChange = (value: string) => {
    setReviewed(false);
    updateRecord({
      ...product,
      printify: {
        ...product.printify,
        printProviderId: value,
        variantIds: [],
        variantProductionCosts: {},
      },
      pricing: {
        ...pricing,
        productionCost: pricing.productionCostSource === 'printify' ? 0 : pricing.productionCost,
        shippingCost: pricing.shippingCostSource === 'printify' ? 0 : pricing.shippingCost,
      },
    });
    setError('');
  };

  const toggleVariant = (variant: CatalogItem) => {
    const selected = new Set(enabledVariantIds);
    if (selected.has(String(variant.id))) selected.delete(String(variant.id));
    else selected.add(String(variant.id));
    setReviewed(false);
    updatePrintify({
      variantIds: [...selected],
      selectedModels: variants
        .filter((item) => selected.has(String(item.id)))
        .map((item) => item.title),
    });
  };

  const selectAllVariants = () => {
    const availableIds = variants.filter((v) => v.is_available !== false).map((v) => String(v.id));
    setReviewed(false);
    updatePrintify({
      variantIds: availableIds,
      selectedModels: variants
        .filter((v) => availableIds.includes(String(v.id)))
        .map((v) => v.title || `Variant ${v.id}`),
    });
  };

  const clearAllVariants = () => {
    setReviewed(false);
    updatePrintify({
      variantIds: [],
      selectedModels: [],
    });
  };

  const toggleMockup = (slotIndex: number) => {
    const selected = new Set(selectedMockupSlots);
    if (selected.has(slotIndex)) selected.delete(slotIndex);
    else selected.add(slotIndex);
    setReviewed(false);
    updatePrintify({ selectedMockupSlots: [...selected] });
  };

  const selectAllMockups = () => {
    const allAvailableSlots = product.mockups
      .filter((m) => m.fileUrl || m.localUrl)
      .map((m) => m.slotIndex);
    setReviewed(false);
    updatePrintify({ selectedMockupSlots: allAvailableSlots });
  };

  const clearAllMockups = () => {
    setReviewed(false);
    updatePrintify({ selectedMockupSlots: [] });
  };

  const selectDesign = (design: GeneratedDesign) => {
    if (design.id === product.design.id) return;
    setReviewed(false);
    updateRecord({
      ...product,
      designName: design.title,
      design: {
        ...product.design,
        id: design.id,
        title: design.title,
        prompt: design.prompt,
        localUrl: design.imageUrl,
        sourceUrl: design.imageUrl,
        niche: design.niche,
        fileId: '',
        fileUrl: '',
        verified: false,
      },
    });
  };

  useEffect(() => {
    if (!product.pricing) savePricing(createPricingForProduct(product.product.price));
  }, [product.productId]);

  const evaluatePrintifyProduct = async (showNotice = true, finalCheck = true) => {
    if (!savedProductId || !selectedShopId) return;
    try {
      const remote = await fetchPrintifyApi('product', {
        shopId: selectedShopId,
        productId: savedProductId,
      });
      const external = Array.isArray(remote.external) ? remote.external[0] : remote.external;
      const nextStatus = remote.is_locked
        ? 'uploading'
        : external?.id || external?.handle
        ? 'published'
        : finalCheck
        ? 'failed'
        : 'uploading';

      if (nextStatus === 'published') {
        updateRecord({
          ...product,
          printify: {
            ...product.printify,
            status: 'published',
            publishedProductUrl: /^https:\/\//i.test(String(external?.handle || ''))
              ? String(external.handle)
              : '',
            productStatusCheckedAt: new Date().toISOString(),
            lastError: '',
          },
          automation: {
            ...product.automation,
            etsyListingId: String(
              selectedShop?.sales_channel?.toLowerCase().includes('etsy')
                ? external?.id || product.automation.etsyListingId || ''
                : product.automation.etsyListingId
            ),
            publishedDate: new Date().toISOString(),
          },
        });
      } else {
        updatePrintify({
          status: nextStatus,
          productStatusCheckedAt: new Date().toISOString(),
          lastError:
            nextStatus === 'failed'
              ? 'Printify reports that publishing finished without a connected-store product. Retry publishing or check the connected shop.'
              : '',
        });
      }
      if (showNotice) {
        setNotice(
          nextStatus === 'published'
            ? `Published to ${selectedShop?.sales_channel || 'connected store'} · ID ${external?.id}`
            : nextStatus === 'uploading'
            ? 'Printify is still sending this product to the connected shop.'
            : 'The connected shop did not confirm publication. You can retry.'
        );
      }
      return nextStatus;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not check the Printify product status.';
      updatePrintify({ status: 'error', lastError: message });
      if (showNotice) setError(message);
      return 'error';
    }
  };

  // Main Action: Create Product & Upload Design + Mockups
  const createProduct = async () => {
    setPublishing(true);
    setError('');
    setNotice('Preparing artwork and selected mockups for upload...');
    updatePrintify({
      status: 'uploading',
      lastError: '',
      lastAttemptAt: new Date().toISOString(),
    });

    try {
      const artworkSource = product.design.localUrl || product.design.fileUrl;
      if (!artworkSource) {
        throw new Error('This product has no design artwork to upload. Please generate or select a design.');
      }

      // 1. Upload Design Artwork
      setNotice('Step 1/3: Uploading high-res design artwork to Printify...');
      const artworkUpload = await uploadPrintifyImage(
        `${product.productId}-artwork.png`,
        artworkSource,
        tokenInput
      );
      const artworkImageId = artworkUpload.imageId;

      // 2. Upload Selected Mockups
      const selectedMockups = product.mockups.filter(
        (mockup) =>
          selectedMockupSlots.includes(mockup.slotIndex) && (mockup.fileUrl || mockup.localUrl)
      );

      const mockupImageIds: string[] = [];
      for (const [index, mockup] of selectedMockups.entries()) {
        const mockupSource = mockup.localUrl || mockup.fileUrl;
        if (mockupSource) {
          setNotice(
            `Step 2/3: Uploading mockup ${index + 1} of ${selectedMockups.length} to Printify Media Library...`
          );
          const mockupUpload = await uploadPrintifyImage(
            `${product.productId}-${mockup.modelId || `mockup_${mockup.slotIndex + 1}`}.png`,
            mockupSource,
            tokenInput
          );
          mockupImageIds.push(mockupUpload.imageId);
        }
      }

      // 3. Create Printify Product Draft
      setNotice('Step 3/3: Creating Printify product draft with variants and publishing settings...');
      const productPayload = {
        ...product,
        product: { ...product.product, price: pricing.sellingPrice },
        pricing,
        printify: {
          ...product.printify,
          shopId: selectedShopId,
          blueprintId: product.printify.blueprintId && product.printify.blueprintId !== '68'
            ? product.printify.blueprintId
            : blueprintId && blueprintId !== '68'
            ? blueprintId
            : '269',
          selectedMockupSlots,
        },
      };

      const effectiveBlueprintId = productPayload.printify.blueprintId;

      const response = await fetch('/api/printify', {
        method: 'POST',
        headers: getPrintifyHeaders(tokenInput),
        body: JSON.stringify({
          action: 'create',
          shopId: selectedShopId,
          blueprintId: effectiveBlueprintId,
          printProviderId: productPayload.printify.printProviderId || providerId || '1',
          variantIds: productPayload.printify.variantIds,
          price: pricing.sellingPrice,
          token: tokenInput,
          product: {
            productId: productPayload.productId,
            listing: productPayload.listing,
            product: productPayload.product,
            pricing,
            printify: productPayload.printify,
          },
          artworkImageId,
          uploadedImageIds: [artworkImageId, ...mockupImageIds],
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.product?.id) {
        throw new Error(data.error || 'Printify did not return a product ID.');
      }

      const variantProductionCosts = Object.fromEntries(
        (data.product.variants || [])
          .filter((variant: any) => Number.isFinite(Number(variant.cost)) && Number(variant.cost) >= 0)
          .map((variant: any) => [String(variant.id), Number(variant.cost)])
      );

      let savedPricing = { ...pricing };
      const returnedCosts = Object.values(variantProductionCosts) as number[];
      if (savedPricing.productionCostSource === 'printify' && returnedCosts.length) {
        savedPricing.productionCost = Math.max(...returnedCosts) / 100;
        if (savedPricing.targetMode !== 'price') {
          const recommended = requiredSellingPrice(savedPricing, savedPricing.targetMode);
          if (recommended !== null) savedPricing.sellingPrice = recommended;
        }
      }

      updateRecord({
        ...productPayload,
        product: { ...productPayload.product, price: savedPricing.sellingPrice },
        pricing: savedPricing,
        printify: {
          ...productPayload.printify,
          status: 'draft',
          uploadedImageIds: data.uploadedImageIds || [artworkImageId, ...mockupImageIds],
          variantProductionCosts,
          productUrl: `https://printify.com/app/products/${data.product.id}`,
          lastError: '',
        },
        automation: { ...product.automation, printifyProductId: String(data.product.id), error: '' },
      });

      setNotice(
        `✓ Printify draft created successfully at $${savedPricing.sellingPrice.toFixed(2)}! Product ID: ${data.product.id}. Design artwork and ${mockupImageIds.length} custom mockup(s) uploaded to your Printify Media Library.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Printify product creation failed.';
      setError(message);
      setNotice('');
      updatePrintify({ status: 'failed', lastError: message });
    } finally {
      setPublishing(false);
    }
  };

  // Publish to Connected Store (Etsy/Shopify)
  const publishToShop = async () => {
    if (!savedProductId || !selectedShopId) return;
    setPublishing(true);
    setError('');
    setNotice('Sending the product to your connected sales channel...');
    updatePrintify({
      status: 'uploading',
      lastError: '',
      lastAttemptAt: new Date().toISOString(),
    });

    try {
      const artworkSource = product.design.localUrl || product.design.fileUrl;
      let artworkImageId = '';
      if (artworkSource) {
        try {
          const artworkUpload = await uploadPrintifyImage(
            `${product.productId}-artwork.png`,
            artworkSource,
            tokenInput
          );
          artworkImageId = artworkUpload.imageId;
        } catch (uploadErr) {
          console.warn('Artwork re-upload failed, attempting publish with existing artwork:', uploadErr);
        }
      }

      const response = await fetch('/api/printify', {
        method: 'POST',
        headers: getPrintifyHeaders(tokenInput),
        body: JSON.stringify({
          action: 'publish-product',
          shopId: selectedShopId,
          productId: savedProductId,
          price: pricing.sellingPrice,
          artworkImageId,
          token: tokenInput,
          product: { listing: product.listing },
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Printify could not start publishing this product.');

      if (data.salesChannelWarning) {
        setNotice(data.message || `Phone case draft saved in Printify at $${pricing.sellingPrice.toFixed(2)}.`);
        updateRecord({
          ...product,
          printify: {
            ...product.printify,
            status: 'draft',
            productUrl: data.productUrl || `https://printify.com/app/products/${savedProductId}`,
            lastError: '',
          },
        });
        return;
      }

      setNotice('Publish request accepted! Waiting for the connected shop to confirm...');
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1800));
        const nextStatus = await evaluatePrintifyProduct(false, false);
        if (nextStatus === 'published') {
          setNotice(`Published to ${selectedShop?.sales_channel || 'connected store'} · ID ${savedProductId}`);
          break;
        }
        if (nextStatus === 'error') {
          setError('Could not check publication status. Use “Check status” to retry.');
          setNotice('');
          break;
        }
        if (attempt === 5) {
          const finalStatus = await evaluatePrintifyProduct(false, true);
          if (finalStatus === 'published') {
            setNotice(`Published to ${selectedShop?.sales_channel || 'connected store'} · ID ${savedProductId}`);
          } else if (finalStatus === 'failed' || finalStatus === 'error') {
            setError('The connected shop did not confirm publication. You can retry.');
            setNotice('');
          } else {
            setNotice('Still uploading to the connected shop. Use “Check status” to refresh when it finishes.');
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not publish this Printify product.';
      setError(message);
      updatePrintify({ status: 'failed', lastError: message });
      setNotice('');
    } finally {
      setPublishing(false);
    }
  };

  const setTargetMode = (mode: ProductPricing['targetMode']) => {
    let next = { ...pricing, targetMode: mode };
    if (mode !== 'price') {
      const recommended = requiredSellingPrice(next, mode);
      if (recommended !== null) next = { ...next, sellingPrice: recommended };
    }
    savePricing(next);
  };

  const priceForMode = (value: string) => {
    const parsed = value === '' ? 0 : Number(value);
    if (!Number.isFinite(parsed)) return;
    const patch =
      pricing.targetMode === 'margin'
        ? { targetMargin: Math.min(0.99, Math.max(0, parsed / 100)) }
        : { targetProfit: parsed };
    changePricing(patch);
  };

  const selectEtsyCountry = (country: ProductPricing['etsySellerCountry']) =>
    savePricing(applyEtsyCountryDefaults(pricing, country));

  const recommendation =
    pricing.targetMode === 'price' ? undefined : requiredSellingPrice(pricing, pricing.targetMode);

  const field = (
    title: string,
    key: keyof ProductPricing,
    options: { step?: string; help?: string } = {}
  ) => (
    <label key={String(key)} className={labelClass}>
      {title}
      <input
        type="number"
        min="0"
        step={options.step || '0.01'}
        value={Number(pricing[key]) || 0}
        onChange={(event) => updateAmount(key, event.target.value)}
        disabled={publishing}
        className={inputClass}
      />
      {options.help && <span className="mt-1 block text-[10px] leading-4 text-slate-500">{options.help}</span>}
    </label>
  );

  const rateField = (title: string, key: keyof ProductPricing, help?: string) => (
    <label key={String(key)} className={labelClass}>
      {title}
      <div className="relative mt-1">
        <input
          type="number"
          min="0"
          step="0.1"
          value={(Number(pricing[key]) || 0) * 100}
          disabled={publishing}
          onChange={(event) =>
            updateAmount(key, String((event.target.value === '' ? 0 : Number(event.target.value)) / 100))
          }
          className={`${inputClass} pr-8`}
        />
        <span className="absolute top-2.5 right-3 text-xs text-slate-500">%</span>
      </div>
      {help && <span className="mt-1 block text-[10px] leading-4 text-slate-500">{help}</span>}
    </label>
  );

  return (
    <div className="space-y-6">
      {/* Hidden File Input for Direct Token File Import */}
      <input
        ref={keyFileInputRef}
        type="file"
        accept=".env,.txt,.json,.key,text/plain"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleKeyFileSelect(e.target.files[0]);
          }
        }}
      />

      {/* Printify API Token & Connection Card */}
      <section className="rounded-2xl border border-indigo-900/40 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-900/40 pb-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
              <Key className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white">Printify API Access & Token</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Connect your Printify Personal Access Token to list phone cases and upload mockups.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                connected
                  ? 'border-emerald-600/60 bg-emerald-950/60 text-emerald-300'
                  : 'border-slate-700 bg-slate-950 text-slate-400'
              }`}
            >
              {loading ? (
                <>
                  <LoaderCircle className="h-3 w-3 animate-spin" /> Verifying...
                </>
              ) : connected ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Connected (
                  {shops.length} shop{shops.length === 1 ? '' : 's'})
                </>
              ) : (
                'Not Connected'
              )}
            </span>

            <button
              type="button"
              onClick={() => setIsKeyModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-950/50 hover:bg-indigo-900/60 px-3 py-1 text-xs font-semibold text-indigo-200 transition cursor-pointer shadow-sm"
              title="Open full Key Import & Drag-Drop manager"
            >
              <Key className="h-3.5 w-3.5 text-indigo-400" />
              <span>Import Key</span>
            </button>

            {onOpenExcelImporter && (
              <button
                type="button"
                onClick={onOpenExcelImporter}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 px-3 py-1 text-xs font-semibold text-emerald-300 transition cursor-pointer"
                title="Upload an Excel file to bulk import products"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                <span>Bulk Import from Excel &rarr;</span>
              </button>
            )}
          </div>
        </div>

        {/* Token Input Form & Key File Import Controls */}
        <form onSubmit={handleSaveToken} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            <div className="relative flex-1">
              <input
                type={showToken ? 'text' : 'password'}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Paste your Printify Personal Access Token (e.g. eyJ0eXAi...)"
                disabled={isSavingToken || publishing}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 pr-10 text-xs font-mono text-white outline-none focus:border-indigo-400"
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={isSavingToken || !tokenInput.trim() || publishing}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 cursor-pointer shadow-md shadow-indigo-950"
              >
                {isSavingToken ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {isSavingToken ? 'Saving...' : 'Save & Connect'}
              </button>
              
              <button
                type="button"
                onClick={() => keyFileInputRef.current?.click()}
                disabled={isSavingToken || publishing}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2.5 text-xs font-medium text-slate-200 transition cursor-pointer"
                title="Select a key file (.env, .txt, .json, .key) from your computer"
              >
                <Upload className="h-3.5 w-3.5 text-indigo-400" />
                <span>Import File</span>
              </button>

              <button
                type="button"
                onClick={() => setIsKeyModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-700/60 bg-indigo-950/40 hover:bg-indigo-900/60 px-3 py-2.5 text-xs font-medium text-indigo-200 transition cursor-pointer"
                title="Open Key Importer dialog with file drop & details"
              >
                <Key className="h-3.5 w-3.5 text-indigo-400" />
                <span>Key Dialog</span>
              </button>

              <button
                type="button"
                onClick={handleRunDiagnostics}
                disabled={isDiagnosing || publishing}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-teal-600/60 bg-teal-950/50 hover:bg-teal-900/60 px-3.5 py-2.5 text-xs font-semibold text-teal-200 transition cursor-pointer shadow-sm"
                title="Run diagnostic tests on token, shop connection, phone case blueprints, and image upload pipeline"
              >
                {isDiagnosing ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin text-teal-300" />
                ) : (
                  <Activity className="h-3.5 w-3.5 text-teal-400" />
                )}
                <span>{isDiagnosing ? 'Diagnosing...' : 'Run Diagnostics'}</span>
              </button>

              {tokenInput && (
                <button
                  type="button"
                  onClick={handleClearToken}
                  disabled={isSavingToken || publishing}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-medium text-slate-300 hover:bg-rose-950/40 hover:text-rose-200 hover:border-rose-800 disabled:opacity-40 cursor-pointer"
                  title="Clear Token"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Disconnect
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1 cursor-pointer"
              >
                <Copy className="h-3 w-3" /> Paste from Clipboard
              </button>
              <span>•</span>
              <p>
                Generate token in{' '}
                <a
                  href="https://printify.com/app/account/api"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-300 underline hover:text-indigo-200 inline-flex items-center gap-0.5"
                >
                  Printify Settings &gt; API <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>
            {tokenSuccessMessage && (
              <span className="text-emerald-300 font-medium">{tokenSuccessMessage}</span>
            )}
          </div>

          {/* Diagnostic Error Banner */}
          {diagnosticError && (
            <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-3.5 text-xs text-rose-200 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <p className="font-semibold">Diagnostic Health Check Notice</p>
                <p className="mt-0.5 text-rose-300/90">{diagnosticError}</p>
              </div>
            </div>
          )}

          {/* Diagnostic Report Card */}
          {diagnosticReport && (
            <div className="rounded-xl border border-teal-800/60 bg-slate-950/90 p-4 text-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2 text-teal-300 font-semibold">
                  <ShieldCheck className="h-4 w-4 text-teal-400" />
                  <span>Printify Pipeline Diagnostic Health Report</span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
                    diagnosticReport.tokenValid && diagnosticReport.uploadProbe?.success
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                      : 'bg-amber-950/80 text-amber-300 border border-amber-800'
                  }`}
                >
                  {diagnosticReport.tokenValid && diagnosticReport.uploadProbe?.success
                    ? 'ALL SYSTEMS OPERATIONAL'
                    : 'ATTENTION REQUIRED'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* 1. Token Check */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">1. Token Health</span>
                    {diagnosticReport.tokenValid ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                    )}
                  </div>
                  <p className="text-white font-semibold">
                    {diagnosticReport.tokenValid ? 'Valid & Authenticated' : 'Invalid / Rejected'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {diagnosticReport.tokenLength} chars ·{' '}
                    {diagnosticReport.tokenSource === 'server_env' ? 'Active (.env)' : 'Client Token'}
                  </p>
                </div>

                {/* 2. Shop Connection */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">2. Connected Shop</span>
                    {diagnosticReport.shops?.length > 0 ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                    )}
                  </div>
                  <p className="text-white font-semibold truncate">
                    {diagnosticReport.shops?.[0]?.title || 'No Shops Found'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Channel: {diagnosticReport.shops?.[0]?.sales_channel?.toUpperCase() || 'Connected'}
                  </p>
                </div>

                {/* 3. Phone Case Catalog */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">3. Phone Case Catalog</span>
                    {diagnosticReport.defaultBlueprint ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                    )}
                  </div>
                  <p className="text-white font-semibold truncate">
                    {diagnosticReport.defaultBlueprint?.title || 'Tough Phone Cases'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Blueprint {diagnosticReport.defaultBlueprint?.id || 269} ·{' '}
                    {diagnosticReport.defaultBlueprint?.availableVariantsCount || 34} models
                  </p>
                </div>

                {/* 4. Upload Probe */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">4. Upload Pipeline</span>
                    {diagnosticReport.uploadProbe?.success ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                    )}
                  </div>
                  <p className="text-white font-semibold">
                    {diagnosticReport.uploadProbe?.success ? '100% Operational' : 'Upload Failed'}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {diagnosticReport.uploadProbe?.success
                      ? `Probe ID: ${diagnosticReport.uploadProbe.imageId}`
                      : diagnosticReport.uploadProbe?.error || 'Check permissions'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </form>
      </section>

      {/* Main Product Setup & Publishing Panel */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Printify Product Setup & Publishing</h3>
            <p className="mt-1 text-xs text-slate-400">
              Select artwork, mockups, phone case model, and variants for {product.productId}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                statusStyle[status] || statusStyle.draft
              }`}
            >
              Status: {statusLabel}
            </span>
          </div>
        </div>

        {!connected && (
          <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-indigo-950/30 p-5 text-xs text-slate-300 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-indigo-200">
              <Info className="h-4 w-4 text-indigo-400" /> Printify Key Required
            </div>
            <p className="text-slate-400 leading-relaxed">
              To load your Printify shops, view available phone case models, and publish this product draft at <strong>$22.20</strong>, connect your Printify Personal Access Token.
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => keyFileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white transition cursor-pointer shadow-md shadow-indigo-950"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Import Key File (.env / .txt / .json)</span>
              </button>
              <button
                type="button"
                onClick={() => setIsKeyModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3.5 py-2 text-xs font-medium text-slate-200 transition cursor-pointer"
              >
                <Key className="h-3.5 w-3.5 text-indigo-400" />
                <span>Open Key Importer Modal</span>
              </button>
            </div>
          </div>
        )}

        {connected && (
          <>
            {/* Shop, Blueprint, and Provider Selectors */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className={labelClass}>
                Printify Shop
                <select
                  value={selectedShopId}
                  disabled={Boolean(savedProductId) || publishing}
                  onChange={(event) => {
                    setSelectedShopId(event.target.value);
                    setReviewed(false);
                    updatePrintify({ shopId: event.target.value });
                  }}
                  className={inputClass}
                >
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.title} · {shop.sales_channel || 'Shop'} ({shop.id})
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] text-slate-500">
                  Sales channel: {selectedShop?.sales_channel || 'loading...'}
                </span>
              </label>

              <label className={labelClass}>
                Phone Case Model
                <select
                  value={blueprintId}
                  disabled={Boolean(savedProductId) || publishing}
                  onChange={(event) => handleBlueprintChange(event.target.value)}
                  className={inputClass}
                >
                  {!blueprintId && <option value="">Select a phone case model</option>}
                  {blueprints.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} (ID: {item.id})
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] text-slate-500">
                  {blueprints.length} phone case blueprint(s) available
                </span>
              </label>

              <label className={labelClass}>
                Print Provider
                <select
                  value={providerId}
                  onChange={(event) => handleProviderChange(event.target.value)}
                  className={inputClass}
                  disabled={!providers.length || Boolean(savedProductId) || publishing}
                >
                  {!providerId && <option value="">Select a print provider</option>}
                  {providers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} (ID: {item.id})
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] text-slate-500">
                  {providers.length} provider(s) available
                </span>
              </label>
            </div>

            {/* Design Artwork Selection */}
            <div className="border-t border-slate-800 pt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-white">1. Design Artwork</h4>
                  <p className="mt-1 text-[11px] text-slate-500">
                    This artwork will be printed edge-to-edge on the selected case variants.
                  </p>
                </div>
                <span className="text-[10px] font-medium text-indigo-300">
                  {product.design.title || product.designName}
                </span>
              </div>

              {selectableDesigns.length > 0 && (
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  {selectableDesigns.map((design) => {
                    const isSelected = Boolean(
                      product.design.id === design.id ||
                        (product.design.localUrl && product.design.localUrl === design.imageUrl)
                    );
                    return (
                      <label
                        key={design.id}
                        className={`flex items-center gap-2.5 rounded-lg border p-2 text-xs transition-colors ${
                          isSelected
                            ? 'border-indigo-400/80 bg-indigo-500/10 text-white shadow-sm'
                            : 'border-slate-800 text-slate-300 hover:bg-slate-800/40'
                        } ${savedProductId || publishing ? 'opacity-60' : 'cursor-pointer'}`}
                      >
                        <input
                          type="radio"
                          name="printify-design"
                          checked={isSelected}
                          disabled={Boolean(savedProductId) || publishing}
                          onChange={() => selectDesign(design)}
                          className="accent-indigo-400"
                        />
                        {design.imageUrl && (
                          <img
                            src={design.imageUrl}
                            alt={design.title}
                            className="h-9 w-9 rounded object-cover border border-slate-700 shrink-0"
                          />
                        )}
                        <span className="min-w-0 truncate font-medium">{design.title}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                {product.design.localUrl || product.design.fileUrl ? (
                  <img
                    src={product.design.localUrl || product.design.fileUrl}
                    alt={product.design.title || 'Selected design'}
                    className="h-16 w-12 rounded border border-slate-700 object-cover shadow"
                  />
                ) : (
                  <span className="flex h-16 w-12 items-center justify-center rounded border border-dashed border-slate-700 text-slate-500">
                    <ImageIcon className="h-5 w-5" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-white">
                    {product.design.title || product.designName}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {product.design.localUrl ? 'Ready for Printify Upload' : 'No artwork available'}
                  </p>
                </div>
              </div>
            </div>

            {/* Generated Mockups Section */}
            <div className="border-t border-slate-800 pt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-white">
                    2. Mockups & Lifestyle Images to Upload ({selectedMockupSlots.length} selected)
                  </h4>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Selected mockups are automatically converted and uploaded to your Printify Media Library.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllMockups}
                    disabled={publishing || Boolean(savedProductId)}
                    className="text-[11px] text-indigo-300 hover:text-indigo-200 hover:underline disabled:opacity-40"
                  >
                    Select all
                  </button>
                  <span className="text-slate-700 text-xs">|</span>
                  <button
                    type="button"
                    onClick={clearAllMockups}
                    disabled={publishing || Boolean(savedProductId)}
                    className="text-[11px] text-slate-400 hover:text-slate-300 hover:underline disabled:opacity-40"
                  >
                    Deselect all
                  </button>
                </div>
              </div>

              {product.mockups.length ? (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {product.mockups.map((mockup) => {
                    const available = Boolean(mockup.fileUrl || mockup.localUrl);
                    const isSelected = selectedMockupSlots.includes(mockup.slotIndex);
                    return (
                      <label
                        key={mockup.slotIndex}
                        className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
                          isSelected
                            ? 'border-indigo-400/70 bg-indigo-500/10'
                            : 'border-slate-800 bg-slate-950/40'
                        } ${!available || savedProductId ? 'opacity-50' : 'cursor-pointer hover:border-slate-700'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!available || Boolean(savedProductId) || publishing}
                          onChange={() => toggleMockup(mockup.slotIndex)}
                          className="accent-indigo-400"
                        />
                        {available ? (
                          <img
                            src={mockup.localUrl || mockup.fileUrl}
                            alt={mockup.sceneTitle || mockup.modelName}
                            className="h-12 w-12 rounded object-cover border border-slate-700 shrink-0"
                          />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded bg-slate-950 border border-slate-800 text-slate-600 shrink-0">
                            <ImageIcon className="h-4 w-4" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-slate-200">
                            {mockup.sceneTitle || mockup.modelName || `Mockup ${mockup.slotIndex + 1}`}
                          </span>
                          <span className="block text-[10px] text-slate-400 mt-0.5">
                            {savedProductId && isSelected
                              ? '✓ Uploaded to Media Library'
                              : available
                              ? 'Ready to upload'
                              : 'No generated image'}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-800 p-3 text-xs text-slate-500">
                  Generated mockups will appear here after the mockup creation workflow.
                </p>
              )}

              <div
                role="note"
                className="mt-3 rounded-lg border border-indigo-900/40 bg-indigo-950/20 p-3 text-[11px] leading-5 text-indigo-200"
              >
                <p className="flex items-start gap-2">
                  <Info className="mt-1 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                  <span>
                    <strong>Media Library Integration:</strong> All selected mockups are uploaded to your Printify Media Library. You can view them in Printify and attach them directly to this product’s store gallery.
                  </span>
                </p>
                {savedProductId && (
                  <p className="mt-1.5 pl-5 text-indigo-300">
                    {uploadedMockupCount > 0
                      ? `✓ ${uploadedMockupCount} mockup(s) uploaded to Printify for this draft.`
                      : 'Draft created with design artwork.'}
                  </p>
                )}
              </div>
            </div>

            {/* Case Variants to Include */}
            {blueprintId && providerId && (
              <div className="border-t border-slate-800 pt-4">
                <div className="mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-white">
                      3. Variants to Include ({enabledVariantIds.size} of {variants.length} selected)
                    </h4>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Catalog costs and stock status for each phone case model variant.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {variants.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={selectAllVariants}
                          disabled={variantsLoading || Boolean(savedProductId) || publishing}
                          className="text-[11px] text-indigo-300 hover:text-indigo-200 disabled:opacity-40 hover:underline"
                        >
                          Select all
                        </button>
                        <span className="text-slate-700 text-xs">|</span>
                        <button
                          type="button"
                          onClick={clearAllVariants}
                          disabled={variantsLoading || Boolean(savedProductId) || publishing}
                          className="text-[11px] text-slate-400 hover:text-slate-300 disabled:opacity-40 hover:underline"
                        >
                          Clear all
                        </button>
                        <span className="text-slate-700 text-xs">|</span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setVariantsReload((value) => value + 1)}
                      disabled={variantsLoading}
                      className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${variantsLoading ? 'animate-spin' : ''}`} />
                      {variantsLoading ? 'Loading…' : 'Reload'}
                    </button>
                  </div>
                </div>

                {variantsError && (
                  <p className="mb-2 rounded-md border border-amber-800/60 bg-amber-950/30 p-2.5 text-xs text-amber-200">
                    {variantsError}
                  </p>
                )}

                {variants.length > 0 && (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2">
                    {variants.map((variant) => {
                      const costCents = Number.isFinite(Number(variant.cost))
                        ? Number(variant.cost)
                        : product.printify.variantProductionCosts?.[String(variant.id)];
                      const isChecked = enabledVariantIds.has(String(variant.id));
                      return (
                        <label
                          key={variant.id}
                          className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                            variant.is_available === false || variantsLoading
                              ? 'text-slate-600'
                              : isChecked
                              ? 'bg-slate-900/80 text-white'
                              : 'text-slate-300 hover:bg-slate-900/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={
                              variant.is_available === false ||
                              variantsLoading ||
                              Boolean(savedProductId) ||
                              publishing
                            }
                            onChange={() => toggleVariant(variant)}
                            className="accent-indigo-500"
                          />
                          <span>
                            {variant.title || `Variant ${variant.id}`}
                            {variant.is_available === false ? ' · out of stock' : ''}
                          </span>
                          {Number.isFinite(Number(costCents)) && (
                            <span className="ml-auto tabular-nums text-emerald-300 font-mono">
                              {formatUsd(Number(costCents) / 100)}
                            </span>
                          )}
                          <span className="font-mono text-slate-600 text-[10px]">{variant.id}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Product ID and Live Status Banner */}
        {savedProductId && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-4 text-xs">
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                statusStyle[status] || statusStyle.draft
              }`}
            >
              {statusLabel}
            </span>
            <span className="text-slate-200">
              Printify Product ID: <strong className="font-mono text-white text-sm">{savedProductId}</strong>
            </span>
            <div className="ml-auto flex items-center gap-3">
              {product.printify.productUrl && (
                <a
                  href={product.printify.productUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  Open in Printify <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {product.printify.publishedProductUrl && (
                <a
                  href={product.printify.publishedProductUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  View Listing <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {notice && !error && (
          <div role="status" className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 p-3 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-rose-800/60 bg-rose-950/40 p-3.5 text-xs text-rose-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div>
              <div className="font-semibold">{error}</div>
              {product.printify.lastError && (
                <div className="mt-1 text-rose-300/80">{product.printify.lastError}</div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={() => void loadConnection()}
            disabled={loading || publishing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh connection
          </button>

          {connected && !savedProductId && (
            <button
              type="button"
              onClick={() => void createProduct()}
              disabled={
                publishing ||
                pricing.sellingPrice <= 0 ||
                !selectedShopId ||
                (!product.design.localUrl && !product.design.fileUrl) ||
                !blueprintId ||
                !providerId ||
                !enabledVariantIds.size
              }
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 shadow-lg shadow-indigo-900/30"
            >
              {publishing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              {publishing
                ? 'Creating Printify product & uploading mockups…'
                : status === 'failed'
                ? 'Retry Product Creation'
                : 'Create Printify Product & Upload Mockups'}
            </button>
          )}

          {connected && savedProductId && shopChannel !== 'disconnected' && (
            <button
              type="button"
              onClick={() => void publishToShop()}
              disabled={
                publishing ||
                status === 'uploading' ||
                !reviewed ||
                pricing.sellingPrice <= 0 ||
                !productionCostConfigured ||
                !shippingCostConfigured ||
                (pricing.etsySellerCountry === 'MA' && pricing.etsyPaymentProcessingFixed <= 0)
              }
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 shadow-lg shadow-emerald-900/30"
            >
              {publishing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ShoppingBag className="h-4 w-4" />
              )}
              {publishing
                ? 'Publishing…'
                : status === 'failed' || status === 'error'
                ? 'Retry Publishing'
                : status === 'published'
                ? 'Update Connected Shop'
                : 'Publish to Connected Shop'}
            </button>
          )}

          {savedProductId && status === 'uploading' && !publishing && (
            <button
              type="button"
              onClick={() => void evaluatePrintifyProduct()}
              className="rounded-lg border border-slate-700 px-3.5 py-2.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              Check status
            </button>
          )}

          {connected && savedProductId && shopChannel === 'disconnected' && (
            <span className="text-xs text-amber-200">
              Connect this Printify shop to Etsy or Shopify in Printify to publish automatically.
            </span>
          )}

          {publishing && (
            <span className="text-xs text-slate-400">Keep this page open while the upload completes.</span>
          )}
        </div>
      </section>

      {/* Pricing & Profit Calculator Section */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-400/30 bg-indigo-400/10 text-indigo-200">
              <Calculator className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white">Pricing & Profit Calculator</h3>
              <p className="mt-1 text-xs text-slate-400">
                {product.productId} · USD · Auto-synced with Printify and Etsy listings
              </p>
            </div>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
              calculation.netProfit >= 0
                ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-200'
                : 'border-rose-700/60 bg-rose-950/40 text-rose-200'
            }`}
          >
            {calculation.netProfit >= 0 ? 'Profitable at this price' : 'Below break-even'}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-200">Set your pricing goal</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['price', 'Selling price'],
                    ['margin', 'Profit margin'],
                    ['profit', 'Profit amount'],
                  ] as const
                ).map(([mode, title]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTargetMode(mode)}
                    disabled={publishing}
                    aria-pressed={pricing.targetMode === mode}
                    className={`rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors ${
                      pricing.targetMode === mode
                        ? 'border-indigo-400 bg-indigo-400/10 text-white'
                        : 'border-slate-800 text-slate-400 hover:bg-slate-800/70'
                    }`}
                  >
                    {title}
                  </button>
                ))}
              </div>
              <label className={`${labelClass} mt-3`}>
                {pricing.targetMode === 'price'
                  ? 'Target selling price'
                  : pricing.targetMode === 'margin'
                  ? 'Desired profit margin'
                  : 'Desired profit per order'}
                <div className="relative mt-1">
                  <input
                    type="number"
                    min="0"
                    step={pricing.targetMode === 'margin' ? '1' : '0.01'}
                    value={
                      pricing.targetMode === 'price'
                        ? pricing.sellingPrice
                        : pricing.targetMode === 'margin'
                        ? pricing.targetMargin * 100
                        : pricing.targetProfit
                    }
                    disabled={publishing}
                    onChange={(event) =>
                      pricing.targetMode === 'price'
                        ? changePricing(
                            {
                              sellingPrice:
                                event.target.value === '' ? 0 : Number(event.target.value),
                            },
                            false
                          )
                        : priceForMode(event.target.value)
                    }
                    className={`${inputClass} pr-14`}
                  />
                  <span className="absolute top-2.5 right-3 text-xs text-slate-500">
                    {pricing.targetMode === 'margin' ? '%' : '$'}
                  </span>
                </div>
              </label>

              {/* Phone Case Price Quick-Set Shortcuts */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 font-medium">Quick set price:</span>
                <button
                  type="button"
                  onClick={() => changePricing({ targetMode: 'price', sellingPrice: 22.20 }, false)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                    Math.abs(pricing.sellingPrice - 22.20) < 0.01
                      ? 'border-indigo-400 bg-indigo-600 text-white shadow-sm'
                      : 'border-indigo-700/60 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50'
                  }`}
                  title="Set selling price to $22.20 for Phone Case"
                >
                  ★ $22.20 (Phone Case standard)
                </button>
                {[19.99, 24.99, 27.99].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => changePricing({ targetMode: 'price', sellingPrice: p }, false)}
                    className={`rounded-md border px-2 py-0.5 text-[11px] transition cursor-pointer ${
                      Math.abs(pricing.sellingPrice - p) < 0.01
                        ? 'border-indigo-400 bg-indigo-600 text-white'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    ${p.toFixed(2)}
                  </button>
                ))}
              </div>
              {recommendation !== undefined && recommendation !== null && (
                <p className="mt-2 rounded-lg border border-indigo-400/20 bg-indigo-400/5 p-2.5 text-xs text-indigo-100">
                  Recommended price: <strong>{formatUsd(recommendation)}</strong>
                </p>
              )}
              {recommendation === null && (
                <p className="mt-2 rounded-lg border border-amber-800/50 bg-amber-950/20 p-2.5 text-[11px] text-amber-200">
                  This goal is above the available margin after variable fees. Lower the target or review fee inputs.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-white">Printify and fulfillment costs</p>
                <span
                  className={`text-[10px] ${
                    pricing.productionCostSource === 'printify' && liveProductionCost !== undefined
                      ? 'text-emerald-300'
                      : 'text-amber-200'
                  }`}
                >
                  {pricing.productionCostSource === 'printify' && liveProductionCost !== undefined
                    ? 'Live catalog'
                    : 'Manual / estimated'}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {field('Production cost per case', 'productionCost', {
                  help: liveProductionRange
                    ? `Selected variants: ${formatUsd(liveProductionRange[0])}–${formatUsd(
                        liveProductionRange[1]
                      )}. Using highest variant cost.`
                    : 'Printify catalog cost or manual estimate.',
                })}
                {field('Printify shipping to customer', 'shippingCost', {
                  help:
                    liveShippingCost !== undefined
                      ? `Live ${pricing.shippingMethod} rate for ${pricing.shippingCountryCode}.`
                      : 'Enter the shipping rate for the delivery destination.',
                })}
                <label className={labelClass}>
                  Shipping destination (ISO code)
                  <div className="flex gap-2">
                    <input
                      maxLength={2}
                      value={pricing.shippingCountryCode}
                      disabled={publishing}
                      onChange={(event) =>
                        changePricing({
                          shippingCountryCode: event.target.value.trim().toUpperCase(),
                          shippingCost: 0,
                          shippingCostSource: 'printify',
                        })
                      }
                      className={`${inputClass} w-20 uppercase`}
                    />
                    <select
                      value={pricing.shippingMethod}
                      disabled={publishing}
                      onChange={(event) =>
                        changePricing({
                          shippingMethod: event.target.value as ProductPricing['shippingMethod'],
                          shippingCost: 0,
                          shippingCostSource: 'printify',
                        })
                      }
                      className={`${inputClass} flex-1`}
                    >
                      <option value="standard">Standard</option>
                      <option value="economy">Economy</option>
                      <option value="priority">Priority</option>
                      <option value="express">Express</option>
                    </select>
                  </div>
                  {shippingLoading && (
                    <span className="mt-1 block text-[10px] text-slate-500">Loading rates…</span>
                  )}
                  {shippingError && (
                    <span className="mt-1 block text-[10px] text-amber-200">{shippingError}</span>
                  )}
                </label>
                {field('Other Printify fees', 'printifyFees', {
                  help: 'Subscription or service fees allocated per order.',
                })}
                {field('Other fulfillment costs', 'fulfillmentOther')}
                {field('Customer shipping charged on Etsy', 'customerShippingCharged', {
                  help: 'Included in order revenue.',
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  savePricing({
                    ...pricing,
                    productionCostSource: 'printify',
                    shippingCostSource: 'printify',
                  });
                  setVariantsReload((value) => value + 1);
                  setShippingReload((value) => value + 1);
                }}
                className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-indigo-300 hover:text-indigo-200"
              >
                <RefreshCw className="h-3 w-3" />
                Use latest available Printify rates
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-white">Etsy fees</p>
                <a
                  href="https://help.etsy.com/hc/en-us/articles/115014483627-What-are-the-Fees-and-Taxes-for-Selling-on-Etsy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-indigo-300 hover:text-indigo-200"
                >
                  Official fee guide <ExternalLink className="inline h-3 w-3" />
                </a>
              </div>
              <label className={labelClass}>
                Seller payment account country
                <select
                  value={pricing.etsySellerCountry}
                  disabled={publishing}
                  onChange={(event) =>
                    selectEtsyCountry(event.target.value as ProductPricing['etsySellerCountry'])
                  }
                  className={inputClass}
                >
                  <option value="US">United States</option>
                  <option value="MA">Morocco</option>
                  <option value="OTHER">Other / configure rates</option>
                </select>
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {field('Listing fee allocated per sale (USD)', 'etsyListingFee')}
                {rateField('Transaction rate', 'etsyTransactionRate', 'Standard rate: 6.5% of order total.')}
                {rateField('Payment processing rate', 'etsyPaymentProcessingRate')}
                {field('Payment processing fixed fee (USD)', 'etsyPaymentProcessingFixed', {
                  help:
                    pricing.etsySellerCountry === 'MA'
                      ? 'Morocco: 5 MAD equivalent.'
                      : 'US default is $0.25 per order.',
                })}
                {rateField(
                  'Regulatory operating fee',
                  'etsyRegulatoryRate',
                  'Applies in select seller countries.'
                )}
                {field('Other Etsy fees per order', 'etsyOtherFees')}
              </div>
              <div className="mt-3 rounded-lg border border-slate-800 p-2.5">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={pricing.etsyOffsiteAdsEnabled}
                    disabled={publishing}
                    onChange={(event) =>
                      changePricing({ etsyOffsiteAdsEnabled: event.target.checked })
                    }
                    className="accent-indigo-400"
                  />
                  Include Etsy Offsite Ads fee
                </label>
                {pricing.etsyOffsiteAdsEnabled && (
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {rateField('Offsite Ads rate', 'etsyOffsiteAdsRate')}
                    {field('Order fee cap (USD)', 'etsyOffsiteAdsOrderCap')}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={publishing}
                onClick={() => setFeeDefaultsSaved(saveEtsyFeeDefaults(pricing))}
                className="mt-3 rounded-md border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                {feeDefaultsSaved
                  ? '✓ Etsy fee defaults saved for new products'
                  : 'Save these Etsy fees as defaults for new products'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
          <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white">Before Publishing · {product.productId}</p>
                <p className="mt-1 text-[10px] text-slate-500">Estimated per order · USD</p>
              </div>
              <CircleDollarSign className="h-4 w-4 text-indigo-300" />
            </div>
            <div className="space-y-1.5 text-xs">
              <SummaryRow
                label="Product / production cost"
                value={formatUsd(pricing.productionCost)}
                hint={
                  pricing.productionCostSource === 'printify' && liveProductionCost !== undefined
                    ? 'Printify catalog'
                    : 'manual estimate'
                }
              />
              <SummaryRow
                label="Printify shipping"
                value={formatUsd(pricing.shippingCost)}
                hint={
                  pricing.shippingCostSource === 'printify' && liveShippingCost !== undefined
                    ? 'live rate'
                    : 'manual estimate'
                }
              />
              <SummaryRow
                label="Other Printify costs"
                value={formatUsd(pricing.printifyFees + pricing.fulfillmentOther)}
              />
              <SummaryRow label="Etsy listing / renewal" value={formatUsd(calculation.listingFee)} />
              <SummaryRow label="Etsy transaction" value={formatUsd(calculation.transactionFee)} />
              <SummaryRow
                label="Etsy payment processing"
                value={formatUsd(calculation.paymentProcessingFee)}
              />
              {pricing.etsyOffsiteAdsEnabled && (
                <SummaryRow label="Etsy Offsite Ads" value={formatUsd(calculation.offsiteAdsFee)} />
              )}
              <SummaryRow
                label="Other Etsy fees"
                value={formatUsd(pricing.etsyOtherFees + calculation.revenue * pricing.etsyRegulatoryRate)}
              />
              <SummaryRow label="Total Etsy fees" value={formatUsd(calculation.etsyFees)} hint="calculated" />
              <SummaryRow label="Your additional costs" value={formatUsd(calculation.additionalCosts)} />
              <div className="my-2 border-t border-slate-800" />
              <SummaryRow label="Total cost per order" value={formatUsd(calculation.totalCost)} strong />
              <SummaryRow label="Selling price" value={formatUsd(pricing.sellingPrice)} />
              {pricing.customerShippingCharged > 0 && (
                <SummaryRow
                  label="Customer shipping collected"
                  value={formatUsd(pricing.customerShippingCharged)}
                />
              )}
              <SummaryRow
                label="Estimated net profit"
                value={formatUsd(calculation.netProfit)}
                strong
                positive={calculation.netProfit >= 0}
              />
              <SummaryRow
                label="Profit margin"
                value={`${(calculation.profitMargin * 100).toFixed(1)}%`}
                strong
                positive={calculation.netProfit >= 0}
              />
            </div>
            <label className="mt-4 flex items-start gap-2 border-t border-slate-800 pt-3 text-[11px] leading-4 text-slate-300">
              <input
                type="checkbox"
                checked={reviewed}
                disabled={publishing}
                onChange={(event) => setReviewed(event.target.checked)}
                className="mt-0.5 accent-emerald-400"
              />
              I reviewed the estimated fees and profit for this product before publishing.
            </label>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800">
            <div className="border-b border-slate-800 bg-slate-950/60 px-3 py-2.5">
              <p className="text-xs font-semibold text-white">Price Comparison</p>
              <p className="mt-1 text-[10px] text-slate-500">Compare expected cost and profit.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-[11px]">
                <thead className="bg-slate-950/30 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Selling price</th>
                    <th className="px-3 py-2 text-right font-medium">Total cost</th>
                    <th className="px-3 py-2 text-right font-medium">Etsy fees</th>
                    <th className="px-3 py-2 text-right font-medium">Net profit</th>
                    <th className="px-3 py-2 text-right font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {PRICING_SCENARIOS.map((price) => {
                    const scenario = calculatePrice(pricing, price);
                    return (
                      <tr
                        key={price}
                        className={`border-t border-slate-800 ${
                          Math.abs(price - pricing.sellingPrice) < 0.005 ? 'bg-indigo-400/5' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5 font-medium text-white">
                          {formatUsd(price)}
                          {Math.abs(price - pricing.sellingPrice) < 0.005 && (
                            <span className="ml-1.5 text-[9px] text-indigo-300">Current</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-300">
                          {formatUsd(scenario.totalCost)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-300">
                          {formatUsd(scenario.etsyFees)}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right ${
                            scenario.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {formatUsd(scenario.netProfit)}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right ${
                            scenario.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {(scenario.profitMargin * 100).toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Printify Personal Access Token Import & Verification Modal */}
      <PrintifyKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        onKeyConnected={(token) => {
          setTokenInput(token);
          void loadConnection(token);
        }}
      />
    </div>
  );
};

const SummaryRow: React.FC<{
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  positive?: boolean;
}> = ({ label, value, hint, strong, positive }) => (
  <div className={`flex items-baseline justify-between gap-3 ${strong ? 'font-semibold' : ''}`}>
    <span className={`${strong ? 'text-slate-200' : 'text-slate-400'}`}>
      {label}
      {hint && <span className="ml-1.5 text-[9px] font-normal text-slate-600">{hint}</span>}
    </span>
    <span
      className={`tabular-nums ${
        positive === undefined ? 'text-white' : positive ? 'text-emerald-300' : 'text-rose-300'
      }`}
    >
      {value}
    </span>
  </div>
);
