/**
 * Pinterest Bulk Posting CSV Data Model & Types
 * Strictly aligned with Pinterest's official Bulk Create Pins CSV format
 */

export interface PinterestCsvRow {
  'Product ID': string;
  Title: string;
  Description: string;
  'Media URL': string;
  'Pinterest board': string;
  Thumbnail: string;
  Link: string;
  'Publish date': string;
  Keywords: string;
}

export const PINTEREST_CSV_HEADERS: (keyof PinterestCsvRow)[] = [
  'Product ID',
  'Title',
  'Description',
  'Media URL',
  'Pinterest board',
  'Thumbnail',
  'Link',
  'Publish date',
  'Keywords',
];

export interface PinterestGenerationOptions {
  boardName: string;
  defaultDestinationLink?: string;
  includeDesignAsset: boolean;
  includePrimaryMockup: boolean;
  includeAllMockups: boolean;
  titleFormat: 'product-title' | 'title-with-callout' | 'seo-focused';
  descriptionFormat: 'full-description' | 'hook-and-tags' | 'story-format';
  tagsAsKeywords: boolean;
  utmCampaign?: string;
  startDate?: string;
  scheduleIntervalDays?: number; // e.g. 1 pin every 1 or 2 days
  aiOptimizeOnGenerate?: boolean;
  aiMaxDescriptionChars?: number;
}

export interface PinterestAiAnalysis {
  coherenceScore: number; // 1-100
  relevanceScore: number; // 1-100
  summaryNote: string;
  extractedHooks?: string[];
  keyHighlights?: string[];
}

export interface PinterestAiOptimizeItem {
  id: string | number;
  title: string;
  description: string;
  board?: string;
  keywords?: string;
  productId?: string;
}

export interface PinterestAiOptimizeResultItem {
  id: string | number;
  originalTitle: string;
  optimizedTitle: string;
  originalDescription: string;
  summarizedDescription: string;
  descriptionCharCount: number;
  titleCharCount: number;
  analysis: PinterestAiAnalysis;
}

export interface PinterestAiOptimizeRequest {
  items: PinterestAiOptimizeItem[];
  options?: {
    maxDescriptionLength?: number; // default 700
    maxTitleLength?: number; // default 80
    titleStyle?: 'concise' | 'seo' | 'aesthetic' | 'punchy';
    tone?: 'viral' | 'luxury' | 'modern' | 'minimalist';
  };
}

export interface PinterestAiOptimizeResponse {
  results: PinterestAiOptimizeResultItem[];
  overallSummary?: string;
}

export interface PinterestParseResult {
  headers: string[];
  rows: PinterestCsvRow[];
  isValidFormat: boolean;
  errors: string[];
  warnings: string[];
}
