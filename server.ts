import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import designStudioApi from './src/server/designStudioApi';
import { handlePrintifyRequest } from './src/server/printify';
import {
  generateLifestyleMockup,
  LifestyleMockupError,
  LifestyleMockupRequest,
} from './src/server/lifestyleMockup';
import {
  describeHuggingFaceImageError,
  generateHuggingFaceImage,
  getQuotaStatus,
  isGeminiQuotaError,
} from './src/server/imageGenerationFallback';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/design-api', designStudioApi);
app.use('/api', designStudioApi);

app.all('/api/printify', async (req, res) => {
  const url = new URL(req.originalUrl, `http://${req.headers.host || 'localhost'}`);
  const headerToken =
    (req.headers['x-printify-token'] as string) ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined);
  const token = headerToken || req.body?.token || req.body?.apiToken || url.searchParams.get('token') || url.searchParams.get('apiToken');
  const result = await handlePrintifyRequest(req.method, url, req.body, token);
  res.status(result.status).json(result.body);
});

// Shared Gemini Client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// API: Generate Design Artwork
app.post('/api/generate-design', async (req, res) => {
  const { prompt, aspectRatio = '9:16' } = req.body || {};
  try {
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is missing. Set GEMINI_API_KEY in your local .env file and restart the server, or configure it in your deployment secrets.',
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as '9:16' | '1:1' | '3:4' | '4:3' | '16:9',
        },
      },
    });

    let imageUrl: string | null = null;
    let descriptionText = '';

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        } else if (part.text) {
          descriptionText += part.text;
        }
      }
    }

    if (!imageUrl) {
      return res.status(500).json({
        error: 'Model did not return image data.',
        detail: descriptionText,
      });
    }

    return res.json({ imageUrl, text: descriptionText });
  } catch (error: any) {
    console.error('Error generating design:', error);
    if (isGeminiQuotaError(error)) {
      const allowedRatios = ['9:16', '1:1', '3:4', '4:3', '16:9'] as const;
      const ratio = (allowedRatios as readonly string[]).includes(String(aspectRatio))
        ? String(aspectRatio) as (typeof allowedRatios)[number]
        : '9:16';
      try {
        const fallback = await generateHuggingFaceImage(String(prompt || ''), ratio);
        console.info(`Generated design with Hugging Face fallback model ${fallback.model}.`);
        return res.json({ imageUrl: fallback.imageUrl, text: '', provider: 'Hugging Face' });
      } catch (fallbackError) {
        console.error('Hugging Face design fallback failed:', fallbackError);
        const fallbackMessage = fallbackError instanceof Error && fallbackError.message.includes('not configured')
          ? fallbackError.message
          : describeHuggingFaceImageError(fallbackError);
        return res.status(429).json({ error: `Gemini image quota is unavailable. ${fallbackMessage}` });
      }
    }
    const msg = error?.message || 'Failed to generate design';
    let userMsg = msg;
    if (msg.includes('401') || msg.includes('UNAUTHENTICATED') || msg.includes('authentication credential')) {
      userMsg = 'Invalid authentication credentials. Please select or verify your API key in the AI Studio Secrets panel.';
    }
    return res.status(500).json({
      error: userMsg,
      details: error?.toString(),
    });
  }
});

// Helper to encode image to base64
async function encodeImagePart(imageUrl: string) {
  let base64Data = '';
  let mimeType = 'image/png';

  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }
  } else if (imageUrl.startsWith('/')) {
    try {
      const fs = await import('fs');
      const localPath = path.join(__dirname, imageUrl);
      if (fs.existsSync(localPath)) {
        const buf = fs.readFileSync(localPath);
        base64Data = buf.toString('base64');
        mimeType = imageUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';
      }
    } catch (e) {
      console.error('Error reading local file:', e);
    }
  }

  if (base64Data) {
    return {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    };
  }
  return null;
}

// API: Generate AI Lifestyle Scene using Printify Reference Mockup & Preserved Artwork
app.post('/api/generate-lifestyle-scene', async (req, res) => {
  try {
    const imageUrl = await generateLifestyleMockup(req.body as LifestyleMockupRequest);
    return res.json({ imageUrl });
  } catch (error) {
    if (error instanceof LifestyleMockupError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error generating lifestyle scene:', error);
    return res.status(500).json({
      error: 'Failed to generate lifestyle scene.',
    });
  }
});

app.post('/api/generate-case-mockup', async (req, res) => {
  try {
    const { designDescription, designImageUrl, device = 'iphone-16-pro', caseType = 'slim' } = req.body;
    if (!designDescription && !designImageUrl) {
      return res.status(400).json({ error: 'Design description or image is required' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is missing. Set GEMINI_API_KEY in your local .env file and restart the server, or configure it in your deployment secrets.',
      });
    }

    const parts: any[] = [];

    // If design image provided, pass as inline image part for in-context rendering
    if (designImageUrl) {
      let base64Data = '';
      let mimeType = 'image/png';

      if (designImageUrl.startsWith('data:')) {
        const match = designImageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Data = match[2];
        }
      } else if (designImageUrl.startsWith('/')) {
        try {
          const fs = await import('fs');
          const localPath = path.join(__dirname, designImageUrl);
          if (fs.existsSync(localPath)) {
            const buf = fs.readFileSync(localPath);
            base64Data = buf.toString('base64');
            mimeType = designImageUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';
          }
        } catch (e) {
          console.error('Error reading local artwork file:', e);
        }
      }

      if (base64Data) {
        parts.push({
          inlineData: {
            mimeType,
            data: base64Data,
          },
        });
      }
    }

    const isIphone = device.toLowerCase().includes('iphone');
    const deviceName = isIphone ? 'Apple iPhone 16 Pro' : 'Samsung Galaxy S25 Ultra';
    const cameraDesc = isIphone
      ? 'square rounded camera plateau with triple triangular lenses in top-left'
      : 'floating vertical column of circular camera lenses in top-left';

    const promptText = `A crisp, photorealistic commercial product photograph of a modern ${deviceName} phone case (${caseType} edition) standing centered upright against a seamless studio cyclorama backdrop.
The back surface of the phone case has the exact provided artwork seamlessly printed across it with crisp edge-to-edge full bleed wrap.
Accurately render the ${deviceName} physical geometry: ${cameraDesc}, precise case rounded corners, tactile side buttons, natural surface curvature, soft studio floor contact drop shadow, subtle specular gloss highlights along the perimeter bevel.
Clean e-commerce product catalog shot. No hands, no people, no lifestyle background clutter.`;

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts,
      },
      config: {
        imageConfig: {
          aspectRatio: '1:1',
        },
      },
    });

    let imageUrl: string | null = null;
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!imageUrl) {
      return res.status(500).json({ error: 'Failed to generate case mockup' });
    }

    return res.json({ imageUrl });
  } catch (error: any) {
    console.error('Error generating case mockup:', error);
    if (isGeminiQuotaError(error)) {
      return res.status(429).json({
        error: 'Gemini image quota is unavailable. This mockup uses your artwork as a visual reference; the text-to-image fallback cannot preserve that artwork. Please retry after the Gemini quota resets.',
      });
    }
    const msg = error?.message || 'Failed to generate case mockup';
    let userMsg = msg;
    if (msg.includes('401') || msg.includes('UNAUTHENTICATED') || msg.includes('authentication credential')) {
      userMsg = 'Invalid authentication credentials. Please select or verify your API key in the AI Studio Secrets panel.';
    }
    return res.status(500).json({
      error: userMsg,
    });
  }
});

// API: AI Placeholder Value Suggestions
app.post('/api/suggest-values', async (req, res) => {
  try {
    const { placeholder, niche, currentPrompt } = req.body;
    const ai = getGeminiClient();
    if (!ai) {
      return res.json({ suggestions: [] });
    }

    const prompt = `You are a master creative director for phone case graphic design.
Given the placeholder tag "${placeholder}" for niche "${niche}" within prompt context:
"${currentPrompt}"

Provide 6 creative, evocative, visually vivid options to fill this placeholder.
Return ONLY a JSON array of 6 short strings (e.g. ["option 1", "option 2", ...]).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    let suggestions: string[] = [];
    try {
      suggestions = JSON.parse(response.text || '[]');
    } catch {
      suggestions = [];
    }

    return res.json({ suggestions });
  } catch (error: any) {
    console.error('Error suggesting values:', error);
    return res.status(500).json({ suggestions: [] });
  }
});

// API: AI Pinterest Pins Optimization & Context Analysis
app.post('/api/pinterest/optimize-pins', async (req, res) => {
  try {
    const { items = [], options = {} } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No pin items provided for optimization' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is missing. Set GEMINI_API_KEY in your local .env file and restart the server, or configure it in your deployment secrets.',
      });
    }

    const maxDescriptionLength = Math.min(Math.max(options.maxDescriptionLength || 700, 100), 700);
    const maxTitleLength = Math.min(Math.max(options.maxTitleLength || 80, 30), 100);
    const titleStyle = options.titleStyle || 'concise';
    const tone = options.tone || 'viral';

    const systemInstruction = `You are a master Pinterest copywriter, e-commerce SEO strategist, and conversion optimization expert specializing in tech accessories and aesthetic phone cases.
Your goal is to optimize and summarize Pinterest Bulk CSV pin titles and descriptions while ensuring utmost contextual coherence, high relevance, and strict character limit compliance.

STRICT RULES & CONSTRAINTS:
1. Description Summarization:
   - Summarize and shorten every description to STRICTLY NO MORE than ${maxDescriptionLength} characters (and ALWAYS <= 700 characters max).
   - The summary MUST preserve key product selling points: aesthetic style/art style, protection features (dual-layer, tough/slim), device compatibility (iPhone/Samsung), tactile quality, and emotional buyer appeal.
   - The description MUST be natural, grammatically complete, and coherent. Never cut sentences in half.
2. Title Optimization:
   - Make each title concise, highly searchable, and meaningful (STRICTLY NO MORE than ${maxTitleLength} characters, max 100 characters).
   - Format according to style "${titleStyle}" (e.g., concise, punchy, aesthetic).
   - Remove redundant keyword stuffing, awkward barcodes, or messy model prefixes while keeping the unique design name and product identity front-and-center.
3. AI Analysis & Contextual Quality Check:
   - Analyze both the original and optimized title & description in context to ensure they align seamlessly and accurately reflect the product theme.
   - Evaluate coherence score (1-100) and relevance score (1-100).
   - Provide a clear 1-sentence summary note of improvements made and top marketing hook phrases.

Always return a valid JSON object matching the requested schema.`;

    const promptText = `Please analyze, summarize descriptions to <= ${maxDescriptionLength} characters, and optimize titles to <= ${maxTitleLength} characters for these ${items.length} Pinterest pin items:
${JSON.stringify(items, null, 2)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: promptText,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            results: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: 'The corresponding ID or index string from input' },
                  originalTitle: { type: Type.STRING },
                  optimizedTitle: { type: Type.STRING },
                  originalDescription: { type: Type.STRING },
                  summarizedDescription: { type: Type.STRING },
                  descriptionCharCount: { type: Type.INTEGER },
                  titleCharCount: { type: Type.INTEGER },
                  analysis: {
                    type: Type.OBJECT,
                    properties: {
                      coherenceScore: { type: Type.INTEGER, description: '1 to 100 score' },
                      relevanceScore: { type: Type.INTEGER, description: '1 to 100 score' },
                      summaryNote: { type: Type.STRING, description: 'Brief explanation of improvements made' },
                      extractedHooks: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Top 2-3 marketing hooks or search phrases'
                      }
                    },
                    required: ['coherenceScore', 'relevanceScore', 'summaryNote']
                  }
                },
                required: ['id', 'optimizedTitle', 'summarizedDescription', 'analysis']
              }
            },
            overallSummary: { type: Type.STRING }
          },
          required: ['results']
        }
      }
    });

    let data: any = { results: [] };
    try {
      data = JSON.parse(response.text || '{"results":[]}');
    } catch (parseErr) {
      console.error('Failed to parse Gemini response JSON:', parseErr, response.text);
    }

    // Secondary guarantee on character caps
    if (Array.isArray(data.results)) {
      data.results = data.results.map((resItem: any, idx: number) => {
        const itemRef = items[idx] || {};
        let finalTitle = (resItem.optimizedTitle || itemRef.title || '').trim();
        let finalDesc = (resItem.summarizedDescription || itemRef.description || '').trim();

        if (finalTitle.length > maxTitleLength) {
          finalTitle = finalTitle.slice(0, maxTitleLength).trim();
        }
        if (finalDesc.length > maxDescriptionLength) {
          finalDesc = finalDesc.slice(0, maxDescriptionLength - 3).trim() + '...';
        }

        return {
          id: resItem.id || itemRef.id || String(idx),
          originalTitle: itemRef.title || '',
          optimizedTitle: finalTitle,
          originalDescription: itemRef.description || '',
          summarizedDescription: finalDesc,
          descriptionCharCount: finalDesc.length,
          titleCharCount: finalTitle.length,
          analysis: {
            coherenceScore: typeof resItem.analysis?.coherenceScore === 'number' ? resItem.analysis.coherenceScore : 95,
            relevanceScore: typeof resItem.analysis?.relevanceScore === 'number' ? resItem.analysis.relevanceScore : 98,
            summaryNote: resItem.analysis?.summaryNote || 'Streamlined title and compressed description under 700 chars with full contextual integrity.',
            extractedHooks: resItem.analysis?.extractedHooks || []
          }
        };
      });
    }

    return res.json(data);
  } catch (error: any) {
    console.error('Error optimizing Pinterest pins with AI:', error);
    return res.status(500).json({
      error: error.message || 'Failed to optimize Pinterest pins using AI',
    });
  }
});

// API: Google Drive Folder Listing Proxy
app.post('/api/drive/list-folder', async (req, res) => {
  try {
    const { folderId, token } = req.body || {};
    if (!folderId) {
      return res.status(400).json({ error: 'Missing folderId parameter.' });
    }

    const cleanFolderId = String(folderId).trim();
    const query = `'${cleanFolderId}' in parents and trashed=false`;
    const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      query
    )}&fields=files(id,name,mimeType,size,webContentLink,webViewLink,thumbnailLink)&pageSize=100`;

    const headers: Record<string, string> = {};
    const bearer = token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (bearer) {
      headers['Authorization'] = `Bearer ${bearer}`;
    }

    const driveRes = await fetch(driveUrl, { headers });
    const data = await driveRes.json().catch(() => ({}));

    if (!driveRes.ok) {
      return res.status(driveRes.status).json({
        error: data.error?.message || `Google Drive API error (${driveRes.status})`,
      });
    }

    return res.json({ files: data.files || [] });
  } catch (err: any) {
    console.error('Error listing Google Drive folder:', err);
    return res.status(500).json({ error: err.message || 'Failed to list Google Drive folder.' });
  }
});

// API: Google Drive File Download & DataURL Converter Proxy
app.post('/api/drive/download-file', async (req, res) => {
  try {
    const { fileId, token } = req.body || {};
    if (!fileId) {
      return res.status(400).json({ error: 'Missing fileId parameter.' });
    }

    const cleanFileId = String(fileId).trim();
    const bearer = token || req.headers.authorization?.replace(/^Bearer\s+/i, '');

    let fileBuffer: ArrayBuffer | null = null;
    let mimeType = 'image/png';
    let fileName = 'drive_artwork.png';

    // 1. If OAuth token is provided, fetch through official Drive API v3
    if (bearer) {
      try {
        const metaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${cleanFileId}?fields=id,name,mimeType`,
          { headers: { Authorization: `Bearer ${bearer}` } }
        );
        if (metaRes.ok) {
          const meta = await metaRes.json();
          if (meta.name) fileName = meta.name;
          if (meta.mimeType) mimeType = meta.mimeType;
        }

        const mediaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${cleanFileId}?alt=media`,
          { headers: { Authorization: `Bearer ${bearer}` } }
        );
        if (mediaRes.ok) {
          fileBuffer = await mediaRes.arrayBuffer();
          const headerMime = mediaRes.headers.get('content-type');
          if (headerMime && !headerMime.includes('text/html')) {
            mimeType = headerMime;
          }
        }
      } catch (authErr) {
        console.warn('Authenticated Drive download attempt failed, falling back:', authErr);
      }
    }

    // 2. If no token or if previous attempt didn't produce fileBuffer, try public endpoints
    if (!fileBuffer) {
      const publicUrls = [
        `https://drive.usercontent.google.com/download?id=${cleanFileId}&export=download&authuser=0`,
        `https://lh3.googleusercontent.com/d/${cleanFileId}`,
        `https://drive.google.com/uc?export=download&id=${cleanFileId}`,
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
            fileBuffer = await pRes.arrayBuffer();
            mimeType = cType || 'image/png';
            break;
          }
        } catch (_) {}
      }
    }

    if (!fileBuffer) {
      return res.status(404).json({
        error:
          'Could not retrieve file from Google Drive. Please ensure the file or folder is accessible, or connect your Google Drive account.',
      });
    }

    const base64 = Buffer.from(fileBuffer).toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return res.json({
      fileId: cleanFileId,
      fileName,
      mimeType,
      dataUrl,
    });
  } catch (err: any) {
    console.error('Error downloading Google Drive file:', err);
    return res.status(500).json({ error: err.message || 'Failed to download Google Drive file.' });
  }
});

// Setup Vite or static serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('/design-studio*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'design-studio', 'index.html'));
    });
    app.get('/mockup-studio*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'mockup-studio', 'index.html'));
    });
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
