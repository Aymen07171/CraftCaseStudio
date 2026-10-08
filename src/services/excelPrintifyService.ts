/**
 * Excel to Printify Bulk Importer Service
 * Parses Excel (.xlsx, .xls) and CSV files, detects product details (Title, Description, Tags, Design Image),
 * and handles one-by-one sequential automated importing into Printify.
 */

import * as XLSX from 'xlsx';
import {
  getStoredPrintifyToken,
  getPrintifyHeaders,
  uploadPrintifyImage,
} from './printifyClient';
import {
  extractGoogleDriveId,
  listDriveFolderImageFiles,
  fetchDriveImageAsDataUrl,
  DriveImageFile,
} from './unifiedGoogleService';

export interface ExcelProductRow {
  index: number;
  rawRow: Record<string, any>;
  title: string;
  description: string;
  tags: string[];
  imageUrl: string;
  sku?: string;
  price?: number;
  blueprintId?: string | number;
  printProviderId?: string | number;
  variantIds?: number[];
  // Google Drive asset linkage
  driveFolderUrl?: string;
  driveFileId?: string;
  driveFileName?: string;
  isDriveResolved?: boolean;
  driveError?: string;
  // Processing status
  status: 'pending' | 'uploading-image' | 'creating-product' | 'completed' | 'failed' | 'skipped';
  printifyImageId?: string;
  printifyProductId?: string;
  printifyProductUrl?: string;
  error?: string;
  processedAt?: number;
}

export interface ExcelColumnMapping {
  titleColumn: string;
  descriptionColumn: string;
  tagsColumn: string;
  imageColumn: string;
  driveFolderColumn?: string;
  priceColumn?: string;
  skuColumn?: string;
  blueprintIdColumn?: string;
  providerIdColumn?: string;
}

export interface ExcelParseResult {
  fileName: string;
  sheetNames: string[];
  activeSheet: string;
  headers: string[];
  mapping: ExcelColumnMapping;
  rows: ExcelProductRow[];
  totalRows: number;
  validRows: number;
  hasDriveLinks?: boolean;
  detectedDriveFolderUrl?: string;
  errors: string[];
  warnings: string[];
}

/**
 * Intelligent heuristics to auto-detect columns from Excel headers
 */
export function detectColumnMapping(headers: string[]): ExcelColumnMapping {
  const norm = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  let titleColumn = '';
  let descriptionColumn = '';
  let tagsColumn = '';
  let imageColumn = '';
  let priceColumn = '';
  let skuColumn = '';
  let blueprintIdColumn = '';
  let providerIdColumn = '';
  let driveFolderColumn = '';

  for (const h of headers) {
    const n = norm(h);

    // Title candidates
    if (!titleColumn) {
      if (['title', 'producttitle', 'designname', 'designtitle', 'name', 'listingtitle', 'itemtitle'].includes(n)) {
        titleColumn = h;
      }
    }

    // Description candidates
    if (!descriptionColumn) {
      if (['description', 'productdescription', 'desc', 'body', 'listingdescription', 'details'].includes(n)) {
        descriptionColumn = h;
      }
    }

    // Tags candidates
    if (!tagsColumn) {
      if (['tags', 'keywords', 'producttags', 'tag', 'etsytags', 'searchterms'].includes(n)) {
        tagsColumn = h;
      }
    }

    // Google Drive Folder candidates
    if (!driveFolderColumn) {
      if (
        [
          'googledrivefolder',
          'googledrivelink',
          'googledrive',
          'googledriveurl',
          'drivefolder',
          'drivefolderlink',
          'drivefolderurl',
          'drivelink',
          'driveurl',
          'folderlink',
          'folderurl',
          'designfolder',
          'artworkfolder',
          'googlefolder',
          'drive',
          'designimagesfolder',
        ].includes(n)
      ) {
        driveFolderColumn = h;
      }
    }

    // Image URL candidates
    if (!imageColumn) {
      if (
        [
          'designimage',
          'imageurl',
          'designurl',
          'designfileurl',
          'image',
          'artwork',
          'artworkurl',
          'fileurl',
          'photo',
          'photourl',
          'mockupurl',
          'link',
          'medialink',
          'mediaurl',
        ].includes(n)
      ) {
        imageColumn = h;
      }
    }

    // Price
    if (!priceColumn) {
      if (['price', 'sellingprice', 'cost', 'retailprice', 'usd'].includes(n)) {
        priceColumn = h;
      }
    }

    // SKU / Product ID
    if (!skuColumn) {
      if (['sku', 'productid', 'id', 'itemid', 'itemnumber'].includes(n)) {
        skuColumn = h;
      }
    }

    // Blueprint ID
    if (!blueprintIdColumn) {
      if (['blueprintid', 'blueprint'].includes(n)) {
        blueprintIdColumn = h;
      }
    }

    // Provider ID
    if (!providerIdColumn) {
      if (['printproviderid', 'providerid', 'provider'].includes(n)) {
        providerIdColumn = h;
      }
    }
  }

  // Fallbacks if not matched by exact normalized strings
  if (!titleColumn) {
    titleColumn = headers.find((h) => /title|name/i.test(h)) || headers[0] || '';
  }
  if (!descriptionColumn) {
    descriptionColumn = headers.find((h) => /desc/i.test(h)) || '';
  }
  if (!tagsColumn) {
    tagsColumn = headers.find((h) => /tag|keyword/i.test(h)) || '';
  }
  if (!driveFolderColumn) {
    driveFolderColumn = headers.find((h) => /drive.*folder|google.*folder|folder.*link/i.test(h)) || '';
  }
  if (!imageColumn) {
    imageColumn = headers.find((h) => /image|artwork|file|photo|url/i.test(h)) || driveFolderColumn || '';
  }

  return {
    titleColumn,
    descriptionColumn,
    tagsColumn,
    imageColumn,
    driveFolderColumn: driveFolderColumn || undefined,
    priceColumn: priceColumn || undefined,
    skuColumn: skuColumn || undefined,
    blueprintIdColumn: blueprintIdColumn || undefined,
    providerIdColumn: providerIdColumn || undefined,
  };
}

/**
 * Extracts tag list from various formats: comma/semicolon separated string, array, or separate Tag_01..13 columns
 */
export function extractTagsFromRow(row: Record<string, any>, tagsColumn?: string): string[] {
  const tags: string[] = [];

  if (tagsColumn && row[tagsColumn] !== undefined) {
    const val = row[tagsColumn];
    if (Array.isArray(val)) {
      tags.push(...val.map(String));
    } else if (typeof val === 'string') {
      tags.push(
        ...val
          .split(/[,;\n]/)
          .map((t) => t.trim())
          .filter(Boolean)
      );
    }
  }

  // Also check for individual columns like Tag_01, Tag_02 or Tag 1, Tag 2
  Object.keys(row).forEach((key) => {
    if (/^tag[_\s]?\d+$/i.test(key) && key !== tagsColumn) {
      const val = row[key];
      if (val && typeof val === 'string' && val.trim()) {
        tags.push(val.trim());
      }
    }
  });

  return Array.from(new Set(tags)).slice(0, 13);
}

/**
 * Parse an uploaded Excel/CSV file (ArrayBuffer or File)
 */
export async function parseExcelFile(
  fileOrBuffer: File | ArrayBuffer,
  fileName: string = 'products.xlsx',
  sheetNameOverride?: string,
  mappingOverride?: Partial<ExcelColumnMapping>
): Promise<ExcelParseResult> {
  let buffer: ArrayBuffer;
  if (fileOrBuffer instanceof File) {
    buffer = await fileOrBuffer.arrayBuffer();
  } else {
    buffer = fileOrBuffer;
  }

  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error('The uploaded file does not contain any readable sheets.');
  }

  const activeSheet = sheetNameOverride && sheetNames.includes(sheetNameOverride)
    ? sheetNameOverride
    : sheetNames[0];

  const worksheet = workbook.Sheets[activeSheet];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

  if (!jsonData || jsonData.length === 0) {
    return {
      fileName,
      sheetNames,
      activeSheet,
      headers: [],
      mapping: { titleColumn: '', descriptionColumn: '', tagsColumn: '', imageColumn: '' },
      rows: [],
      totalRows: 0,
      validRows: 0,
      errors: ['No data rows found in this sheet.'],
      warnings: [],
    };
  }

  const headers = Object.keys(jsonData[0] || {});
  const autoMapping = detectColumnMapping(headers);
  const mapping: ExcelColumnMapping = {
    ...autoMapping,
    ...mappingOverride,
  };

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!mapping.titleColumn) {
    errors.push('Could not detect a Title column in the Excel file.');
  }
  if (!mapping.imageColumn && !mapping.driveFolderColumn) {
    errors.push('Could not detect a Design Image or Google Drive Folder column in the Excel file.');
  }
  if (!mapping.imageColumn && mapping.driveFolderColumn) {
    mapping.imageColumn = mapping.driveFolderColumn;
  }

  const rows: ExcelProductRow[] = jsonData.map((raw, idx) => {
    const title = String(raw[mapping.titleColumn] || '').trim();
    const description = String(raw[mapping.descriptionColumn] || '').trim();
    let imageUrl = String(raw[mapping.imageColumn] || '').trim();
    const tags = extractTagsFromRow(raw, mapping.tagsColumn);

    let driveFolderUrl = mapping.driveFolderColumn
      ? String(raw[mapping.driveFolderColumn] || '').trim()
      : undefined;

    // Auto-detect if raw row has any Google Drive folder link in any column
    if (!driveFolderUrl) {
      for (const [, v] of Object.entries(raw)) {
        if (typeof v === 'string' && v.includes('drive.google.com')) {
          if (v.includes('/folders/') || v.includes('folders%2F') || v.includes('folderview')) {
            driveFolderUrl = v.trim();
            break;
          }
        }
      }
    }

    // If imageUrl itself is a Google Drive folder link, populate driveFolderUrl
    if (imageUrl && (imageUrl.includes('/folders/') || imageUrl.includes('folders%2F') || imageUrl.includes('folderview'))) {
      if (!driveFolderUrl) driveFolderUrl = imageUrl;
    }

    // If imageUrl is a direct file link, extract file ID
    let driveFileId: string | undefined;
    if (imageUrl && imageUrl.includes('drive.google.com')) {
      const parsedDrive = extractGoogleDriveId(imageUrl);
      if (parsedDrive && parsedDrive.type === 'file') {
        driveFileId = parsedDrive.id;
      }
    }

    let price: number | undefined;
    if (mapping.priceColumn && raw[mapping.priceColumn] !== undefined) {
      const parsedPrice = parseFloat(String(raw[mapping.priceColumn]).replace(/[^0-9.]/g, ''));
      if (!isNaN(parsedPrice) && parsedPrice > 0) {
        price = parsedPrice;
      }
    }

    const sku = mapping.skuColumn ? String(raw[mapping.skuColumn] || '').trim() : undefined;
    const blueprintId = mapping.blueprintIdColumn ? raw[mapping.blueprintIdColumn] : undefined;
    const printProviderId = mapping.providerIdColumn ? raw[mapping.providerIdColumn] : undefined;

    return {
      index: idx,
      rawRow: raw,
      title,
      description,
      tags,
      imageUrl,
      driveFolderUrl,
      driveFileId,
      price,
      sku,
      blueprintId,
      printProviderId,
      status: 'pending',
    };
  });

  const hasDriveLinks = rows.some(
    (r) => Boolean(r.driveFolderUrl) || (r.imageUrl && r.imageUrl.includes('drive.google.com'))
  );
  let detectedDriveFolderUrl: string | undefined;
  if (hasDriveLinks) {
    const driveRow = rows.find(
      (r) =>
        r.driveFolderUrl ||
        (r.imageUrl && (r.imageUrl.includes('/folders/') || r.imageUrl.includes('folders%2F')))
    );
    detectedDriveFolderUrl =
      driveRow?.driveFolderUrl ||
      (driveRow?.imageUrl && (driveRow.imageUrl.includes('/folders/') || driveRow.imageUrl.includes('folders%2F'))
        ? driveRow.imageUrl
        : undefined);
  }

  const validRows = rows.filter((r) => r.title && (r.imageUrl || r.driveFolderUrl)).length;
  if (validRows === 0 && rows.length > 0) {
    warnings.push(
      'None of the rows have both a Title and an Image URL or Google Drive link. Please verify column mappings.'
    );
  } else if (validRows < rows.length) {
    warnings.push(
      `${rows.length - validRows} rows are missing a title or image / Google Drive link and will be flagged.`
    );
  }

  return {
    fileName,
    sheetNames,
    activeSheet,
    headers,
    mapping,
    rows,
    totalRows: rows.length,
    validRows,
    hasDriveLinks,
    detectedDriveFolderUrl,
    errors,
    warnings,
  };
}

/**
 * Automatically resolves and downloads design images from Google Drive for each product row
 */
export async function resolveGoogleDriveImagesForRows(
  rows: ExcelProductRow[],
  masterFolderUrlOrId?: string,
  token?: string | null,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ updatedRows: ExcelProductRow[]; resolvedCount: number; failedCount: number }> {
  let resolvedCount = 0;
  let failedCount = 0;

  // Cache folder listings so we don't query the same folder multiple times
  const folderCache = new Map<string, DriveImageFile[]>();

  const getFolderFiles = async (folderId: string): Promise<DriveImageFile[]> => {
    if (folderCache.has(folderId)) {
      return folderCache.get(folderId)!;
    }
    const files = await listDriveFolderImageFiles(folderId, token);
    folderCache.set(folderId, files);
    return files;
  };

  // Determine master folder ID if provided
  let masterFolderId: string | null = null;
  if (masterFolderUrlOrId) {
    const parsed = extractGoogleDriveId(masterFolderUrlOrId);
    if (parsed) masterFolderId = parsed.id;
  }

  // Pre-load master folder image files if available
  let masterFiles: DriveImageFile[] = [];
  if (masterFolderId) {
    try {
      masterFiles = await getFolderFiles(masterFolderId);
    } catch (err: any) {
      console.warn('Could not pre-load master Google Drive folder:', err);
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    onProgress?.(i + 1, rows.length, `Searching design image for "${row.title || `Item #${i + 1}`}"...`);

    try {
      // 1. Check if row already has a resolved data URL or non-drive image
      if (row.imageUrl && !row.imageUrl.includes('drive.google.com') && row.isDriveResolved) {
        resolvedCount++;
        continue;
      }

      // 2. Check if row has a direct Drive File URL
      const driveMatch = extractGoogleDriveId(row.imageUrl || '');
      if (driveMatch && driveMatch.type === 'file') {
        onProgress?.(i + 1, rows.length, `Downloading Google Drive file for "${row.title}"...`);
        const downloaded = await fetchDriveImageAsDataUrl(driveMatch.id, token);
        row.imageUrl = downloaded.dataUrl;
        row.driveFileId = driveMatch.id;
        row.driveFileName = downloaded.fileName;
        row.isDriveResolved = true;
        row.driveError = undefined;
        resolvedCount++;
        continue;
      }

      // 3. Check for specific folder in this row or master folder
      const targetFolderId =
        (row.driveFolderUrl && extractGoogleDriveId(row.driveFolderUrl)?.id) ||
        (driveMatch && driveMatch.type === 'folder' ? driveMatch.id : null) ||
        masterFolderId;

      if (!targetFolderId) {
        if (!row.imageUrl || row.imageUrl.includes('drive.google.com')) {
          row.driveError = 'No Google Drive folder or image link found for this product.';
          failedCount++;
        }
        continue;
      }

      // Retrieve files from target folder
      const files =
        targetFolderId === masterFolderId && masterFiles.length > 0
          ? masterFiles
          : await getFolderFiles(targetFolderId);

      if (files.length === 0) {
        throw new Error(`Google Drive folder (${targetFolderId}) contains no supported image files.`);
      }

      // Find the best match for this product row
      let matchedFile: DriveImageFile | null = null;

      // a) Explicit filename in row data (e.g. Design_File_Name, File Name, Artwork)
      const explicitFilename = Object.entries(row.rawRow).find(([k]) =>
        /file[_\s]?name|artwork[_\s]?file|design[_\s]?file/i.test(k)
      )?.[1];
      if (explicitFilename && typeof explicitFilename === 'string') {
        const cleanExp = explicitFilename.toLowerCase().trim();
        const baseExp = cleanExp.replace(/\.[a-z0-9]+$/i, '');
        matchedFile =
          files.find((f) => f.name.toLowerCase() === cleanExp) ||
          files.find((f) => f.name.toLowerCase().startsWith(baseExp)) ||
          files.find((f) => f.name.toLowerCase().includes(baseExp)) ||
          null;
      }

      // a2) Check if row.imageUrl is a filename (not an http/data/drive URL)
      if (!matchedFile && row.imageUrl && !row.imageUrl.startsWith('http') && !row.imageUrl.startsWith('data:')) {
        const cleanImgName = row.imageUrl.toLowerCase().trim();
        const baseImgName = cleanImgName.replace(/\.[a-z0-9]+$/i, '');
        matchedFile =
          files.find((f) => f.name.toLowerCase() === cleanImgName) ||
          files.find((f) => f.name.toLowerCase().startsWith(baseImgName)) ||
          files.find((f) => f.name.toLowerCase().includes(baseImgName)) ||
          null;
      }

      // b) SKU match
      if (!matchedFile && row.sku) {
        const cleanSku = row.sku.toLowerCase().replace(/[^a-z0-9]/g, '');
        matchedFile =
          files.find((f) => {
            const cleanName = f.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return cleanName.includes(cleanSku);
          }) || null;
      }

      // c) Product ID match
      if (!matchedFile) {
        const prodId = String(
          row.rawRow['Product ID'] || row.rawRow['Product_ID'] || row.rawRow['ID'] || row.rawRow['Id'] || ''
        );
        if (prodId) {
          const cleanId = prodId.toLowerCase().replace(/[^a-z0-9]/g, '');
          matchedFile =
            files.find((f) => {
              const cleanName = f.name.toLowerCase().replace(/[^a-z0-9]/g, '');
              return cleanName.includes(cleanId);
            }) || null;
        }
      }

      // d) Title tokens match
      if (!matchedFile && row.title) {
        const titleTokens = row.title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter((w) => w.length > 3);
        if (titleTokens.length > 0) {
          matchedFile =
            files.find((f) => {
              const nameLower = f.name.toLowerCase();
              return titleTokens.some((token) => nameLower.includes(token));
            }) || null;
        }
      }

      // e) If this folder was dedicated specifically to this row and only has 1 or 2 images
      if (!matchedFile && targetFolderId !== masterFolderId) {
        matchedFile = files[0];
      }

      // f) Sequential fallback for master folder
      if (!matchedFile && files.length > 0) {
        matchedFile = files[i % files.length];
      }

      if (!matchedFile) {
        throw new Error(`Could not find a matching design image in Google Drive for "${row.title}".`);
      }

      // Download the matched image file as base64 DataURL
      onProgress?.(i + 1, rows.length, `Importing "${matchedFile.name}" from Google Drive...`);
      const downloaded = await fetchDriveImageAsDataUrl(matchedFile.id, token);

      row.imageUrl = downloaded.dataUrl;
      row.driveFileId = matchedFile.id;
      row.driveFileName = matchedFile.name;
      row.isDriveResolved = true;
      row.driveError = undefined;
      resolvedCount++;
    } catch (err: any) {
      console.warn(`Failed to resolve Google Drive image for row ${i + 1}:`, err);
      row.driveError = err.message || 'Failed to download from Google Drive';
      failedCount++;
    }
  }

  onProgress?.(
    rows.length,
    rows.length,
    `Finished Google Drive import: ${resolvedCount} resolved, ${failedCount} failed.`
  );
  return { updatedRows: [...rows], resolvedCount, failedCount };
}

/**
 * Creates and downloads a sample Excel (.xlsx) file reference template
 */
export function generateReferenceExcelFile(): void {
  const sampleData = [
    {
      'Product ID': 'CASE-001',
      'Title': 'Stained Glass Woodland Fox Tough Phone Case',
      'Description': 'Premium double-layer protective phone case featuring vibrant stained glass cathedral fox artwork. Impact-resistant polycarbonate shell with shock-absorbing TPU interior liner. UV-protected full bleed wrap print.',
      'Tags': 'stained glass case, woodland fox, aesthetic iphone case, tough phone case, autumn leaves, cottagecore case, animal artwork, gift for her, phone cover',
      'Design Image': 'fox_stained_glass.png',
      'Google Drive Folder': 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
      'Price': 24.99,
      'SKU': 'FOX-VITRAIL-TOUGH',
    },
    {
      'Product ID': 'CASE-002',
      'Title': 'Botanical Wildflower Garden Floral Case',
      'Description': 'Hand-drawn vintage wildflower meadow pattern with golden buttercups, lavender, and pressed daisies. Ultra-clear protective case with raised camera bezel and precision button covers.',
      'Tags': 'wildflower case, botanical flowers, floral phone case, pressed flower art, vintage botanical, nature lover gift, spring phone case, daisy pattern',
      'Design Image': 'wildflower_garden.png',
      'Google Drive Folder': 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
      'Price': 24.99,
      'SKU': 'FLORAL-MEADOW-002',
    },
    {
      'Product ID': 'CASE-003',
      'Title': 'Cosmic Galaxy Nebula Starfield Case',
      'Description': 'Deep space spiral nebula with luminous celestial dust and glowing star clusters. Dual-layer shockproof construction engineered for high drop protection and everyday style.',
      'Tags': 'galaxy phone case, space nebula, astronomy gift, cosmic stars, deep space art, celestial cover, sci-fi accessory, aesthetic dark case',
      'Design Image': 'cosmic_nebula.png',
      'Google Drive Folder': 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
      'Price': 26.99,
      'SKU': 'COSMIC-NEBULA-003',
    },
    {
      'Product ID': 'CASE-004',
      'Title': 'Japanese Wave Art Minimalist Phone Case',
      'Description': 'Traditional ukiyo-e ocean wave woodblock print aesthetic rendered in modern indigo blue and seafoam white. Matte textured surface with reinforced bumper corners.',
      'Tags': 'great wave, japanese art, ocean waves, ukiyo-e aesthetic, minimal phone case, kanagawa wave, surf aesthetic, blue phone case',
      'Design Image': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80',
      'Google Drive Folder': '',
      'Price': 24.99,
      'SKU': 'JAPAN-WAVE-004',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  // Auto-fit column widths
  worksheet['!cols'] = [
    { wch: 14 }, // Product ID
    { wch: 45 }, // Title
    { wch: 75 }, // Description
    { wch: 55 }, // Tags
    { wch: 30 }, // Design Image
    { wch: 45 }, // Google Drive Folder
    { wch: 10 }, // Price
    { wch: 22 }, // SKU
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Printify_Products');

  XLSX.writeFile(workbook, 'Printify_Bulk_Import_Template.xlsx');
}

/**
 * Creates and downloads a sample CSV template reference
 */
export function generateReferenceCsvFile(): void {
  const headers = ['Product ID', 'Title', 'Description', 'Tags', 'Design Image', 'Google Drive Folder', 'Price', 'SKU'];
  const sampleRows = [
    [
      'CASE-001',
      'Stained Glass Woodland Fox Tough Phone Case',
      'Premium double-layer protective phone case with vibrant stained glass fox artwork. Impact-resistant polycarbonate shell with shock-absorbing TPU liner.',
      'stained glass case, woodland fox, aesthetic iphone case, tough phone case, gift for her',
      'fox_stained_glass.png',
      'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
      '24.99',
      'FOX-VITRAIL-TOUGH',
    ],
    [
      'CASE-002',
      'Botanical Wildflower Garden Floral Case',
      'Hand-drawn vintage wildflower meadow pattern. Ultra-clear protective case with raised camera bezel.',
      'wildflower case, botanical flowers, floral phone case, spring phone case',
      'wildflower_meadow.png',
      'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
      '24.99',
      'FLORAL-MEADOW-002',
    ],
  ];

  const escapeVal = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const csv = [
    headers.map(escapeVal).join(','),
    ...sampleRows.map((r) => r.map(escapeVal).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Printify_Bulk_Import_Template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Sequential Importer configuration options
 */
export interface SequentialImportConfig {
  shopId: string | number;
  defaultBlueprintId: string | number;
  defaultPrintProviderId: string | number;
  defaultVariantIds: number[];
  defaultPrice: number;
  customToken?: string;
  googleToken?: string;
  masterDriveFolderUrl?: string;
  delayBetweenItemsMs?: number; // small delay between API requests to avoid rate limits
}

export type SequentialImportCallbacks = {
  onItemStart?: (index: number, row: ExcelProductRow) => void;
  onItemUploadingImage?: (index: number, row: ExcelProductRow) => void;
  onItemCreatingProduct?: (index: number, row: ExcelProductRow, imageId: string) => void;
  onItemSuccess?: (index: number, row: ExcelProductRow, printifyProductId: string, result: any) => void;
  onItemError?: (index: number, row: ExcelProductRow, error: Error) => void;
  onProgress?: (current: number, total: number, percentage: number) => void;
  onComplete?: (summary: { total: number; success: number; failed: number }) => void;
};

/**
 * Processes items one by one sequentially into Printify
 */
export async function processSequentialPrintifyImport(
  items: ExcelProductRow[],
  config: SequentialImportConfig,
  callbacks: SequentialImportCallbacks = {},
  signal?: { isCancelled: boolean; isPaused: boolean }
): Promise<{ success: number; failed: number }> {
  let successCount = 0;
  let failedCount = 0;
  const token = config.customToken || getStoredPrintifyToken();

  for (let i = 0; i < items.length; i++) {
    // Check cancellation
    if (signal?.isCancelled) {
      break;
    }

    // Check pause loop
    while (signal?.isPaused && !signal?.isCancelled) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (signal?.isCancelled) break;

    const row = items[i];
    row.error = undefined;
    callbacks.onItemStart?.(i, row);

    // Validation
    if (!row.title || (!row.imageUrl && !row.driveFolderUrl && !config.masterDriveFolderUrl)) {
      const err = new Error('Row is missing required Title or Design Image / Google Drive link.');
      row.status = 'failed';
      row.error = err.message;
      failedCount++;
      callbacks.onItemError?.(i, row, err);
      callbacks.onProgress?.(i + 1, items.length, Math.round(((i + 1) / items.length) * 100));
      continue;
    }

    try {
      // Auto-resolve Google Drive image if not already converted to DataURL
      if (
        !row.isDriveResolved &&
        (!row.imageUrl ||
          row.imageUrl.includes('drive.google.com') ||
          !row.imageUrl.startsWith('http') ||
          row.driveFolderUrl ||
          config.masterDriveFolderUrl)
      ) {
        callbacks.onItemUploadingImage?.(i, row);
        const resolved = await resolveGoogleDriveImagesForRows(
          [row],
          row.driveFolderUrl || config.masterDriveFolderUrl,
          config.googleToken
        );
        if (resolved.updatedRows[0]?.isDriveResolved) {
          row.imageUrl = resolved.updatedRows[0].imageUrl;
          row.driveFileId = resolved.updatedRows[0].driveFileId;
          row.driveFileName = resolved.updatedRows[0].driveFileName;
          row.isDriveResolved = true;
        }
      }

      if (!row.imageUrl || (!row.imageUrl.startsWith('http') && !row.imageUrl.startsWith('data:'))) {
        throw new Error(
          row.driveError ||
            'Could not find or download the design image from Google Drive for this product.'
        );
      }

      // Step 1: Upload image to Printify
      row.status = 'uploading-image';
      callbacks.onItemUploadingImage?.(i, row);

      const fileName = `${row.sku || `product_${i + 1}`}_artwork.png`;
      const uploadRes = await uploadPrintifyImage(fileName, row.imageUrl, token);
      row.printifyImageId = uploadRes.imageId;

      // Step 2: Create product draft on Printify
      row.status = 'creating-product';
      callbacks.onItemCreatingProduct?.(i, row, uploadRes.imageId);

      const blueprintId = row.blueprintId || config.defaultBlueprintId || '269';
      const providerId = row.printProviderId || config.defaultPrintProviderId || '1';
      const variantIds = row.variantIds && row.variantIds.length > 0 ? row.variantIds : config.defaultVariantIds;
      const price = row.price || config.defaultPrice;

      const productPayload = {
        action: 'create',
        shopId: config.shopId,
        title: row.title,
        description: row.description,
        tags: row.tags,
        blueprintId,
        printProviderId: providerId,
        variantIds,
        artworkImageId: uploadRes.imageId,
        price,
        token,
      };

      const response = await fetch('/api/printify', {
        method: 'POST',
        headers: getPrintifyHeaders(token),
        body: JSON.stringify(productPayload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.product?.id) {
        throw new Error(data.error || data.message || `Failed to create product in Printify (${response.status})`);
      }

      // Success
      row.status = 'completed';
      row.printifyProductId = String(data.product.id);
      row.printifyProductUrl = `https://printify.com/app/store/products/${data.product.id}`;
      row.error = undefined;
      row.processedAt = Date.now();
      successCount++;

      callbacks.onItemSuccess?.(i, row, String(data.product.id), data);
    } catch (err: any) {
      let errorMsg = err.message || 'Import failed';
      if (errorMsg === 'Not found' || errorMsg.includes('Not found')) {
        errorMsg = 'Printify upload failed: Resource not found. Please verify shop connection.';
      }
      row.status = 'failed';
      row.error = errorMsg;
      failedCount++;
      callbacks.onItemError?.(i, row, err);
    }

    callbacks.onProgress?.(i + 1, items.length, Math.round(((i + 1) / items.length) * 100));

    // Optional delay between items to respect API rate limits
    if (config.delayBetweenItemsMs && i < items.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, config.delayBetweenItemsMs));
    }
  }

  callbacks.onComplete?.({ total: items.length, success: successCount, failed: failedCount });
  return { success: successCount, failed: failedCount };
}
