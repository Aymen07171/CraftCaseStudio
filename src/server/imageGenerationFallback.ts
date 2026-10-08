import { InferenceClient } from '@huggingface/inference';

export type ImageAspectRatio = '9:16' | '1:1' | '3:4' | '4:3' | '16:9';

const IMAGE_DIMENSIONS: Record<ImageAspectRatio, { width: number; height: number }> = {
  '9:16': { width: 768, height: 1344 },
  '1:1': { width: 1024, height: 1024 },
  '3:4': { width: 768, height: 1024 },
  '4:3': { width: 1024, height: 768 },
  '16:9': { width: 1344, height: 768 },
};

export function isGeminiQuotaError(error: unknown): boolean {
  const value = error as {
    status?: number | string;
    statusCode?: number | string;
    code?: number | string;
    message?: string;
  } | null;
  const status = Number(value?.status ?? value?.statusCode ?? value?.code);
  return status === 429 || /RESOURCE_EXHAUSTED|quota exceeded|rate.?limit/i.test(value?.message || '');
}

export function getQuotaStatus(error: unknown): number {
  const value = error as {
    status?: number | string;
    statusCode?: number | string;
    code?: number | string;
    httpResponse?: { status?: number };
  } | null;
  return Number(value?.status ?? value?.statusCode ?? value?.code ?? value?.httpResponse?.status);
}

export function hasHuggingFaceImageFallback(): boolean {
  const token = process.env.HF_TOKEN?.trim();
  return Boolean(token && !token.startsWith('your_'));
}

export async function generateHuggingFaceImage(
  prompt: string,
  aspectRatio: ImageAspectRatio,
  seed?: number,
): Promise<{ imageUrl: string; width: number; height: number; model: string }> {
  const token = process.env.HF_TOKEN?.trim();
  if (!token || token.startsWith('your_')) {
    throw new Error(
      'Automatic image fallback is not configured. Add a Hugging Face token with Inference Providers permission as HF_TOKEN in .env, then restart the app.',
    );
  }

  const model = process.env.HF_IMAGE_MODEL?.trim() || 'black-forest-labs/FLUX.1-schnell';
  const { width, height } = IMAGE_DIMENSIONS[aspectRatio];
  const client = new InferenceClient(token);
  const image = await client.textToImage(
    {
      model,
      inputs: prompt,
      parameters: {
        width,
        height,
        num_inference_steps: 4,
        ...(seed === undefined ? {} : { seed }),
      },
    },
    { signal: AbortSignal.timeout(120_000) },
  );

  const mimeType = image.type && image.type.startsWith('image/') ? image.type : 'image/png';
  const base64 = Buffer.from(await image.arrayBuffer()).toString('base64');
  if (!base64) throw new Error('Hugging Face returned an empty image.');

  return {
    imageUrl: `data:${mimeType};base64,${base64}`,
    width,
    height,
    model,
  };
}

export function describeHuggingFaceImageError(error: unknown): string {
  const status = getQuotaStatus(error);
  if (status === 401 || status === 403) {
    return 'Hugging Face rejected HF_TOKEN. Check that it has Inference Providers permission and that you accepted the selected model’s access terms.';
  }
  if (status === 402 || status === 429) {
    return 'The Hugging Face fallback has run out of its available free credits or is rate limited. Check your Hugging Face Inference Providers usage and try again when credits refresh.';
  }
  if (status === 503) {
    return 'The Hugging Face image model is loading or temporarily unavailable. Please retry shortly.';
  }
  return 'The Hugging Face image fallback could not generate an image. Check HF_TOKEN, model access, and server logs.';
}
