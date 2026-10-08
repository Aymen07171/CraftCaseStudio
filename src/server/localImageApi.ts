import { randomInt, randomUUID } from 'node:crypto';

interface InlineImage {
  mimeType: string;
  data: string;
}

interface LocalImageRequest {
  referenceImage: InlineImage;
  prompt: string;
  negativePrompt: string;
  variationIndex: number;
}

interface ComfyImage {
  filename: string;
  subfolder?: string;
  type?: string;
}

export class LocalImageApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'LocalImageApiError';
    this.statusCode = statusCode;
  }
}

const getComfyUrl = () => {
  const configuredUrl = process.env.COMFYUI_URL?.trim() || 'http://127.0.0.1:8188';
  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported protocol');
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new LocalImageApiError('COMFYUI_URL must be a valid HTTP or HTTPS URL.', 503);
  }
};

const parseJsonResponse = async <T>(response: Response, action: string): Promise<T> => {
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    const suffix = details ? ` ${details.slice(0, 600)}` : '';
    throw new LocalImageApiError(`Local ComfyUI ${action} failed (${response.status}).${suffix}`, response.status);
  }
  return response.json() as Promise<T>;
};

const getImageExtension = (mimeType: string) => {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
};

const getQueueFailure = (historyEntry: any): string | undefined => {
  const messages = historyEntry?.status?.messages;
  if (!Array.isArray(messages)) return undefined;
  const executionError = messages.find((message: any[]) => message?.[0] === 'execution_error')?.[1];
  const exceptionMessage = executionError?.exception_message;
  return typeof exceptionMessage === 'string' ? exceptionMessage : undefined;
};

export async function generateWithLocalImageApi(input: LocalImageRequest): Promise<string> {
  const baseUrl = getComfyUrl();
  const imageName = `casecraft-reference-${randomUUID()}.${getImageExtension(input.referenceImage.mimeType)}`;
  const uploadForm = new FormData();
  uploadForm.append(
    'image',
    new Blob([Buffer.from(input.referenceImage.data, 'base64')], { type: input.referenceImage.mimeType }),
    imageName,
  );
  uploadForm.append('overwrite', 'true');

  let uploadedImage: { name: string };
  try {
    const uploadResponse = await fetch(`${baseUrl}/upload/image`, {
      method: 'POST',
      body: uploadForm,
      signal: AbortSignal.timeout(30_000),
    });
    uploadedImage = await parseJsonResponse<{ name: string }>(uploadResponse, 'reference upload');
  } catch (error) {
    if (error instanceof LocalImageApiError) throw error;
    throw new LocalImageApiError(
      'The local image API is not running. Start ComfyUI with run_nvidia_gpu.bat, keep it open, and retry. Its default address is http://127.0.0.1:8188.',
      503,
    );
  }

  const checkpoint = process.env.LOCAL_IMAGE_MODEL?.trim() || 'v1-5-pruned-emaonly.safetensors';
  const denoiseValue = Number(process.env.LOCAL_IMAGE_DENOISE ?? 0.45);
  const denoise = Number.isFinite(denoiseValue) ? Math.min(0.75, Math.max(0.15, denoiseValue)) : 0.45;
  const seed = randomInt(0, 2_147_483_647);
  const workflow = {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpoint } },
    '2': { class_type: 'LoadImage', inputs: { image: uploadedImage.name } },
    '3': {
      class_type: 'ImageScale',
      inputs: {
        upscale_method: 'lanczos',
        width: 512,
        height: 768,
        crop: 'center',
        image: ['2', 0],
      },
    },
    '4': { class_type: 'VAEEncode', inputs: { pixels: ['3', 0], vae: ['1', 2] } },
    '5': { class_type: 'CLIPTextEncode', inputs: { text: input.prompt, clip: ['1', 1] } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: input.negativePrompt, clip: ['1', 1] } },
    '7': {
      class_type: 'KSampler',
      inputs: {
        seed: seed + Math.max(0, input.variationIndex - 1),
        steps: 22,
        cfg: 6.5,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        denoise,
        model: ['1', 0],
        positive: ['5', 0],
        negative: ['6', 0],
        latent_image: ['4', 0],
      },
    },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['1', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'casecraft/lifestyle', images: ['8', 0] } },
  };

  let promptId: string;
  try {
    const promptResponse = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
      signal: AbortSignal.timeout(30_000),
    });
    const queued = await parseJsonResponse<{ prompt_id?: string; node_errors?: unknown }>(promptResponse, 'workflow submission');
    if (!queued.prompt_id) {
      throw new LocalImageApiError(
        `ComfyUI did not accept the workflow. Check that ${checkpoint} is installed and that standard ComfyUI nodes are available.`,
        502,
      );
    }
    promptId = queued.prompt_id;
  } catch (error) {
    if (error instanceof LocalImageApiError) throw error;
    throw new LocalImageApiError('Could not submit the image workflow to the local ComfyUI server.', 502);
  }

  const timeoutValue = Number(process.env.LOCAL_IMAGE_TIMEOUT_MS ?? 300_000);
  const timeoutMs = Number.isFinite(timeoutValue) ? Math.min(1_200_000, Math.max(30_000, timeoutValue)) : 300_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    let history: Record<string, any>;
    try {
      const historyResponse = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, {
        signal: AbortSignal.timeout(15_000),
      });
      history = await parseJsonResponse<Record<string, any>>(historyResponse, 'generation status check');
    } catch (error) {
      if (error instanceof LocalImageApiError) throw error;
      throw new LocalImageApiError('Lost connection to ComfyUI while it was generating the image.', 502);
    }

    const entry = history[promptId];
    if (!entry) continue;
    const image = entry.outputs?.['9']?.images?.[0] as ComfyImage | undefined;
    if (image?.filename) {
      const viewUrl = new URL(`${baseUrl}/view`);
      viewUrl.searchParams.set('filename', image.filename);
      viewUrl.searchParams.set('subfolder', image.subfolder || '');
      viewUrl.searchParams.set('type', image.type || 'output');
      const imageResponse = await fetch(viewUrl, { signal: AbortSignal.timeout(30_000) });
      if (!imageResponse.ok) {
        throw new LocalImageApiError(`ComfyUI generated an image but could not return it (${imageResponse.status}).`, 502);
      }
      const mimeType = imageResponse.headers.get('content-type')?.split(';')[0] || 'image/png';
      const data = Buffer.from(await imageResponse.arrayBuffer()).toString('base64');
      return `data:${mimeType};base64,${data}`;
    }

    const queueError = getQueueFailure(entry);
    if (queueError) {
      console.error('ComfyUI lifestyle image generation failed:', queueError);
      throw new LocalImageApiError(
        `ComfyUI could not generate this image. Check its console and verify the local model file (${checkpoint}).`,
        502,
      );
    }
  }

  throw new LocalImageApiError(
    'Local image generation timed out. Check ComfyUI and lower its workload or increase LOCAL_IMAGE_TIMEOUT_MS.',
    504,
  );
}
