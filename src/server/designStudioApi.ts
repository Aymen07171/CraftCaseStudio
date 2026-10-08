import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import {
  describeHuggingFaceImageError,
  generateHuggingFaceImage,
  getQuotaStatus,
  isGeminiQuotaError,
} from './imageGenerationFallback';
const router = express.Router();

// API: Generate design artwork with Gemini image generation
router.post('/generate-design', async (req, res) => {
  const { prompt, aspectRatio = '9:16', seed } = req.body || {};
  const allowedRatios = ['9:16', '1:1', '3:4', '4:3', '16:9'] as const;
  const requestedRatio = String(aspectRatio);
  const ratio = (allowedRatios as readonly string[]).includes(requestedRatio)
    ? requestedRatio as (typeof allowedRatios)[number]
    : '9:16';
  const variation = Number.isFinite(Number(seed)) ? Number(seed) : Math.floor(Math.random() * 1_000_000_000);
  try {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.startsWith('your_')) {
      return res.status(503).json({
        error: 'Image generation is not configured. Add your Gemini API key as GEMINI_API_KEY in .env and restart the app.',
      });
    }

    const dimensions: Record<(typeof allowedRatios)[number], { width: number; height: number }> = {
      '9:16': { width: 768, height: 1344 },
      '1:1': { width: 1024, height: 1024 },
      '3:4': { width: 768, height: 1024 },
      '4:3': { width: 1024, height: 768 },
      '16:9': { width: 1344, height: 768 },
    };
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: `Create original, polished phone-case artwork from this brief. Make the artwork edge-to-edge, visually clear, and free of text, logos, watermarks, mockup devices, or borders unless explicitly requested.\n\n${prompt.trim()}\n\nComposition variation: ${variation}.`,
      config: { imageConfig: { aspectRatio: ratio } },
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData);
    if (!imagePart?.inlineData?.data) {
      throw new Error(response.text || 'Gemini did not return image data.');
    }
    const dataUrl = `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
    const { width, height } = dimensions[ratio];

    return res.json({
      imageUrl: dataUrl,
      seed: variation,
      width,
      height,
      aspectRatio: ratio,
    });
  } catch (error: any) {
    console.error('Error generating design with Gemini:', error);
    if (isGeminiQuotaError(error)) {
      try {
        const fallback = await generateHuggingFaceImage(prompt.trim(), ratio, variation);
        console.info(`Generated design with Hugging Face fallback model ${fallback.model}.`);
        return res.json({
          ...fallback,
          seed: variation,
          aspectRatio: ratio,
          provider: 'Hugging Face',
        });
      } catch (fallbackError) {
        console.error('Hugging Face design fallback failed:', fallbackError);
        const fallbackMessage = fallbackError instanceof Error && fallbackError.message.includes('not configured')
          ? fallbackError.message
          : describeHuggingFaceImageError(fallbackError);
        return res.status(429).json({ error: `Gemini image quota is unavailable. ${fallbackMessage}` });
      }
    }

    const status = getQuotaStatus(error);
    const userError = status === 401 || status === 403
      ? 'Gemini rejected the API key. Check GEMINI_API_KEY in .env.'
      : status === 429
        ? 'Gemini API quota is unavailable. Check your Google AI quota or try again later.'
        : error?.message || 'Failed to generate artwork with Gemini.';
    return res.status(status === 429 ? 429 : 502).json({ error: userError });
  }
});

// Fallback curated suggestions per common placeholder tag
const FALLBACK_SUGGESTIONS: Record<string, string[]> = {
  SUBJECT_POSE: [
    'celestial kitsune blade dancer soaring through golden clouds',
    'armored cyber samurai preparing an unsheathing strike',
    'ancient forest guardian stag crowned with blooming wisteria',
    'moonlit valkyrie warrior brandishing a spear of pure starlight',
    'neon streetwear ronin standing on a rain-drenched neon overpass',
    'winged anime oracle clutching a glowing celestial astrolabe',
  ],
  BOTANICAL: [
    'cherry blossoms dancing across swirling iridescent wind trails',
    'delicate spider lilies with creeping thorny vines',
    'golden ginkgo leaves descending into a radiant pool of starlight',
    'bioluminescent neon moss entwined with weeping willow fronds',
    'art nouveau lotus blossoms with serpentine gilded stems',
    'cascading midnight jasmine and deep indigo bellflowers',
  ],
  COMPANION: [
    'spirit fox with nine swirling azure flame tails',
    'cybernetic scout falcon with glowing geometric wings',
    'ethereal jade koi gliding effortlessly through mid-air stardust',
    'golden scarab beetle with wings encrusted in luminous lapis',
    'shadow dragon whelp curling softly around a celestial orb',
    'crystallized origami crane with faint prism light trails',
  ],
  COLOR_PALETTE: [
    'deep sapphire indigo, molten gold, crimson scarlet, and ethereal cyan',
    'neon magenta, electric cyan, midnight charcoal, and acid yellow',
    'burnished antique gold, velvety sage green, and obsidian black',
    'pastel sunset peach, lavender dusk, warm cream, and iridescent opal',
    'deep emerald pine, champagne bronze, and rich burgundy wine',
    'monochrome graphite with radiant liquid gold accents',
  ],
  BORDER_THEME: [
    'ornate art nouveau brass filigree with constellation charts',
    'tactical holographic telemetry frame with neon corner brackets',
    'gothic cathedral pointed stained-glass arch with trefoil relief',
    'infinite synthwave perspective wireframe horizon with retro grids',
    'celestial zodiac wheel with gilded lunar phase cycles',
    'clean modern double-line gold leaf border with crosshair corners',
  ],
};

// API: Placeholder suggestions with Gemini and curated fallbacks
router.post('/suggest-values', async (req, res) => {
  try {
    const { placeholder, niche, currentPrompt } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && !apiKey.startsWith('your_')) {
      try {
        const promptContent = `You are a creative director for graphic illustration and print artwork.
For the placeholder tag "${placeholder}" in the niche "${niche}" (context: "${currentPrompt || ''}"):
Provide 6 vivid, creative, unique options to fill this placeholder.
Return ONLY a valid JSON array of 6 short strings, for example: ["option 1", "option 2", "option 3", "option 4", "option 5", "option 6"]. Do not include any other markdown or commentary.`;
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: promptContent,
          config: { responseMimeType: 'application/json', temperature: 0.8 },
        });
        const parsed = JSON.parse((response.text || '[]').replace(/```json\s*|```/gi, '').trim());
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleanSuggestions = parsed
            .map((item) => (typeof item === 'string' ? item : item.idea || item.title || JSON.stringify(item)))
            .filter(Boolean)
            .slice(0, 6);
          if (cleanSuggestions.length > 0) {
            return res.json({ suggestions: cleanSuggestions });
          }
        }
      } catch (err) {
        console.warn('Gemini suggestions failed; using curated fallback suggestions:', err);
      }
    }

    // Default curated fallback if API call fails
    const key = (placeholder || '').toUpperCase().trim();
    const suggestions = FALLBACK_SUGGESTIONS[key] || [
      `radiant ${placeholder} infused with celestial energy`,
      `intricate dynamic ${placeholder} with fine details`,
      `ethereal glowing ${placeholder} in motion`,
      `stylized minimalist ${placeholder} with bold lines`,
      `ornate vintage ${placeholder} with gilded accents`,
      `cybernetic high-tech ${placeholder} with neon pulses`,
    ];

    return res.json({ suggestions });
  } catch (error: any) {
    console.error('Error suggesting values:', error);
    return res.status(500).json({ suggestions: [] });
  }
});

// API: AI Design Title Suggestions
router.post('/suggest-titles', async (req, res) => {
  try {
    const { prompt = '', niche = '', currentTitle = '' } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY || '';

    if (!apiKey || apiKey.startsWith('your_')) {
      const base = currentTitle || niche || 'Artistic Case';
      return res.json({
        titles: [
          `${base} Stained Glass Edition`,
          `Celestial ${base} Artwork`,
          `Ethereal ${base} Illustration`,
          `Mystic ${base} Graphic Print`,
          `Luminous ${base} Design`,
        ],
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `You are a creative brand director for e-commerce phone case artwork.
Given the niche "${niche}" and prompt context:
"${prompt}"

Suggest 5 punchy, memorable, highly marketable design artwork titles (between 3 and 7 words each).
Return ONLY a valid JSON array of 5 strings (e.g. ["Title 1", "Title 2", "Title 3", "Title 4", "Title 5"]).`,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    });

    let titles: string[] = [];
    try {
      const cleanJson = (response.text || '[]').replace(/```json\s*|```/gi, '').trim();
      titles = JSON.parse(cleanJson);
    } catch {
      titles = [];
    }

    if (!Array.isArray(titles) || titles.length === 0) {
      titles = [
        `${currentTitle || niche} Stained Glass`,
        `Celestial ${niche || 'Artwork'}`,
        `Ethereal ${niche || 'Design'}`,
      ];
    }

    return res.json({ titles: titles.slice(0, 5) });
  } catch (error: any) {
    const errorMsg = error?.message || '';
    if (errorMsg.includes('403') || errorMsg.includes('PERMISSION_DENIED') || errorMsg.includes('dunning')) {
      console.warn('Gemini API quota/permission notice in suggest-titles, generating algorithmic titles.');
    } else {
      console.warn('Could not generate Gemini title suggestions, using fallback titles:', errorMsg);
    }
    const baseNiche = req.body?.niche || 'Artwork';
    return res.json({
      titles: [
        `${baseNiche} - Celestial Edition`,
        `Luminous ${baseNiche} Art`,
        `Ethereal ${baseNiche} Odyssey`,
        `Mystic ${baseNiche} Heritage`,
        `Vibrant ${baseNiche} Collector Case`,
      ],
    });
  }
});

// Helper to extract image part from data URI, local path, or remote URL
async function resolveImageInlineData(imageInput?: string) {
  if (!imageInput || typeof imageInput !== 'string') return null;

  try {
    if (imageInput.startsWith('data:')) {
      const match = imageInput.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return {
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        };
      }
    } else if (imageInput.startsWith('/') || imageInput.startsWith('./') || imageInput.includes('/assets/')) {
      const fs = await import('fs');
      const pathModule = await import('path');
      const cleanPath = imageInput.replace(/^\//, '');
      const candidates = [
        pathModule.resolve(process.cwd(), cleanPath),
        pathModule.resolve(process.cwd(), 'public', cleanPath),
        pathModule.resolve(process.cwd(), 'src', cleanPath),
        pathModule.resolve(process.cwd(), imageInput),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          const buf = fs.readFileSync(candidate);
          const mimeType = candidate.endsWith('.png')
            ? 'image/png'
            : candidate.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
          return {
            inlineData: {
              mimeType,
              data: buf.toString('base64'),
            },
          };
        }
      }
    } else if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const resp = await fetch(imageInput, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const arrayBuf = await resp.arrayBuffer();
        const mimeType = resp.headers.get('content-type') || 'image/jpeg';
        return {
          inlineData: {
            mimeType,
            data: Buffer.from(arrayBuf).toString('base64'),
          },
        };
      }
    }
  } catch (err) {
    console.warn('Could not read image for visual analysis, falling back to text prompt context:', err);
  }
  return null;
}

// Fallback generator when API key is not present or rate limited
function generateFallbackListing(designTitle = '', niche = '', prompt = '') {
  const cleanTitle = designTitle.trim() || 'Artistic Phone Case';
  const cleanNiche = niche.trim() || 'Custom Artwork';
  const titleWords = `${cleanTitle} ${cleanNiche}`.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const primaryTheme = titleWords.slice(0, 3).join(' ') || 'artistic phone';

  const productTitle = `${cleanTitle} Tough Phone Case | Aesthetic ${cleanNiche} Protective Cover for iPhone & Samsung`.slice(0, 140).trim();

  const productDescription = `✨ ${cleanTitle} - Premium Tough & Slim Phone Case

Elevate your device with this stunning ${cleanNiche} design featuring ${primaryTheme}. Perfect for everyday style, durability, and reliable protection.

🌟 Key Features:
• Dual-layer design: Impact-resistant polycarbonate outer shell with shock-absorbing TPU liner
• Vivid, edge-to-edge wrap print with rich fade-resistant colors
• Precision cutouts for speakers, camera, and all ports
• Compatible with wireless Qi charging
• Available for popular Apple iPhone & Samsung Galaxy models

🎁 Ideal Gift:
A unique and thoughtful gift for ${cleanNiche} enthusiasts, art lovers, friends, and family on birthdays, holidays, or special celebrations.

📦 Production & Care:
Made to order with precision printing. Wipe clean with a soft damp cloth.`;

  const fallbackTags = [
    `${primaryTheme.slice(0, 15)} case`,
    `${cleanNiche.slice(0, 14)} phone`,
    'aesthetic case',
    'tough phone case',
    'iphone case',
    'samsung case',
    'unique gift',
    'artistic cover',
    'trendy phone case',
    'protective case',
    'gift for her',
    'gift for him',
    'custom artwork',
  ].map((t) => t.slice(0, 20).toLowerCase());

  return {
    productTitle,
    productDescription,
    primaryKeywords: [`${primaryTheme} case`, `${cleanNiche} phone cover`, 'protective phone case'],
    longTailKeywords: [`${cleanTitle} phone case gift`, `aesthetic ${cleanNiche} tough case`, 'wireless charging phone cover'],
    etsyTags: fallbackTags.slice(0, 13),
    category: 'Electronics Cases / Phone Cases',
    primaryColor: 'Multi-color',
    secondaryColor: 'Vibrant',
    designStyle: [cleanNiche || 'Artistic', 'Modern', 'Graphic'],
    occasion: 'Everyday / Birthday Gift',
    targetCustomer: ['Art Enthusiasts', 'Gift Shoppers', 'Smartphone Users'],
    searchIntent: [
      `Shoppers searching for "${cleanTitle}" looking for stylish protection`,
      `Shoppers looking for high quality ${cleanNiche} phone cases`,
    ],
    keywordRationale: `Optimized for high-converting Etsy search volume focusing on "${cleanTitle}", device compatibility, and gift intent.`,
  };
}

router.post('/generate-etsy-listing', async (req, res) => {
  const { prompt = '', imageDataUrl = '', designTitle = '', niche = '' } = req.body || {};

  const apiKey = process.env.GEMINI_API_KEY || '';

  if (!apiKey || apiKey.startsWith('your_')) {
    console.warn('GEMINI_API_KEY is not configured. Returning intelligent fallback listing.');
    return res.json({ listing: generateFallbackListing(designTitle, niche, prompt) });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const parts: any[] = [
      {
        text: `You are an expert Etsy SEO specialist and e-commerce copywriter.
Analyze this phone case artwork and create an optimized, complete Etsy listing.

CONTEXT:
- Design Title / Subject: ${designTitle || 'Original Artwork'}
- Niche / Category: ${niche || 'Phone Case Art'}
- Generation Prompt: ${prompt || 'Phone case illustration artwork'}

REQUIREMENTS:
1. productTitle: Engaging, descriptive Etsy title with key search phrases (max 140 characters). Do not keyword-stuff.
2. productDescription: Detailed, customer-ready description with intro hook, visual details, dual-layer tough protection highlights, wireless charging compatibility, and gift appeal.
3. etsyTags: Exactly 13 distinct, high-volume Etsy tags. Each tag MUST be between 2 and 20 characters, containing only letters, numbers, spaces, and hyphens.
4. primaryKeywords: 3-5 top search terms.
5. longTailKeywords: 4-6 specific search phrases.
6. category: E.g., "Electronics Cases / Phone Cases"
7. primaryColor & secondaryColor: Dominant visual colors.
8. designStyle: 2-4 style tags (e.g. ["Stained Glass", "Vibrant", "Artistic"]).
9. occasion: e.g. "Birthday", "Holiday", "Everyday"
10. targetCustomer: 2-4 audience descriptors.
11. searchIntent: 2-3 bullet explanations.
12. keywordRationale: Brief strategy explanation.`,
      },
    ];

    // Try to attach image part if available
    const imagePart = await resolveImageInlineData(imageDataUrl);
    if (imagePart) {
      parts.push(imagePart);
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts,
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            productTitle: { type: Type.STRING, description: 'Etsy title, max 140 characters' },
            productDescription: { type: Type.STRING, description: 'Customer-ready Etsy product description' },
            primaryKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            longTailKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            etsyTags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Exactly 13 unique tags, each at most 20 characters',
            },
            category: { type: Type.STRING },
            primaryColor: { type: Type.STRING },
            secondaryColor: { type: Type.STRING },
            designStyle: { type: Type.ARRAY, items: { type: Type.STRING } },
            occasion: { type: Type.STRING },
            targetCustomer: { type: Type.ARRAY, items: { type: Type.STRING } },
            searchIntent: { type: Type.ARRAY, items: { type: Type.STRING } },
            keywordRationale: { type: Type.STRING },
          },
          required: [
            'productTitle',
            'productDescription',
            'primaryKeywords',
            'longTailKeywords',
            'etsyTags',
            'category',
            'primaryColor',
            'secondaryColor',
            'designStyle',
            'occasion',
            'targetCustomer',
            'searchIntent',
            'keywordRationale',
          ],
        },
        temperature: 0.5,
      },
    });

    let rawJson: any = null;
    const responseText = response.text || '';
    try {
      const cleanJson = responseText.replace(/```json\s*|```/gi, '').trim();
      rawJson = JSON.parse(cleanJson);
    } catch (parseError) {
      console.warn('Could not parse Gemini JSON response, extracting fallback:', parseError);
    }

    if (!rawJson || typeof rawJson !== 'object') {
      return res.json({ listing: generateFallbackListing(designTitle, niche, prompt) });
    }

    // Clean and validate fields
    let cleanTitle = String(rawJson.productTitle || '').trim();
    if (cleanTitle.length > 140) {
      cleanTitle = cleanTitle.slice(0, 140).replace(/\s+\S*$/, '').trim();
    }
    if (!cleanTitle) {
      cleanTitle = `${designTitle || 'Artistic'} Tough Phone Case`;
    }

    // Clean and ensure exactly 13 unique tags under 20 chars
    const rawTags = Array.isArray(rawJson.etsyTags) ? rawJson.etsyTags : [];
    const validTags: string[] = [];
    for (const t of rawTags) {
      if (typeof t === 'string') {
        const sanitized = t.replace(/[^a-zA-Z0-9 -]/g, '').trim().toLowerCase().slice(0, 20);
        if (sanitized.length >= 2 && !validTags.includes(sanitized)) {
          validTags.push(sanitized);
        }
      }
    }

    // Pad if fewer than 13
    const fallbackTagsList = generateFallbackListing(designTitle, niche, prompt).etsyTags;
    for (const fbTag of fallbackTagsList) {
      if (validTags.length >= 13) break;
      if (!validTags.includes(fbTag)) {
        validTags.push(fbTag);
      }
    }

    const listing = {
      productTitle: cleanTitle,
      productDescription: String(rawJson.productDescription || '').trim() || generateFallbackListing(designTitle, niche, prompt).productDescription,
      primaryKeywords: Array.isArray(rawJson.primaryKeywords) && rawJson.primaryKeywords.length > 0 ? rawJson.primaryKeywords : ['phone case', 'tough case'],
      longTailKeywords: Array.isArray(rawJson.longTailKeywords) && rawJson.longTailKeywords.length > 0 ? rawJson.longTailKeywords : ['protective phone case'],
      etsyTags: validTags.slice(0, 13),
      category: String(rawJson.category || 'Electronics Cases / Phone Cases'),
      primaryColor: String(rawJson.primaryColor || 'Multi-color'),
      secondaryColor: String(rawJson.secondaryColor || 'Vibrant'),
      designStyle: Array.isArray(rawJson.designStyle) ? rawJson.designStyle : [String(rawJson.designStyle || niche || 'Artistic')],
      occasion: String(rawJson.occasion || 'Everyday'),
      targetCustomer: Array.isArray(rawJson.targetCustomer) ? rawJson.targetCustomer : ['Art Lovers', 'Phone Owners'],
      searchIntent: Array.isArray(rawJson.searchIntent) ? rawJson.searchIntent : ['Shoppers looking for aesthetic phone case protection'],
      keywordRationale: String(rawJson.keywordRationale || 'Selected for optimal Etsy search visibility and high buyer intent.'),
    };

    return res.json({ listing });
  } catch (error: any) {
    const errorMsg = error?.message || '';
    if (errorMsg.includes('403') || errorMsg.includes('PERMISSION_DENIED') || errorMsg.includes('dunning')) {
      console.warn('Gemini API quota notice in listing generator; providing intelligent structured listing fallback.');
    } else {
      console.warn('Gemini listing generation error, using fallback engine:', errorMsg);
    }
    // Return gracefully generated fallback rather than crashing
    return res.json({
      listing: generateFallbackListing(designTitle, niche, prompt),
      warning: errorMsg || 'Generated via fallback engine',
    });
  }
});

export default router;
