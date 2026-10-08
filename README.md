<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ffab6dc2-a9ce-46c8-98cd-6bb2ed928736

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and fill in the API keys and Google OAuth client ID. See [Google Drive and Sheets setup](GOOGLE_SHEETS_SETUP.md).
3. Start the local development server with `npm run dev` and open `http://localhost:3000`.

### Local lifestyle image generation

Lifestyle mockups use a local ComfyUI image-to-image API by default, so that step does not use Gemini or a hosted inference API quota. ComfyUI runs the model on your own computer. There is no hosted request allowance, but generation uses your computer's GPU, memory, electricity, and disk space.

1. Download and extract the [official ComfyUI Windows portable build for NVIDIA GPUs](https://github.com/Comfy-Org/ComfyUI/releases/latest/download/ComfyUI_windows_portable_nvidia.7z). The RTX 4060 is supported by this build.
2. Download a Stable Diffusion 1.5 checkpoint such as [`v1-5-pruned-emaonly.safetensors`](https://huggingface.co/genai-archive/stable-diffusion-v1-5) and put it in `ComfyUI\models\checkpoints` inside the extracted folder.
3. Start `run_nvidia_gpu.bat` and leave its window open. ComfyUI listens at `http://127.0.0.1:8188` by default.
4. Keep `LIFESTYLE_IMAGE_PROVIDER=local` in `.env` (the app uses local by default even if this variable is omitted), then restart CaseCraft Studio.

The local workflow uses the uploaded product reference as its image-to-image source when one is provided; otherwise it starts from the design image. For the closest artwork match, upload a product reference that already shows the artwork. Local image models can change fine artwork details, so inspect the result before publishing. `LOCAL_IMAGE_DENOISE` controls how much the source changes (lower values stay closer to it; the default is `0.45`). Set `COMFYUI_URL` if your local ComfyUI server uses another address and `LOCAL_IMAGE_MODEL` to the exact checkpoint filename.

To use Gemini for lifestyle mockups instead, set `LIFESTYLE_IMAGE_PROVIDER=gemini` in `.env`. That option still depends on Google's model availability and quota. A free hosted image API cannot be promised to have unlimited requests. Design artwork generation can still fall back to Hugging Face Inference Providers when Gemini is quota limited; create a token with Inference Providers permission in [token settings](https://huggingface.co/settings/tokens), set it as `HF_TOKEN`, and restart. Hugging Face's free inference credit is limited.

For a production build, run `npm run build` and then `npm start`. The build creates the browser assets and bundles the TypeScript server for Node.js.
