/**
 * Printify Client Service
 * Handles API Token management (localStorage + server sync),
 * Catalog loading, Mockup & Artwork uploading, Product Draft creation, Store Publishing, and Diagnostic Health Checks.
 */

export const PRINTIFY_TOKEN_STORAGE_KEY = 'casecraft_printify_api_token';

export function sanitizeClientToken(raw?: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^PRINTIFY_API_TOKEN\s*=\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

export function getStoredPrintifyToken(): string {
  try {
    const raw = localStorage.getItem(PRINTIFY_TOKEN_STORAGE_KEY) || '';
    return sanitizeClientToken(raw);
  } catch {
    return '';
  }
}

export function setStoredPrintifyToken(token: string): void {
  try {
    const clean = sanitizeClientToken(token);
    if (clean) {
      localStorage.setItem(PRINTIFY_TOKEN_STORAGE_KEY, clean);
    } else {
      localStorage.removeItem(PRINTIFY_TOKEN_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Could not write Printify token to localStorage:', e);
  }
}

export function clearStoredPrintifyToken(): void {
  try {
    localStorage.removeItem(PRINTIFY_TOKEN_STORAGE_KEY);
  } catch (e) {
    console.warn('Could not clear Printify token from localStorage:', e);
  }
}

/**
 * Extracts a Printify Personal Access Token from raw file content (.env, .txt, .json, .key)
 */
export function parsePrintifyKeyFromFile(content: string): string | null {
  if (!content) return null;
  const trimmed = content.trim();

  // 1. JSON format
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const possibleKeys = [
        'PRINTIFY_API_TOKEN',
        'printify_api_token',
        'token',
        'apiToken',
        'apiKey',
        'printify_token',
        'key',
        'PRINTIFY_KEY',
        'printify_key',
        'accessToken',
      ];
      for (const k of possibleKeys) {
        if (parsed[k] && typeof parsed[k] === 'string' && parsed[k].trim()) {
          return sanitizeClientToken(parsed[k]);
        }
      }
    } catch {
      // not valid JSON
    }
  }

  // 2. .env file or KEY=VALUE line
  const envMatch = trimmed.match(
    /(?:PRINTIFY_API_TOKEN|PRINTIFY_TOKEN|PRINTIFY_KEY|API_KEY|TOKEN)\s*=\s*["']?([^"'\r\n]+)["']?/i
  );
  if (envMatch && envMatch[1]) {
    return sanitizeClientToken(envMatch[1]);
  }

  // 3. Raw JWT token starting with eyJ...
  const jwtMatch = trimmed.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
  if (jwtMatch) {
    return sanitizeClientToken(jwtMatch[0]);
  }

  // 4. Single-line plain token string
  const firstLine = trimmed.split(/[\r\n]+/)[0].trim().replace(/^["']|["']$/g, '');
  if (firstLine.length > 20 && !firstLine.includes(' ')) {
    return sanitizeClientToken(firstLine);
  }

  return null;
}

export function getPrintifyHeaders(customToken?: string): HeadersInit {
  const token = sanitizeClientToken(customToken || getStoredPrintifyToken());
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['x-printify-token'] = token;
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchPrintifyApi(
  resource: string,
  params: Record<string, string> = {},
  customToken?: string
) {
  const token = sanitizeClientToken(customToken || getStoredPrintifyToken());
  const query = new URLSearchParams({ resource, ...params });
  if (token) {
    query.set('token', token);
  }
  const response = await fetch(`/api/printify?${query}`, {
    headers: getPrintifyHeaders(token),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Printify request failed (${response.status}).`);
  }
  return data;
}

export async function saveAndVerifyPrintifyToken(token: string) {
  const cleanToken = sanitizeClientToken(token);
  if (!cleanToken) {
    throw new Error('Please enter a valid Printify Personal Access Token.');
  }

  const response = await fetch('/api/printify', {
    method: 'POST',
    headers: getPrintifyHeaders(cleanToken),
    body: JSON.stringify({ action: 'save-token', token: cleanToken }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || `Failed to verify token (${response.status})`);
  }

  setStoredPrintifyToken(cleanToken);
  return data;
}

export async function clearPrintifyTokenOnServer() {
  clearStoredPrintifyToken();
  const response = await fetch('/api/printify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'clear-token' }),
  });
  return response.json().catch(() => ({}));
}

export async function diagnosePrintifyHealth(customToken?: string) {
  const token = sanitizeClientToken(customToken || getStoredPrintifyToken());
  const response = await fetch('/api/printify', {
    method: 'POST',
    headers: getPrintifyHeaders(token),
    body: JSON.stringify({ action: 'diagnose', token }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Failed to complete Printify diagnostic health check.');
  }
  return data;
}

export async function convertSourceToDataUrl(source: string): Promise<string> {
  if (source.startsWith('data:')) return source;

  // Attempt 1: Fetch directly (works for same-origin URLs, blobs, or CORS-enabled endpoints)
  try {
    const response = await fetch(source);
    if (response.ok) {
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('Could not encode image data.'));
        };
        reader.onerror = () => reject(new Error('Could not encode image data.'));
        reader.readAsDataURL(blob);
      });
    }
  } catch (err) {
    console.warn('Fetch to blob failed, falling back to canvas/image element:', err);
  }

  // Attempt 2: Load as HTML Image and draw to canvas (works for local asset paths in browser)
  if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || 1024;
            canvas.height = img.naturalHeight || 1024;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas context not available'));
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch (canvasErr) {
            reject(canvasErr);
          }
        };
        img.onerror = () => reject(new Error('Failed to load image in DOM'));
        img.src = source;
      });
      if (dataUrl && dataUrl.startsWith('data:image')) {
        return dataUrl;
      }
    } catch (domErr) {
      console.warn('Canvas rendering fallback failed:', domErr);
    }
  }

  // Attempt 3: Pass original source string so backend can read from file system or external URL
  return source;
}

export async function uploadPrintifyImage(
  fileName: string,
  imageSource: string,
  customToken?: string
): Promise<{ imageId: string; previewUrl?: string }> {
  const token = sanitizeClientToken(customToken || getStoredPrintifyToken());
  const dataUrl = await convertSourceToDataUrl(imageSource);

  const response = await fetch('/api/printify', {
    method: 'POST',
    headers: getPrintifyHeaders(token),
    body: JSON.stringify({
      action: 'upload',
      fileName,
      image: dataUrl,
      token,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.imageId) {
    throw new Error(data.error || `Failed to upload image "${fileName}" to Printify.`);
  }

  return {
    imageId: String(data.imageId),
    previewUrl: data.image?.preview_url,
  };
}
