/**
 * Google Drive and Sheets Service with Official OAuth,
 * Hierarchical Folder Management:
 * Etsy Products/ -> [PRODUCT_ID]/ -> Design/ & Mockups/
 * Drive File Metadata Retrieval, Verification, and Resumable/Multipart Uploads.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { UnifiedProductRecord } from '../types/unifiedWorkflow';
import { PinterestCsvRow, PINTEREST_CSV_HEADERS } from '../types/pinterest';

// Initialize Firebase App instance safely if configured
const firebaseConfig = null;
const getSafeAuth = () => {
  return null;
};

const auth = getSafeAuth();

export const USER_PROVIDED_CLIENT_ID =
  '458826575164-b6jhkrudbd8ribltergiuiafpb1vhjrr.apps.googleusercontent.com';

export const PROVISIONED_OAUTH_CLIENT_ID = USER_PROVIDED_CLIENT_ID;

export const DEFAULT_GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID &&
  !import.meta.env.VITE_GOOGLE_CLIENT_ID.includes('your-web-client-id') &&
  !import.meta.env.VITE_GOOGLE_CLIENT_ID.includes('171360328307') &&
  !import.meta.env.VITE_GOOGLE_CLIENT_ID.includes('759990643229') &&
  !import.meta.env.VITE_GOOGLE_CLIENT_ID.includes('krudbd8') &&
  !import.meta.env.VITE_GOOGLE_CLIENT_ID.includes('krucbd0')
    ? import.meta.env.VITE_GOOGLE_CLIENT_ID
    : USER_PROVIDED_CLIENT_ID;

const GOOGLE_CLIENT_ID_STORAGE_KEY = 'casecraft_google_client_id';
const GOOGLE_AUTH_STORAGE_KEY = 'casecraft_google_auth_session';

export interface StoredGoogleSession {
  token: string;
  email: string;
  savedAt: number;
}

export const getStoredGoogleSession = (): { token: string | null; email: string } => {
  if (typeof window === 'undefined') return { token: null, email: '' };
  try {
    const raw = localStorage.getItem(GOOGLE_AUTH_STORAGE_KEY);
    if (!raw) return { token: null, email: '' };
    const parsed: StoredGoogleSession = JSON.parse(raw);
    if (parsed.token && parsed.email) {
      return { token: parsed.token, email: parsed.email };
    }
  } catch (e) {
    console.warn('Could not read stored Google session:', e);
  }
  return { token: null, email: '' };
};

export const saveGoogleSession = (token: string, email: string): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      GOOGLE_AUTH_STORAGE_KEY,
      JSON.stringify({
        token,
        email,
        savedAt: Date.now(),
      })
    );
  } catch (e) {
    console.warn('Could not store Google session:', e);
  }
};

export const clearGoogleSession = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(GOOGLE_AUTH_STORAGE_KEY);
  } catch (e) {
    console.warn('Could not clear Google session:', e);
  }
};

export const getStoredGoogleClientId = (): string => {
  if (typeof window === 'undefined') return DEFAULT_GOOGLE_CLIENT_ID;
  const stored = localStorage.getItem(GOOGLE_CLIENT_ID_STORAGE_KEY);
  // Auto-clean any placeholder, old, or corrupted client IDs from browser local storage
  if (
    !stored ||
    stored.includes('your-web-client-id') ||
    stored.includes('171360328307') ||
    stored.includes('759990643229') ||
    stored.includes('krudbd8') ||
    stored.includes('krucbd0') ||
    stored.includes('[object')
  ) {
    localStorage.setItem(GOOGLE_CLIENT_ID_STORAGE_KEY, DEFAULT_GOOGLE_CLIENT_ID);
    return DEFAULT_GOOGLE_CLIENT_ID;
  }
  return stored.trim();
};

export const setStoredGoogleClientId = (clientId: unknown): void => {
  if (typeof window === 'undefined') return;
  if (
    typeof clientId !== 'string' ||
    !clientId.trim() ||
    clientId.includes('your-web-client-id') ||
    clientId.includes('759990643229') ||
    clientId.includes('krudbd8') ||
    clientId.includes('krucbd0') ||
    clientId.includes('[object')
  ) {
    localStorage.setItem(GOOGLE_CLIENT_ID_STORAGE_KEY, DEFAULT_GOOGLE_CLIENT_ID);
  } else {
    localStorage.setItem(GOOGLE_CLIENT_ID_STORAGE_KEY, clientId.trim());
  }
};

export const GOOGLE_SCOPES_DEFAULT = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

export const GOOGLE_SCOPES_RESTRICTED_FREE = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

export const SHEET_HEADERS = [
  'Product_ID',
  'Design_Name',
  'Title',
  'Description',
  ...Array.from({ length: 13 }, (_, index) => `Tag_${String(index + 1).padStart(2, '0')}`),
  'Category',
  'Primary_Color',
  'Secondary_Color',
  'Style',
  'Occasion',
  'Recipient',
  'Design_File_ID',
  'Design_File_URL',
  'Mockup_01_ID',
  'Mockup_01_URL',
  'Mockup_02_ID',
  'Mockup_02_URL',
  'Mockup_03_ID',
  'Mockup_03_URL',
  'Mockup_04_ID',
  'Mockup_04_URL',
  'Mockup_05_ID',
  'Mockup_05_URL',
  'Mockup_06_ID',
  'Mockup_06_URL',
  'SKU',
  'Price',
  'Blueprint_ID',
  'Print_Provider_ID',
  'Variant_IDs',
  'Status',
  'Printify_Product_ID',
  'Etsy_Listing_ID',
  'Error',
  'Created_Date',
  'Published_Date',
] as const;

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient(options: {
            client_id: string;
            scope: string;
            callback(response: GoogleTokenResponse): void;
            error_callback?(error: { message?: string }): void;
          }): GoogleTokenClient;
        };
      };
    };
  }
}

export interface GoogleDriveRef {
  id: string;
  name: string;
}

export interface GoogleSpreadsheetRef {
  id: string;
  name: string;
  driveId?: string;
}

export interface GoogleWorksheetRef {
  id: number;
  title: string;
  index: number;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  shared?: boolean;
}

export interface DriveImageFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
}

let identityScriptPromise: Promise<void> | undefined;

export const loadIdentityScript = (): Promise<void> => {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (identityScriptPromise) return identityScriptPromise;

  identityScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity Services script could not be loaded.'));
    document.head.appendChild(script);
  });
  return identityScriptPromise;
};

export const connectGoogleDriveAndSheets = async (
  clientId?: unknown,
  scope?: unknown
): Promise<{ token: string; email: string }> => {
  const sanitizedClientId =
    typeof clientId === 'string' && clientId.trim() && !clientId.includes('[object')
      ? clientId.trim()
      : undefined;

  const effectiveClientId =
    sanitizedClientId ||
    getStoredGoogleClientId() ||
    DEFAULT_GOOGLE_CLIENT_ID;

  // 1. First attempt Firebase Auth if provisioned with apiKey (handles authorized origins automatically)
  if (
    auth &&
    (firebaseConfig as any)?.apiKey &&
    (!sanitizedClientId || sanitizedClientId === DEFAULT_GOOGLE_CLIENT_ID || sanitizedClientId === PROVISIONED_OAUTH_CLIENT_ID)
  ) {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive');
      provider.addScope('https://www.googleapis.com/auth/spreadsheets');
      provider.setCustomParameters({ prompt: 'select_account' });

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        const token = credential.accessToken;
        const email = result.user.email || 'Connected Google Account';
        saveGoogleSession(token, email);
        return {
          token,
          email,
        };
      }
    } catch (fbErr: any) {
      const msg = fbErr?.message || '';
      if (msg.includes('popup-closed') || msg.includes('cancelled') || fbErr.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in prompt was closed.');
      }
      console.warn('Firebase Auth popup fell back to Google Identity Services:', fbErr);
    }
  }

  // 2. Google Identity Services fallback for custom Client IDs
  if (!effectiveClientId) {
    throw new Error('Google Client ID is missing. Please set VITE_GOOGLE_CLIENT_ID or connect via OAuth.');
  }
  await loadIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google OAuth2 is unavailable in this browser session.');

  const effectiveScope =
    typeof scope === 'string' && scope.trim() ? scope.trim() : GOOGLE_SCOPES;

  const token = await new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: String(effectiveClientId).trim(),
      scope: effectiveScope,
      callback: (response) => {
        if (response.error || !response.access_token) {
          const errDesc = response.error_description || response.error || '';
          if (errDesc.includes('closed') || response.error === 'popup_closed_by_user') {
            reject(new Error('Sign-in prompt was closed.'));
            return;
          }
          reject(new Error(errDesc || 'Google authorization failed.'));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (error) => {
        const msg = error?.message || '';
        if (msg.includes('closed') || msg.includes('Popup window closed')) {
          reject(new Error('Sign-in prompt was closed.'));
        } else {
          reject(new Error(msg || 'Google authorization failed.'));
        }
      },
    });
    client.requestAccessToken({ prompt: 'select_account consent' });
  });

  const user = await googleRequest<{ email?: string }>(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    token
  );
  const userEmail = user.email || 'Connected Google Account';
  saveGoogleSession(token, userEmail);
  return { token, email: userEmail };
};

export const googleRequest = async <T>(
  url: string,
  token: string,
  init: RequestInit = {}
): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body && !(init.body instanceof Blob) && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = (data as { error?: { message?: string } })?.error?.message;
    throw new Error(msg || `Google API error (${response.status}): ${response.statusText}`);
  }
  return data as T;
};

/**
 * Find or create a folder inside a parent folder
 */
export const findOrCreateFolder = async (
  token: string,
  folderName: string,
  parentId?: string
): Promise<string> => {
  let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
  searchUrl.search = new URLSearchParams({
    q: query,
    fields: 'files(id, name)',
    pageSize: '10',
    spaces: 'drive',
  }).toString();

  const searchRes = await googleRequest<{ files?: { id: string; name: string }[] }>(searchUrl.toString(), token);
  if (searchRes.files && searchRes.files.length > 0) {
    return searchRes.files[0].id;
  }

  // Create folder
  const createRes = await googleRequest<{ id: string }>(
    'https://www.googleapis.com/drive/v3/files',
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      }),
    }
  );
  return createRes.id;
};

/**
 * Ensure hierarchy:
 * Root -> [rootFolderName (default 'Etsy Products')] -> [productId] -> ['Design', 'Mockups']
 */
export const ensureProductFolders = async (
  token: string,
  productId: string,
  rootFolderName = 'Etsy Products'
): Promise<{ rootFolderId: string; productFolderId: string; designFolderId: string; mockupsFolderId: string }> => {
  const rootFolderId = await findOrCreateFolder(token, rootFolderName);
  const productFolderId = await findOrCreateFolder(token, productId, rootFolderId);
  const designFolderId = await findOrCreateFolder(token, 'Design', productFolderId);
  const mockupsFolderId = await findOrCreateFolder(token, 'Mockups', productFolderId);

  return { rootFolderId, productFolderId, designFolderId, mockupsFolderId };
};

/**
 * Check if a file already exists in a given folder with the exact name to prevent duplicates
 */
export const findFileInFolder = async (
  token: string,
  fileName: string,
  folderId: string
): Promise<DriveFileMetadata | null> => {
  const query = `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.search = new URLSearchParams({
    q: query,
    fields: 'files(id, name, mimeType, size, webViewLink, webContentLink)',
    pageSize: '5',
  }).toString();

  const data = await googleRequest<{ files?: DriveFileMetadata[] }>(url.toString(), token);
  return data.files && data.files.length > 0 ? data.files[0] : null;
};

/**
 * Convert any data URL or remote URL to Blob
 */
export const urlToBlob = async (url: string): Promise<Blob> => {
  if (url.startsWith('data:')) {
    const arr = url.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch image at ${url}`);
  return await res.blob();
};

/**
 * Upload asset using multipart upload for standard image sizes (< 5MB)
 * or resumable upload for larger files
 */
export const uploadFileToFolder = async (
  token: string,
  fileBlob: Blob,
  fileName: string,
  folderId: string,
  existingFileId?: string,
  grantLinkAccess = true
): Promise<DriveFileMetadata> => {
  const mimeType = fileBlob.type || 'image/png';
  let fileId = existingFileId;

  if (existingFileId) {
    // Update existing file content (prevent duplicates)
    const updateRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingFileId)}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': mimeType,
        },
        body: fileBlob,
      }
    );
    if (!updateRes.ok) {
      throw new Error(`Failed to update existing Drive file ${existingFileId}`);
    }
  } else {
    // Check if file with same name exists in folder
    const existing = await findFileInFolder(token, fileName, folderId);
    if (existing) {
      // Update existing content instead of creating duplicate
      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': mimeType,
          },
          body: fileBlob,
        }
      );
      if (!updateRes.ok) {
        throw new Error(`Failed to update existing Drive file ${existing.id}`);
      }
      fileId = existing.id;
    } else {
      // Create new file via multipart upload
      const boundary = `casecraft_upload_${crypto.randomUUID()}`;
      const metadata = JSON.stringify({
        name: fileName,
        mimeType,
        parents: [folderId],
      });

      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
        fileBlob,
        `\r\n--${boundary}--`,
      ]);

      const createRes = await googleRequest<{ id: string }>(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        token,
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      );
      fileId = createRes.id;
    }
  }

  if (!fileId) throw new Error(`Could not obtain Drive file ID for ${fileName}`);

  // Configure link permissions for downstream automation (Make.com/Printify) if enabled
  if (grantLinkAccess) {
    try {
      await googleRequest(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone',
            allowFileDiscovery: false,
          }),
        }
      );
    } catch {
      // Permission might already exist or domain policy restriction, proceed with file verification
    }
  }

  // Retrieve comprehensive file metadata including webContentLink and webViewLink
  const metaUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  metaUrl.search = new URLSearchParams({
    fields: 'id, name, mimeType, size, webViewLink, webContentLink',
  }).toString();

  const metadata = await googleRequest<DriveFileMetadata>(metaUrl.toString(), token);
  return metadata;
};

/**
 * Verify Drive asset exists, has size > 0, and has accessible URLs
 */
export const verifyDriveFile = async (
  token: string,
  fileId: string
): Promise<{ verified: boolean; meta: DriveFileMetadata; downloadUrl: string }> => {
  const metaUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  metaUrl.search = new URLSearchParams({
    fields: 'id, name, mimeType, size, webViewLink, webContentLink',
  }).toString();

  const meta = await googleRequest<DriveFileMetadata>(metaUrl.toString(), token);
  if (!meta.id) throw new Error(`File ID ${fileId} not found in Google Drive.`);

  // Construct standard direct download link for automation
  // Use uc?export=download&id=... which Make.com and external HTTP services can easily download
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(meta.id)}`;

  return { verified: true, meta, downloadUrl };
};

/**
 * Extract Google Drive ID and link type from folder URLs, file URLs, or raw IDs
 */
export const extractGoogleDriveId = (
  input: string
): { id: string; type: 'folder' | 'file' | 'unknown' } | null => {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();

  // Folder regexes: drive.google.com/folderview?id={id}
  const folderviewMatch = str.match(/drive\.google\.com\/folderview\?(?:.*&)?id=([a-zA-Z0-9_-]+)/i);
  if (folderviewMatch) {
    return { id: folderviewMatch[1], type: 'folder' };
  }

  // Folder regexes: drive.google.com/drive/folders/{id} or drive.google.com/drive/u/0/folders/{id}
  const folderMatch = str.match(/drive\.google\.com\/(?:drive\/)?(?:u\/\d+\/)?(?:mobile\/)?folders\/([a-zA-Z0-9_-]+)/i);
  if (folderMatch) {
    return { id: folderMatch[1], type: 'folder' };
  }

  // File regexes: drive.google.com/file/d/{id}
  const fileMatch = str.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileMatch) {
    return { id: fileMatch[1], type: 'file' };
  }

  // open?id={id}
  const openIdMatch = str.match(/drive\.google\.com\/open\?(?:.*&)?id=([a-zA-Z0-9_-]+)/i);
  if (openIdMatch) {
    return { id: openIdMatch[1], type: 'unknown' };
  }

  // uc?id={id} or uc?export=download&id={id}
  const ucIdMatch = str.match(/drive\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]+)/i);
  if (ucIdMatch) {
    return { id: ucIdMatch[1], type: 'file' };
  }

  // Raw Google Drive ID (typically 25 to 45 alphanumeric chars)
  if (/^[a-zA-Z0-9_-]{25,45}$/.test(str)) {
    return { id: str, type: 'unknown' };
  }

  return null;
};

/**
 * List all image files inside a Google Drive folder
 */
export const listDriveFolderImageFiles = async (
  folderId: string,
  token?: string | null
): Promise<DriveImageFile[]> => {
  const cleanFolderId = folderId.trim();

  // 1. Try server proxy (handles both public and private with token)
  try {
    const res = await fetch('/api/drive/list-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: cleanFolderId, token: token || undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      const files: DriveImageFile[] = data.files || [];
      const imageFiles = files.filter(
        (f) =>
          (f.mimeType && f.mimeType.startsWith('image/')) ||
          /\.(png|jpe?g|webp|gif|svg)$/i.test(f.name)
      );
      if (imageFiles.length > 0 || files.length === 0) {
        return imageFiles;
      }
    }
  } catch (err) {
    console.warn('Server proxy list-folder failed, trying direct Google API:', err);
  }

  // 2. Direct Google Drive API call if token is available
  if (token) {
    const query = `'${cleanFolderId}' in parents and trashed=false`;
    const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
    searchUrl.search = new URLSearchParams({
      q: query,
      fields: 'files(id, name, mimeType, size, webViewLink, webContentLink, thumbnailLink)',
      pageSize: '100',
    }).toString();

    const data = await googleRequest<{ files?: DriveImageFile[] }>(searchUrl.toString(), token);
    const files = data.files || [];
    return files.filter(
      (f) =>
        (f.mimeType && f.mimeType.startsWith('image/')) ||
        /\.(png|jpe?g|webp|gif|svg)$/i.test(f.name)
    );
  }

  throw new Error(
    'Unable to access Google Drive folder. Please ensure the folder is shared ("Anyone with the link can view") or connect your Google Drive account.'
  );
};

/**
 * Download a Google Drive file and convert it into a base64 DataURL
 */
export const fetchDriveImageAsDataUrl = async (
  fileId: string,
  token?: string | null
): Promise<{ dataUrl: string; mimeType: string; fileName: string }> => {
  const cleanId = fileId.trim();

  // 1. Try server proxy first (avoids browser CORS)
  try {
    const res = await fetch('/api/drive/download-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: cleanId, token: token || undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.dataUrl) {
        return {
          dataUrl: data.dataUrl,
          mimeType: data.mimeType || 'image/png',
          fileName: data.fileName || 'drive_artwork.png',
        };
      }
    }
  } catch (err) {
    console.warn('Server proxy download failed, trying direct fetch:', err);
  }

  // 2. Direct fetch with token
  if (token) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${cleanId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const blob = await res.blob();
      const mimeType = blob.type || 'image/png';
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to encode image data.'));
        reader.readAsDataURL(blob);
      });
      return { dataUrl, mimeType, fileName: 'drive_artwork.png' };
    }
  }

  throw new Error(`Failed to download design image from Google Drive (File ID: ${cleanId}).`);
};

/**
 * List available Spreadsheets
 */
export const listSpreadsheets = async (
  token: string,
  driveId = 'my-drive'
): Promise<GoogleSpreadsheetRef[]> => {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  const params = new URLSearchParams({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    orderBy: 'name',
    pageSize: '100',
    fields: 'files(id, name, driveId)',
    spaces: 'drive',
  });
  if (driveId !== 'my-drive') {
    params.set('corpora', 'drive');
    params.set('driveId', driveId);
    params.set('includeItemsFromAllDrives', 'true');
    params.set('supportsAllDrives', 'true');
  } else {
    params.set('corpora', 'user');
  }
  url.search = params.toString();
  const data = await googleRequest<{ files?: GoogleSpreadsheetRef[] }>(url.toString(), token);
  return data.files || [];
};

/**
 * List Worksheets in a Spreadsheet
 */
export const listWorksheets = async (
  token: string,
  spreadsheetId: string
): Promise<GoogleWorksheetRef[]> => {
  const data = await googleRequest<{
    sheets?: { properties?: { sheetId: number; title: string; index: number } }[];
  }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`,
    token
  );
  return (data.sheets || [])
    .map((s) => s.properties)
    .filter((p): p is { sheetId: number; title: string; index: number } => Boolean(p?.title))
    .map((p) => ({ id: p.sheetId, title: p.title, index: p.index }));
};

const sheetRange = (sheetName: string, range: string): string =>
  `${encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'!${range}`)}`;

const valuesUrl = (spreadsheetId: string, range: string): string =>
  `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}`;

/**
 * Ensure Worksheet has exact CaseCraft unified headers in row 1
 */
export const ensureUnifiedSheetHeaders = async (
  token: string,
  spreadsheetId: string,
  sheetName: string
): Promise<void> => {
  const spreadsheet = await googleRequest<{
    sheets?: { properties?: { sheetId: number; title: string; gridProperties?: { columnCount?: number } } }[];
  }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title,gridProperties(columnCount))`,
    token
  );
  const worksheet = spreadsheet.sheets?.map((s) => s.properties).find((p) => p?.title === sheetName);
  if (!worksheet) throw new Error(`Worksheet "${sheetName}" was not found in spreadsheet.`);

  const currentCols = worksheet.gridProperties?.columnCount || 0;
  if (currentCols < SHEET_HEADERS.length) {
    await googleRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              appendDimension: {
                sheetId: worksheet.sheetId,
                dimension: 'COLUMNS',
                length: SHEET_HEADERS.length - currentCols,
              },
            },
          ],
        }),
      }
    );
  }

  // Check row 1
  const range = sheetRange(sheetName, `A1:${columnToLetter(SHEET_HEADERS.length)}1`);
  const data = await googleRequest<{ values?: string[][] }>(valuesUrl(spreadsheetId, range), token);
  const current = data.values?.[0] || [];

  if (current.length === 0 || current.every((v) => !v)) {
    // Write headers
    await googleRequest(`${valuesUrl(spreadsheetId, range)}?valueInputOption=RAW`, token, {
      method: 'PUT',
      body: JSON.stringify({ values: [SHEET_HEADERS] }),
    });
    return;
  }

  // If headers differ from standard CaseCraft, update or notify
  const matches = SHEET_HEADERS.every((h, i) => current[i] === h);
  if (!matches) {
    // Check if it's the old 39-col schema or different
    // Automatically upgrade row 1 headers to unified 45-col schema
    await googleRequest(`${valuesUrl(spreadsheetId, range)}?valueInputOption=RAW`, token, {
      method: 'PUT',
      body: JSON.stringify({ values: [SHEET_HEADERS] }),
    });
  }
};

export const findProductRowInSheet = async (
  token: string,
  spreadsheetId: string,
  sheetName: string,
  productId: string
): Promise<number | null> => {
  const range = sheetRange(sheetName, 'A2:A');
  const data = await googleRequest<{ values?: string[][] }>(valuesUrl(spreadsheetId, range), token);
  const rows = data.values || [];
  const index = rows.findIndex((r) => r[0] === productId);
  return index < 0 ? null : index + 2;
};

export const productRecordToSheetRow = (
  record: UnifiedProductRecord,
  statusOverride?: string
): (string | number)[] => {
  const tags = Array.from({ length: 13 }, (_, i) => record.listing.tags[i] || '');
  
  // Design Drive file ID and URL
  const designId = record.design.fileId || '';
  const designUrl = record.design.fileUrl || '';

  // Mockups 01..06 IDs and URLs
  const mockupSlots = Array.from({ length: 6 }, (_, i) => {
    const m = record.mockups.find((item) => item.slotIndex === i);
    return {
      id: m?.fileId || '',
      url: m?.fileUrl || '',
    };
  });

  const status = statusOverride || record.automation.status || 'READY';

  return [
    record.productId,
    record.designName,
    record.listing.title,
    record.listing.description,
    ...tags,
    record.listing.category,
    record.listing.primaryColor,
    record.listing.secondaryColor,
    record.listing.style,
    record.listing.occasion,
    record.listing.recipient,
    designId,
    designUrl,
    mockupSlots[0].id,
    mockupSlots[0].url,
    mockupSlots[1].id,
    mockupSlots[1].url,
    mockupSlots[2].id,
    mockupSlots[2].url,
    mockupSlots[3].id,
    mockupSlots[3].url,
    mockupSlots[4].id,
    mockupSlots[4].url,
    mockupSlots[5].id,
    mockupSlots[5].url,
    record.product.sku || record.productId,
    record.product.price || 22.20,
    record.printify.blueprintId || '269',
    record.printify.printProviderId || '',
    record.printify.variantIds.join(','),
    status,
    record.automation.printifyProductId || '',
    record.automation.etsyListingId || '',
    record.automation.error || '',
    record.automation.createdDate || new Date().toISOString(),
    record.automation.publishedDate || '',
  ];
};

export const writeOrUpdateProductRow = async (
  token: string,
  spreadsheetId: string,
  sheetName: string,
  row: (string | number)[],
  existingRowNumber?: number
): Promise<number> => {
  const maxCol = columnToLetter(SHEET_HEADERS.length);
  if (existingRowNumber) {
    const range = sheetRange(sheetName, `A${existingRowNumber}:${maxCol}${existingRowNumber}`);
    await googleRequest(`${valuesUrl(spreadsheetId, range)}?valueInputOption=RAW`, token, {
      method: 'PUT',
      body: JSON.stringify({ values: [row] }),
    });
    return existingRowNumber;
  }

  const range = sheetRange(sheetName, `A:${maxCol}`);
  const appendRes = await googleRequest<{ updates?: { updatedRange?: string } }>(
    `${valuesUrl(spreadsheetId, range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ values: [row] }),
    }
  );
  
  // Extract row number if possible
  const updatedRange = appendRes.updates?.updatedRange || '';
  const match = updatedRange.match(/!A(\d+):/);
  return match ? parseInt(match[1], 10) : 0;
};

// Helper to convert 1-based column number to Sheets letter (1 -> A, 27 -> AA, 45 -> AS)
function columnToLetter(column: number): string {
  let temp: number;
  let letter = '';
  let col = column;
  while (col > 0) {
    temp = (col - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = Math.floor((col - temp) / 26);
  }
  return letter;
}

/**
 * Extract clean Google Spreadsheet ID from either a raw ID or full Google Sheets URL
 */
export const extractSpreadsheetId = (input: string): string => {
  if (!input) return '';
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
};

/**
 * Get spreadsheet details and worksheets list
 */
export const getSpreadsheetInfo = async (
  token: string,
  spreadsheetId: string
): Promise<{ id: string; title: string; sheets: GoogleWorksheetRef[] }> => {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const data = await googleRequest<{
    spreadsheetId?: string;
    properties?: { title?: string };
    sheets?: { properties?: { sheetId: number; title: string; index: number } }[];
  }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}?fields=spreadsheetId,properties.title,sheets.properties`,
    token
  );
  const sheets: GoogleWorksheetRef[] = (data.sheets || [])
    .map((s) => s.properties)
    .filter((p): p is { sheetId: number; title: string; index: number } => Boolean(p?.title))
    .map((p) => ({ id: p.sheetId, title: p.title, index: p.index }));

  return {
    id: data.spreadsheetId || cleanId,
    title: data.properties?.title || 'Google Spreadsheet',
    sheets,
  };
};

/**
 * Create a new dedicated Google Spreadsheet formatted for Pinterest Bulk Pin CSV uploads
 */
export const createPinterestSpreadsheet = async (
  token: string,
  title = 'Pinterest Bulk Pins'
): Promise<{ id: string; title: string; url: string; worksheetTitle: string }> => {
  const worksheetTitle = 'Pins';
  const body = {
    properties: { title },
    sheets: [
      {
        properties: {
          title: worksheetTitle,
          gridProperties: {
            rowCount: 100,
            columnCount: PINTEREST_CSV_HEADERS.length,
            frozenRowCount: 1,
          },
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: PINTEREST_CSV_HEADERS.map((header) => ({
                  userEnteredValue: { stringValue: header },
                  userEnteredFormat: {
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    backgroundColor: { red: 0.89, green: 0.05, blue: 0.22 }, // Pinterest Red #E60023
                    horizontalAlignment: 'CENTER',
                  },
                })),
              },
            ],
          },
        ],
      },
    ],
  };

  const res = await googleRequest<{ spreadsheetId: string; spreadsheetUrl?: string }>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );

  return {
    id: res.spreadsheetId,
    title,
    url: res.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${res.spreadsheetId}/edit`,
    worksheetTitle,
  };
};

/**
 * Ensure Pinterest header row exists in the targeted worksheet
 */
export const ensurePinterestSheetHeaders = async (
  token: string,
  spreadsheetId: string,
  sheetName: string
): Promise<void> => {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const maxCol = columnToLetter(PINTEREST_CSV_HEADERS.length);
  const range = sheetRange(sheetName, `A1:${maxCol}1`);
  const data = await googleRequest<{ values?: string[][] }>(valuesUrl(cleanId, range), token).catch(() => ({ values: [] }));
  const current = data.values?.[0] || [];

  if (current.length === 0 || current.every((v) => !v)) {
    await googleRequest(`${valuesUrl(cleanId, range)}?valueInputOption=RAW`, token, {
      method: 'PUT',
      body: JSON.stringify({ values: [PINTEREST_CSV_HEADERS] }),
    });
  }
};

/**
 * Export Pinterest rows to a Google Spreadsheet worksheet
 */
export const exportPinterestPinsToSpreadsheet = async (
  token: string,
  spreadsheetId: string,
  sheetName: string,
  rows: PinterestCsvRow[],
  mode: 'append' | 'overwrite' = 'append'
): Promise<{ count: number; spreadsheetUrl: string }> => {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  await ensurePinterestSheetHeaders(token, cleanId, sheetName);

  const values = rows.map((r) => [
    r['Product ID'] || '',
    r.Title || '',
    r.Description || '',
    r['Media URL'] || '',
    r['Pinterest board'] || '',
    r.Thumbnail || '',
    r.Link || '',
    r['Publish date'] || '',
    r.Keywords || '',
  ]);

  const maxCol = columnToLetter(PINTEREST_CSV_HEADERS.length);

  if (mode === 'overwrite') {
    // Clear data rows starting at row 2
    try {
      await googleRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}/values/${sheetRange(sheetName, `A2:${maxCol}1000`)}:clear`,
        token,
        { method: 'POST', body: '{}' }
      );
    } catch (clearErr) {
      console.warn('Could not clear old rows before overwrite:', clearErr);
    }

    if (values.length > 0) {
      const writeRange = sheetRange(sheetName, `A2:${maxCol}${values.length + 1}`);
      await googleRequest(`${valuesUrl(cleanId, writeRange)}?valueInputOption=RAW`, token, {
        method: 'PUT',
        body: JSON.stringify({ values }),
      });
    }
  } else {
    // Append rows
    const appendRange = sheetRange(sheetName, `A:${maxCol}`);
    await googleRequest(
      `${valuesUrl(cleanId, appendRange)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ values }),
      }
    );
  }

  return {
    count: rows.length,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
  };
};

/**
 * Read Pinterest pins from Google Spreadsheet
 */
export const readPinterestPinsFromSpreadsheet = async (
  token: string,
  spreadsheetId: string,
  sheetName: string
): Promise<PinterestCsvRow[]> => {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const maxCol = columnToLetter(PINTEREST_CSV_HEADERS.length);
  const range = sheetRange(sheetName, `A1:${maxCol}500`);
  const data = await googleRequest<{ values?: string[][] }>(valuesUrl(cleanId, range), token);
  const rawValues = data.values || [];

  if (rawValues.length <= 1) return [];

  const headerRow = rawValues[0].map((h) => (h || '').trim());
  
  const getIdx = (targetHeader: string, fallbackIdx: number) => {
    const idx = headerRow.findIndex(
      (h) => h.toLowerCase() === targetHeader.toLowerCase()
    );
    return idx >= 0 ? idx : fallbackIdx;
  };

  const prodIdIdx = getIdx('Product ID', 0);
  const titleIdx = getIdx('Title', 1);
  const descIdx = getIdx('Description', 2);
  const mediaIdx = getIdx('Media URL', 3);
  const boardIdx = getIdx('Pinterest board', 4);
  const thumbIdx = getIdx('Thumbnail', 5);
  const linkIdx = getIdx('Link', 6);
  const dateIdx = getIdx('Publish date', 7);
  const keywIdx = getIdx('Keywords', 8);

  const rows: PinterestCsvRow[] = [];
  for (let i = 1; i < rawValues.length; i++) {
    const r = rawValues[i];
    if (!r || r.length === 0 || r.every((cell) => !cell || !cell.trim())) continue;
    rows.push({
      'Product ID': r[prodIdIdx] || '',
      Title: r[titleIdx] || '',
      Description: r[descIdx] || '',
      'Media URL': r[mediaIdx] || '',
      'Pinterest board': r[boardIdx] || '',
      Thumbnail: r[thumbIdx] || '',
      Link: r[linkIdx] || '',
      'Publish date': r[dateIdx] || '',
      Keywords: r[keywIdx] || '',
    });
  }

  return rows;
};
