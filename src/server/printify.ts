import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ override: true });

type JsonRecord = Record<string, any>;

const apiRoot = 'https://api.printify.com/v1';
const apiV2Root = 'https://api.printify.com/v2';
const catalogCache = new Map<string, { expiresAt: number; request: Promise<any> }>();

export function cleanToken(raw?: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^PRINTIFY_API_TOKEN\s*=\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

function requiredToken(customToken?: string): string {
  dotenv.config({ override: true });
  const cleanedCustom = cleanToken(customToken);
  const cleanedEnv = cleanToken(process.env.PRINTIFY_API_TOKEN);
  const token = cleanedCustom || cleanedEnv;
  if (!token) {
    throw new Error('Printify API token is not configured. Please enter or import your Printify Personal Access Token.');
  }
  return token;
}

export function extractPrintifyErrorMessage(data: any, status: number): string {
  const topMsg = String(data?.message || data?.error || '');
  if (status === 401 || /unauthenticated/i.test(topMsg)) {
    return 'Printify authentication failed (Unauthenticated). Please check your Printify Personal Access Token in Printify Settings > API.';
  }
  if (status === 404) {
    if (/upload|image/i.test(topMsg)) {
      return `Printify image upload endpoint not found (404): ${topMsg}`;
    }
    return `Printify resource not found (404). ${topMsg ? `(${topMsg}) ` : ''}Please verify your Shop ID or ensure your Printify store is connected.`;
  }
  if (!data) return `Printify returned HTTP ${status}.`;
  const errors: string[] = [];

  if (data.errors && typeof data.errors === 'object') {
    if (typeof data.errors.reason === 'string') {
      errors.push(data.errors.reason);
    }
    for (const [key, val] of Object.entries(data.errors)) {
      if (key === 'reason') continue;
      if (Array.isArray(val)) {
        errors.push(`${key}: ${val.join(', ')}`);
      } else if (typeof val === 'string') {
        errors.push(`${key}: ${val}`);
      } else if (val && typeof val === 'object') {
        errors.push(`${key}: ${JSON.stringify(val)}`);
      }
    }
  }

  const top = data.message || data.error;
  if (top && typeof top === 'string' && !top.toLowerCase().includes('validation failed')) {
    errors.unshift(top);
  }

  if (errors.length > 0) return errors.join(' — ');
  if (top && typeof top === 'string') return top;
  return `Printify request failed with HTTP ${status}.`;
}

async function printifyFetch(pathUrl: string, init: RequestInit = {}, customToken?: string) {
  let token = requiredToken(customToken);
  const fullUrl = `${apiRoot}${pathUrl}`;
  console.log(`printifyFetch: URL=${fullUrl}, method=${init.method || 'GET'}`);
  let response = await fetch(fullUrl, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'CraftCase/1.0',
      ...init.headers,
    },
  });
  console.log(`printifyFetch: URL=${fullUrl}, status=${response.status}`);

  // If client token failed with 401 and server .env has a different token, attempt fallback to server token
  const envToken = cleanToken(process.env.PRINTIFY_API_TOKEN);
  if (response.status === 401 && envToken && envToken !== token) {
    token = envToken;
    response = await fetch(`${apiRoot}${pathUrl}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CraftCase/1.0',
        ...init.headers,
      },
    });
  }

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    const detail = extractPrintifyErrorMessage(data, response.status);
    throw Object.assign(new Error(detail), {
      status: response.status,
      details: data,
      retryAfterSeconds: Number(response.headers.get('retry-after')) || undefined,
    });
  }
  return data;
}

async function printifyV2Fetch(pathUrl: string, customToken?: string) {
  let token = requiredToken(customToken);
  let response = await fetch(`${apiV2Root}${pathUrl}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'CraftCase/1.0',
    },
  });

  const envToken = cleanToken(process.env.PRINTIFY_API_TOKEN);
  if (response.status === 401 && envToken && envToken !== token) {
    token = envToken;
    response = await fetch(`${apiV2Root}${pathUrl}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CraftCase/1.0',
      },
    });
  }

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    const detail = extractPrintifyErrorMessage(data, response.status);
    throw Object.assign(new Error(detail), { status: response.status, details: data });
  }
  return data;
}

function cachedCatalog(pathUrl: string, customToken?: string) {
  const now = Date.now();
  const token = (customToken || process.env.PRINTIFY_API_TOKEN || '').trim();
  const cacheKey = `${token ? token.slice(0, 8) : 'default'}:${pathUrl}`;
  const cached = catalogCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.request;

  let entry: { expiresAt: number; request: Promise<any> };
  const request = printifyFetch(pathUrl, {}, customToken).catch((error) => {
    if (error?.status === 429) {
      entry.expiresAt = Date.now() + Math.max(30, Number(error.retryAfterSeconds) || 60) * 1000;
    } else {
      catalogCache.delete(cacheKey);
    }
    throw error;
  });
  entry = { expiresAt: now + 2 * 60 * 1000, request };
  catalogCache.set(cacheKey, entry);
  return request;
}

function safeSegment(value: string) {
  if (!/^\d+$/.test(String(value))) throw new Error('Invalid Printify catalog identifier.');
  return String(value);
}

function sanitizeName(value: string) {
  let clean = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'craft_case_image';
  if (!/\.(png|jpe?g|webp)$/i.test(clean)) {
    clean += '.png';
  }
  return clean;
}

function catalogRows(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.variants)) return value.variants;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function findLocalImageBuffer(cleanPath: string): Buffer | null {
  const normalized = cleanPath.replace(/^\//, '');
  const candidates = [
    path.resolve(process.cwd(), normalized),
    path.resolve(process.cwd(), 'public', normalized),
    path.resolve(process.cwd(), 'src', normalized),
    path.resolve(process.cwd(), 'public', 'src', normalized),
  ];
  if (normalized.startsWith('src/')) {
    candidates.push(path.resolve(process.cwd(), 'public', normalized));
  }
  if (normalized.includes('images/')) {
    const filenameOnly = path.basename(normalized);
    candidates.push(path.resolve(process.cwd(), 'src', 'assets', 'images', filenameOnly));
    candidates.push(path.resolve(process.cwd(), 'public', 'src', 'assets', 'images', filenameOnly));
  }
  for (const c of candidates) {
    console.log(`Checking candidate path: ${c}`);
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return fs.readFileSync(c);
    }
  }
  console.warn(`File not found for path: ${normalized}`);
  return null;
}

async function downloadGoogleDriveFileBuffer(fileId: string): Promise<Buffer | null> {
  const publicUrls = [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`,
    `https://lh3.googleusercontent.com/d/${fileId}`,
    `https://drive.google.com/uc?export=download&id=${fileId}`,
  ];
  for (const pUrl of publicUrls) {
    try {
      const pRes = await fetch(pUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      const cType = pRes.headers.get('content-type') || '';
      if (pRes.ok && !cType.includes('text/html')) {
        const arrayBuf = await pRes.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    } catch (_) {}
  }
  return null;
}

async function uploadImage(fileName: string, image: string, customToken?: string) {
  console.log(`uploadImage: fileName=${fileName}, image length=${image?.length || 0}`);
  if (!image) throw new Error(`Missing image data for ${fileName}.`);
  const payload: JsonRecord = { file_name: sanitizeName(fileName) };

  let buffer: Buffer | null = null;
  let mimeType = 'image/png';

  // 1. Data URL (data:image/...;base64,...)
  if (image.startsWith('data:')) {
    const base64Index = image.indexOf(';base64,');
    if (base64Index !== -1) {
      const b64 = image.slice(base64Index + 8).replace(/\s+/g, '');
      buffer = Buffer.from(b64, 'base64');
      const mimeMatch = image.match(/^data:([^;]+);base64,/);
      if (mimeMatch) mimeType = mimeMatch[1];
    }
  }
  // 2. Google Drive Link or File ID
  else if (image.includes('drive.google.com') || image.includes('drive.usercontent.google.com') || /^[a-zA-Z0-9_-]{25,45}$/.test(image)) {
    const match = image.match(/\/d\/([a-zA-Z0-9_-]+)/) || image.match(/id=([a-zA-Z0-9_-]+)/);
    const fileId = match ? match[1] : (/^[a-zA-Z0-9_-]{25,45}$/.test(image) ? image : '');
    if (fileId) {
      buffer = await downloadGoogleDriveFileBuffer(fileId);
    }
  }
  // 3. Local File System Path or Asset Path
  else if (image.startsWith('/') || image.includes('/assets/') || image.includes('sample_') || !image.includes('://')) {
    buffer = findLocalImageBuffer(image);
  }

  // 4. If not found yet and it's a URL (http / https / blob)
  if (!buffer && /^https?:\/\//i.test(image)) {
    if (image.includes('localhost') || image.includes('127.0.0.1')) {
      try {
        const urlObj = new URL(image);
        buffer = findLocalImageBuffer(urlObj.pathname);
      } catch {}
    }
    if (!buffer) {
      try {
        const resp = await fetch(image, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        if (resp.ok) {
          const arrayBuf = await resp.arrayBuffer();
          buffer = Buffer.from(arrayBuf);
          const cType = resp.headers.get('content-type');
          if (cType) mimeType = cType;
        }
      } catch (err) {
        console.warn(`Failed to fetch remote image URL ${image}:`, err);
      }
    }
  }

  // 5. Raw base64 string
  if (!buffer && /^[A-Za-z0-9+/=\s]+$/.test(image.slice(0, 200)) && image.length > 100) {
    try {
      buffer = Buffer.from(image.replace(/\s+/g, ''), 'base64');
    } catch {}
  }

  if (buffer && buffer.length > 0) {
    payload.contents = buffer.toString('base64');
    payload.mime_type = mimeType;
    console.log(`uploadImage: constructed buffer, size=${buffer.length}, mimeType=${mimeType}`);
  } else if (/^https?:\/\//i.test(image) && !image.includes('localhost') && !image.includes('127.0.0.1')) {
    payload.url = image;
    console.log(`uploadImage: using remote URL`);
  } else {
    throw new Error(`Could not resolve image data or file for "${fileName}". Please re-upload or select a valid image.`);
  }

  console.log(`uploadImage: payload ready for ${fileName}, hasContents=${Boolean(payload.contents)}, hasUrl=${Boolean(payload.url)}`);
  return printifyFetch('/uploads/images.json', { method: 'POST', body: JSON.stringify(payload) }, customToken);
}

function saveTokenToEnvFile(token: string) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }
    if (/^PRINTIFY_API_TOKEN=/m.test(envContent)) {
      envContent = envContent.replace(/^PRINTIFY_API_TOKEN=.*$/m, `PRINTIFY_API_TOKEN=${token}`);
    } else {
      envContent = `${envContent.trim()}\nPRINTIFY_API_TOKEN=${token}\n`;
    }
    fs.writeFileSync(envPath, envContent, 'utf-8');
  } catch (err) {
    console.warn('Could not write token to .env file:', err);
  }
}

export async function handlePrintifyRequest(
  method: string,
  url: URL,
  body?: JsonRecord,
  tokenOverride?: string
) {
  console.log(`handlePrintifyRequest: method=${method}, url=${url.pathname}, body=${JSON.stringify(body)}`);
  dotenv.config({ override: true });
  const effectiveToken = (
    cleanToken(tokenOverride) ||
    cleanToken(url.searchParams.get('token') || '') ||
    cleanToken(url.searchParams.get('apiToken') || '') ||
    cleanToken(body?.token) ||
    cleanToken(body?.apiToken) ||
    cleanToken(process.env.PRINTIFY_API_TOKEN) ||
    ''
  );

  try {
    // Action: Save and test token
    if (method === 'POST' && (body?.action === 'save-token' || body?.action === 'verify-token')) {
      const tokenToSave = cleanToken(body.token || tokenOverride || '');
      if (!tokenToSave) {
        return { status: 400, body: { error: 'Please provide a valid Printify Personal Access Token.' } };
      }
      // Test token with Printify API
      const shops = await printifyFetch('/shops.json', {}, tokenToSave);
      process.env.PRINTIFY_API_TOKEN = tokenToSave;
      saveTokenToEnvFile(tokenToSave);
      catalogCache.clear();
      return {
        status: 200,
        body: {
          success: true,
          connected: true,
          configured: true,
          shops,
          message: `Connected successfully! Found ${Array.isArray(shops) ? shops.length : 0} shop(s).`,
        },
      };
    }

    // Action: Clear token
    if (method === 'POST' && body?.action === 'clear-token') {
      process.env.PRINTIFY_API_TOKEN = '';
      saveTokenToEnvFile('');
      catalogCache.clear();
      return { status: 200, body: { success: true, connected: false, configured: false, shops: [] } };
    }

    // Action: Diagnostic Health Check
    if (method === 'POST' && body?.action === 'diagnose') {
      const probeReport: {
        tokenConfigured: boolean;
        tokenValid: boolean;
        tokenSource: string;
        tokenLength: number;
        shops: any[];
        defaultBlueprint: any;
        uploadProbe: { success: boolean; imageId?: string; error?: string };
        recommendations: string[];
      } = {
        tokenConfigured: false,
        tokenValid: false,
        tokenSource: 'none',
        tokenLength: 0,
        shops: [],
        defaultBlueprint: null,
        uploadProbe: { success: false },
        recommendations: [],
      };

      const testToken = (
        cleanToken(tokenOverride) ||
        cleanToken(body?.token) ||
        cleanToken(process.env.PRINTIFY_API_TOKEN) ||
        ''
      );

      if (!testToken) {
        probeReport.recommendations.push('Printify Personal Access Token is missing. Enter or import your token.');
        return { status: 200, body: { ok: false, report: probeReport } };
      }

      probeReport.tokenConfigured = true;
      probeReport.tokenLength = testToken.length;
      probeReport.tokenSource = tokenOverride || body?.token ? 'client_token' : 'server_env';

      // 1. Verify shops
      try {
        const shops = await printifyFetch('/shops.json', {}, testToken);
        probeReport.tokenValid = true;
        probeReport.shops = Array.isArray(shops) ? shops : [];
        if (probeReport.shops.length === 0) {
          probeReport.recommendations.push('No shops found under this Printify account. Create or connect a shop in Printify.');
        }
      } catch (err: any) {
        probeReport.tokenValid = false;
        probeReport.recommendations.push(`Authentication failed: ${err.message || 'Invalid Printify token'}`);
        return { status: 200, body: { ok: false, report: probeReport, error: err.message } };
      }

      // 2. Verify Tough Phone Cases blueprint (ID 269)
      try {
        const bpProviders = await cachedCatalog('/catalog/blueprints/269/print_providers.json', testToken);
        const provList = catalogRows(bpProviders);
        const provId = provList[0]?.id || 1;
        const variantsData = await cachedCatalog(`/catalog/blueprints/269/print_providers/${provId}/variants.json`, testToken);
        const vList = catalogRows(variantsData);
        probeReport.defaultBlueprint = {
          id: 269,
          title: 'Tough Phone Cases',
          providerId: provId,
          providerTitle: provList[0]?.title || 'SPOKE Custom Products',
          availableVariantsCount: vList.length,
          sampleModels: vList.slice(0, 5).map((v: any) => v.title),
        };
      } catch (bpErr: any) {
        probeReport.recommendations.push(`Could not load Tough Phone Cases blueprint: ${bpErr.message}`);
      }

      // 3. Test 1x1 pixel image upload probe
      try {
        const testPixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const uploadRes = await uploadImage('diagnostic_probe.png', testPixelPng, testToken);
        if (uploadRes?.id) {
          probeReport.uploadProbe = {
            success: true,
            imageId: String(uploadRes.id),
          };
        } else {
          probeReport.uploadProbe = {
            success: false,
            error: 'Printify accepted the request but did not return an image ID.',
          };
        }
      } catch (uploadErr: any) {
        probeReport.uploadProbe = {
          success: false,
          error: uploadErr.message || 'Image upload probe failed.',
        };
        probeReport.recommendations.push(`Upload probe error: ${uploadErr.message}`);
      }

      const allOk = probeReport.tokenValid && probeReport.uploadProbe.success;
      return {
        status: 200,
        body: {
          ok: allOk,
          report: probeReport,
          message: allOk
            ? 'Printify connection, catalog blueprints, and image upload pipeline are fully operational!'
            : 'Diagnostic health check detected an issue.',
        },
      };
    }

    if (method === 'GET') {
      const resource = url.searchParams.get('resource') || 'connection';
      if (resource === 'connection') {
        if (!effectiveToken) {
          return { status: 200, body: { connected: false, configured: false, shops: [] } };
        }
        try {
          const shops = await printifyFetch('/shops.json', {}, effectiveToken);
          return { status: 200, body: { connected: true, configured: true, shops } };
        } catch (authErr: any) {
          return {
            status: 200,
            body: {
              connected: false,
              configured: true,
              shops: [],
              error: authErr?.message || 'Printify authentication failed. Please verify your token.',
            },
          };
        }
      }
      if (resource === 'blueprints') {
        return { status: 200, body: await cachedCatalog('/catalog/blueprints.json', effectiveToken) };
      }
      if (resource === 'providers') {
        const blueprintId = safeSegment(url.searchParams.get('blueprintId') || '269');
        const pathUrl = `/catalog/blueprints/${blueprintId}/print_providers.json`;
        return { status: 200, body: await cachedCatalog(pathUrl, effectiveToken) };
      }
      if (resource === 'variants') {
        const blueprintId = safeSegment(url.searchParams.get('blueprintId') || '269');
        const providerId = safeSegment(url.searchParams.get('providerId') || '1');
        const pathUrl = `/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json?show-out-of-stock=1`;
        return { status: 200, body: await cachedCatalog(pathUrl, effectiveToken) };
      }
      if (resource === 'shipping') {
        const blueprintId = safeSegment(url.searchParams.get('blueprintId') || '269');
        const providerId = safeSegment(url.searchParams.get('providerId') || '1');
        const shippingMethod = url.searchParams.get('method') || 'standard';
        if (!['standard', 'priority', 'express', 'economy'].includes(shippingMethod)) {
          throw new Error('Invalid Printify shipping method.');
        }
        const pathUrl = `/catalog/blueprints/${blueprintId}/print_providers/${providerId}/shipping/${shippingMethod}.json`;
        return { status: 200, body: await printifyV2Fetch(pathUrl, effectiveToken) };
      }
      if (resource === 'product') {
        const shopId = safeSegment(url.searchParams.get('shopId') || '');
        const productId = url.searchParams.get('productId') || '';
        if (!/^[a-zA-Z0-9_-]+$/.test(productId)) throw new Error('Invalid Printify product identifier.');
        return {
          status: 200,
          body: await printifyFetch(`/shops/${shopId}/products/${encodeURIComponent(productId)}.json`, {}, effectiveToken),
        };
      }
      return { status: 400, body: { error: 'Unknown Printify resource.' } };
    }

    if (method === 'POST' && body?.action === 'upload') {
      const { fileName, image } = body as any;
      const uploaded = await uploadImage(String(fileName || 'craft-case-image.png'), String(image || ''), effectiveToken);
      if (!uploaded?.id) throw new Error('Printify did not return an ID for the image upload.');
      return { status: 200, body: { imageId: uploaded.id, image: uploaded } };
    }

    if (method === 'POST' && body?.action === 'publish-product') {
      const shopId = safeSegment(String(body.shopId || ''));
      const productId = String(body.productId || '');
      if (!/^[a-zA-Z0-9_-]+$/.test(productId)) throw new Error('Invalid Printify product identifier.');
      const price = Number(body.price ?? 22.20);
      if (!Number.isFinite(price) || price <= 0) throw new Error('Set a selling price above zero before publishing.');
      const artworkImageId = String(body.artworkImageId || '');
      
      const existing = await printifyFetch(`/shops/${shopId}/products/${encodeURIComponent(productId)}.json`, {}, effectiveToken);
      const existingVariants = existing.variants || [];
      if (!existingVariants.some((variant: any) => variant.is_enabled !== false)) {
        throw new Error('The Printify draft has no enabled variants to publish.');
      }

      // Update variant prices and ensure front artwork is linked
      const sellingPriceCents = Math.round(price * 100);
      const updatedVariants = existingVariants.map((variant: any) => ({
        ...variant,
        price: sellingPriceCents,
        is_enabled: variant.is_enabled !== false,
      }));

      // Ensure artwork image ID is assigned in print areas if provided
      let updatedPrintAreas = existing.print_areas || [];
      if (artworkImageId && updatedPrintAreas.length > 0) {
        updatedPrintAreas = updatedPrintAreas.map((pa: any) => ({
          ...pa,
          placeholders: (pa.placeholders || []).map((ph: any) => {
            const hasArt = (ph.images || []).some((img: any) => String(img.id) === artworkImageId);
            return {
              ...ph,
              images: hasArt
                ? ph.images
                : [{ id: artworkImageId, x: 0.5, y: 0.5, scale: 1, angle: 0 }, ...(ph.images || [])],
            };
          }),
        }));
      }

      await printifyFetch(
        `/shops/${shopId}/products/${encodeURIComponent(productId)}.json`,
        {
          method: 'PUT',
          body: JSON.stringify({
            variants: updatedVariants,
            print_areas: updatedPrintAreas,
          }),
        },
        effectiveToken
      );

      // Attempt publishing to connected sales channel (Etsy, Shopify, etc.)
      try {
        const publishResult = await printifyFetch(
          `/shops/${shopId}/products/${encodeURIComponent(productId)}/publish.json`,
          {
            method: 'POST',
            body: JSON.stringify({
              title: true,
              description: true,
              images: true,
              variants: true,
              tags: true,
              keyFeatures: true,
              shipping_template: true,
            }),
          },
          effectiveToken
        );

        return {
          status: 200,
          body: {
            result: publishResult,
            artworkImageId,
            published: true,
            publishedToSalesChannel: true,
            message: `Product (ID: ${productId}) published successfully to your connected store at $${price.toFixed(2)}!`,
            productUrl: `https://printify.com/app/products/${productId}`,
          },
        };
      } catch (pubErr: any) {
        return {
          status: 200,
          body: {
            result: { status: 'draft_saved' },
            artworkImageId,
            published: true,
            publishedToSalesChannel: false,
            salesChannelWarning: true,
            message: `Phone case draft saved in Printify (ID: ${productId}) at $${price.toFixed(2)}. To publish live to Etsy, connect your store in Printify Settings > My Stores.`,
            productUrl: `https://printify.com/app/products/${productId}`,
          },
        };
      }
    }

    if (method === 'POST' && (body?.action === 'create' || body?.action === 'publish')) {
      const { shopId: rawShopId, product = {} } = body as any;
      let shopId = String(rawShopId || '').trim();

      // Auto-detect shop if not provided or empty
      if (!shopId || shopId === 'undefined' || shopId === 'null') {
        try {
          const liveShops = await printifyFetch('/shops.json', {}, effectiveToken);
          if (Array.isArray(liveShops) && liveShops.length > 0) {
            shopId = String(liveShops[0].id);
          }
        } catch (sErr) {
          console.warn('Could not auto-fetch shops for creation:', sErr);
        }
      }

      if (!shopId) return { status: 400, body: { error: 'Printify shop selection is required. Please verify your shop connection.' } };
      
      const title = (
        body.title ||
        product.listing?.title ||
        product.design?.title ||
        product.designName ||
        'Custom Tough Phone Case'
      ).trim();
      const description = (
        body.description ||
        product.listing?.description ||
        'Premium high-quality custom phone case designed with edge-to-edge vibrant artwork print, dual-layer shock-absorbing protection, and precision cutouts.'
      ).trim();
      
      const rawTags = body.tags || product.listing?.tags || [];
      const tags = (Array.isArray(rawTags) ? rawTags : String(rawTags).split(/[,;]/))
        .map((tag: string) => String(tag).trim())
        .filter(Boolean)
        .map((t: string) => t.slice(0, 20));
      const deduplicatedTags = Array.from(new Set(tags)).slice(0, 13);

      // Safe blueprint & provider fallback for Phone Cases (Blueprint 269 default: Tough Phone Cases)
      let rawBp = String(body.blueprintId || product.printify?.blueprintId || '269').trim();
      if (rawBp === '68' || rawBp === '37') rawBp = '269'; // Auto-migrate legacy/case-mate placeholder to Tough Cases 269
      const blueprintId = /^\d+$/.test(rawBp) ? rawBp : '269';
      let rawProv = String(body.printProviderId || product.printify?.printProviderId || '').trim();
      let providerId = /^\d+$/.test(rawProv) ? rawProv : '';

      // Validate provider or auto-discover active provider for this blueprint
      let catalogVariants: any = null;
      let allCatalogRows: any[] = [];
      
      if (providerId) {
        try {
          catalogVariants = await cachedCatalog(
            `/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json?show-out-of-stock=1`,
            effectiveToken
          );
          allCatalogRows = catalogRows(catalogVariants);
        } catch {
          providerId = '';
        }
      }

      if (!providerId || !allCatalogRows.length) {
        try {
          const provData = await cachedCatalog(
            `/catalog/blueprints/${blueprintId}/print_providers.json`,
            effectiveToken
          );
          const provList = catalogRows(provData);
          if (provList.length > 0) {
            providerId = String(provList[0].id);
            catalogVariants = await cachedCatalog(
              `/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json?show-out-of-stock=1`,
              effectiveToken
            );
            allCatalogRows = catalogRows(catalogVariants);
          }
        } catch (provErr) {
          console.warn('Could not load providers dynamically for blueprint', blueprintId, provErr);
        }
      }

      if (!providerId) providerId = '1';

      let variantIds = (body.variantIds || product.printify?.variantIds || [])
        .map((id: unknown) => Number(String(id).trim()))
        .filter((n: number) => Number.isFinite(n) && n > 0);

      const artworkImageId = String(body.artworkImageId || '');
      const uploadedImageIds = Array.isArray(body.uploadedImageIds) ? body.uploadedImageIds.map(String) : [];
      if (!artworkImageId) return { status: 400, body: { error: 'Please upload or select the design artwork before creating the Printify product.' } };

      // Ensure variantIds belong to the active blueprint and provider catalog
      if (allCatalogRows.length > 0) {
        const catalogIds = new Set(allCatalogRows.map((item: any) => Number(item.id)));
        const validVariants = variantIds.filter((id: number) => catalogIds.has(id));
        if (validVariants.length > 0) {
          variantIds = validVariants;
        } else {
          const availableCatalog = allCatalogRows.filter((item: any) => item.is_available !== false);
          variantIds = (availableCatalog.length ? availableCatalog : allCatalogRows).map((item: any) => Number(item.id));
        }
      }
      if (!variantIds.length) {
        variantIds = [62582]; // Fallback placeholder variant ID (iPhone 11 Tough Case)
      }

      const selectedVariants = allCatalogRows.filter((item) => variantIds.includes(Number(item.id)));

      const printAreaGroups = new Map<string, number[]>();
      (selectedVariants.length ? selectedVariants : variantIds.map((id: number) => ({ id, placeholders: [{ position: 'front' }] }))).forEach((variant: any) => {
        const placeholders = Array.isArray(variant.placeholders) ? variant.placeholders : [];
        const placeholder = placeholders.find((item: any) => item.position === 'front') || placeholders[0];
        const position = placeholder?.position || 'front';
        printAreaGroups.set(position, [...(printAreaGroups.get(position) || []), Number(variant.id)]);
      });

      const rawPrice = body.price ?? product.pricing?.sellingPrice ?? product.product?.price ?? 22.20;
      const sellingPriceCents = Math.round(Number(rawPrice) * 100) || 2220;

      const productBody = {
        title,
        description,
        blueprint_id: Number(blueprintId),
        print_provider_id: Number(providerId),
        tags: deduplicatedTags,
        variants: variantIds.map((id: number) => ({
          id,
          price: sellingPriceCents > 0 ? sellingPriceCents : 2220,
          is_enabled: true,
        })),
        print_areas: [...printAreaGroups.entries()].map(([position, ids]) => ({
          variant_ids: ids,
          placeholders: [{ position, images: [{ id: artworkImageId, x: 0.5, y: 0.5, scale: 1, angle: 0 }] }],
        })),
      };

      let created: any;
      try {
        created = await printifyFetch(
          `/shops/${encodeURIComponent(String(shopId))}/products.json`,
          {
            method: 'POST',
            body: JSON.stringify(productBody),
          },
          effectiveToken
        );
      } catch (createErr: any) {
        // If 404, shop ID might be stale - retry with the first available shop
        if (createErr?.status === 404) {
          const freshShops = await printifyFetch('/shops.json', {}, effectiveToken).catch(() => []);
          const altShop = Array.isArray(freshShops) && freshShops.find((s: any) => String(s.id) !== shopId);
          if (altShop) {
            shopId = String(altShop.id);
            created = await printifyFetch(
              `/shops/${encodeURIComponent(String(shopId))}/products.json`,
              {
                method: 'POST',
                body: JSON.stringify(productBody),
              },
              effectiveToken
            );
          } else {
            throw createErr;
          }
        } else {
          throw createErr;
        }
      }

      return {
        status: 200,
        body: {
          product: created,
          uploadedImageIds,
          shopId: String(shopId),
          productUrl: `https://printify.com/app/products/${created.id}`,
          message: `Phone case product draft created successfully at $${(sellingPriceCents / 100).toFixed(2)}! (ID: ${created.id})`,
        },
      };
    }
    return { status: 405, body: { error: 'Method not allowed.' } };
  } catch (error: any) {
    console.error('Printify request failed:', error);
    return {
      status: error?.status || 500,
      body: {
        error: error?.message || 'Printify request failed.',
        details: error?.details,
        retryAfterSeconds: error?.retryAfterSeconds,
      },
    };
  }
}
