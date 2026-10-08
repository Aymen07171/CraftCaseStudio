import { UnifiedProductRecord } from '../types/unifiedWorkflow';

export type ProductPricing = NonNullable<UnifiedProductRecord['pricing']>;
type EtsyFeeDefaults = Pick<ProductPricing,
  | 'etsySellerCountry' | 'etsyListingFee' | 'etsyTransactionRate' | 'etsyPaymentProcessingRate'
  | 'etsyPaymentProcessingFixed' | 'etsyOffsiteAdsEnabled' | 'etsyOffsiteAdsRate'
  | 'etsyOffsiteAdsOrderCap' | 'etsyRegulatoryRate' | 'etsyOtherFees'
>;

const FEE_DEFAULTS_KEY = 'casecraft-printify-fee-defaults-v1';
const FEE_DEFAULT_FIELDS: (keyof EtsyFeeDefaults)[] = [
  'etsySellerCountry', 'etsyListingFee', 'etsyTransactionRate', 'etsyPaymentProcessingRate',
  'etsyPaymentProcessingFixed', 'etsyOffsiteAdsEnabled', 'etsyOffsiteAdsRate',
  'etsyOffsiteAdsOrderCap', 'etsyRegulatoryRate', 'etsyOtherFees',
];

export const createDefaultPricing = (sellingPrice = 22.20): ProductPricing => ({
  currency: 'USD',
  productionCost: 0,
  productionCostSource: 'printify',
  shippingCost: 0,
  shippingCostSource: 'printify',
  shippingCountryCode: 'US',
  shippingMethod: 'standard',
  printifyFees: 0,
  fulfillmentOther: 0,
  etsySellerCountry: 'US',
  etsyListingFee: 0.2,
  etsyTransactionRate: 0.065,
  etsyPaymentProcessingRate: 0.03,
  etsyPaymentProcessingFixed: 0.25,
  etsyOffsiteAdsEnabled: false,
  etsyOffsiteAdsRate: 0.15,
  etsyOffsiteAdsOrderCap: 100,
  etsyRegulatoryRate: 0,
  etsyOtherFees: 0,
  customerShippingCharged: 0,
  designGenerationCost: 0,
  mockupGenerationCost: 0,
  advertisingCost: 0,
  marketingCost: 0,
  otherExpenses: 0,
  sellingPrice,
  targetMode: 'price',
  targetMargin: 0.3,
  targetProfit: 8,
});

export function createPricingForProduct(sellingPrice: number): ProductPricing {
  return { ...createDefaultPricing(sellingPrice), ...loadEtsyFeeDefaults() } as ProductPricing;
}

export function loadEtsyFeeDefaults(): Partial<EtsyFeeDefaults> {
  try {
    const raw = localStorage.getItem(FEE_DEFAULTS_KEY);
    return raw ? JSON.parse(raw) as Partial<EtsyFeeDefaults> : {};
  } catch {
    return {};
  }
}

export function saveEtsyFeeDefaults(pricing: ProductPricing) {
  try {
    const defaults = Object.fromEntries(FEE_DEFAULT_FIELDS.map((key) => [key, pricing[key]]));
    localStorage.setItem(FEE_DEFAULTS_KEY, JSON.stringify(defaults));
    return true;
  } catch {
    return false;
  }
}

export function normalizePricing(pricing: Partial<ProductPricing> | undefined, currentProductPrice: number) {
  return { ...createDefaultPricing(currentProductPrice), ...pricing } as ProductPricing;
}

export function applyEtsyCountryDefaults(pricing: ProductPricing, country: ProductPricing['etsySellerCountry']): ProductPricing {
  if (country === 'MA') {
    return {
      ...pricing,
      etsySellerCountry: country,
      etsyTransactionRate: 0.065,
      etsyPaymentProcessingRate: 0.045,
      // The official fixed charge is 5 MAD; it must be converted to the calculator's USD currency.
      etsyPaymentProcessingFixed: 0,
    };
  }
  if (country === 'US') {
    return {
      ...pricing,
      etsySellerCountry: country,
      etsyTransactionRate: 0.065,
      etsyPaymentProcessingRate: 0.03,
      etsyPaymentProcessingFixed: 0.25,
    };
  }
  return { ...pricing, etsySellerCountry: country };
}

export interface PricingResult {
  sellingPrice: number;
  revenue: number;
  printifyCost: number;
  etsyFees: number;
  additionalCosts: number;
  totalCost: number;
  netProfit: number;
  profitMargin: number;
  transactionFee: number;
  paymentProcessingFee: number;
  offsiteAdsFee: number;
  listingFee: number;
}

export function calculatePrice(pricing: ProductPricing, sellingPrice = pricing.sellingPrice): PricingResult {
  const amount = Math.max(0, Number(sellingPrice) || 0);
  const orderTotal = amount + Math.max(0, Number(pricing.customerShippingCharged) || 0);
  const transactionFee = orderTotal * Math.max(0, pricing.etsyTransactionRate);
  const paymentProcessingFee = orderTotal * Math.max(0, pricing.etsyPaymentProcessingRate) + Math.max(0, pricing.etsyPaymentProcessingFixed);
  const offsiteAdsFee = pricing.etsyOffsiteAdsEnabled
    ? Math.min(orderTotal * Math.max(0, pricing.etsyOffsiteAdsRate), Math.max(0, pricing.etsyOffsiteAdsOrderCap))
    : 0;
  const listingFee = Math.max(0, pricing.etsyListingFee);
  const etsyFees = listingFee + transactionFee + paymentProcessingFee + offsiteAdsFee
    + orderTotal * Math.max(0, pricing.etsyRegulatoryRate) + Math.max(0, pricing.etsyOtherFees);
  const printifyCost = Math.max(0, pricing.productionCost) + Math.max(0, pricing.shippingCost)
    + Math.max(0, pricing.printifyFees) + Math.max(0, pricing.fulfillmentOther);
  const additionalCosts = Math.max(0, pricing.designGenerationCost) + Math.max(0, pricing.mockupGenerationCost)
    + Math.max(0, pricing.advertisingCost) + Math.max(0, pricing.marketingCost) + Math.max(0, pricing.otherExpenses);
  const totalCost = printifyCost + etsyFees + additionalCosts;
  const revenue = orderTotal;
  const netProfit = revenue - totalCost;
  return {
    sellingPrice: amount,
    revenue,
    printifyCost,
    etsyFees,
    additionalCosts,
    totalCost,
    netProfit,
    profitMargin: amount > 0 ? netProfit / amount : 0,
    transactionFee,
    paymentProcessingFee,
    offsiteAdsFee,
    listingFee,
  };
}

// Solves against the full fee calculation, including Etsy's capped Offsite Ads fee.
export function requiredSellingPrice(pricing: ProductPricing, mode: 'margin' | 'profit') {
  const goal = mode === 'margin' ? Math.min(0.99, Math.max(-0.99, pricing.targetMargin)) : Math.max(0, pricing.targetProfit);
  const meetsGoal = (price: number) => {
    const result = calculatePrice(pricing, price);
    return mode === 'margin' ? result.profitMargin >= goal : result.netProfit >= goal;
  };
  let low = 0;
  let high = 100;
  while (high < 100000 && !meetsGoal(high)) high *= 2;
  if (!meetsGoal(high)) return null;
  for (let i = 0; i < 70; i += 1) {
    const mid = (low + high) / 2;
    if (meetsGoal(mid)) high = mid;
    else low = mid;
  }
  return Math.ceil(high * 100) / 100;
}

export const PRICING_SCENARIOS = [18.99, 19.99, 21.99, 22.20, 24.99, 27.99, 29.99] as const;

export const formatUsd = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number.isFinite(amount) ? amount : 0);
