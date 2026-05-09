import crypto from "node:crypto";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";
import { ModelInfo, scoreModel } from "@/lib/models-registry";
import { validatePublicHttpUrl } from "@/lib/safe-url";

export interface ReferenceImageInput {
  dataUrl: string;
  mimeType?: string;
  name?: string;
  size?: number;
}

export interface LocalImageAnalysis {
  source: "local_free";
  width: number;
  height: number;
  format: string;
  aspectRatio: number;
  aspectRatioLabel: string;
  orientation: "portrait" | "landscape" | "square";
  averageColor: string;
  palette: string[];
  brightness: "dark" | "balanced" | "bright";
  contrast: "soft" | "balanced" | "high";
  saturation: "muted" | "balanced" | "vivid";
  likelyUse: string[];
  sha256: string;
  sanitizedBytes: number;
}

export interface VisionAnalysisResult {
  source: "original_api_vision" | "enhanced_vision" | "local_free";
  modelId: string;
  modelName: string;
  provider: string;
  summary: string;
  local: LocalImageAnalysis;
  available: boolean;
  error?: string;
}

export interface ReferencePromptCandidate {
  id: string;
  source: "original_api_vision" | "enhanced_vision" | "local_free" | "hybrid" | "fallback";
  label: string;
  prompt: string;
}

export interface ReferencePromptScore {
  candidateId: string;
  total: number;
  dimensions: Record<string, number>;
  reason: string;
}

const MAX_REFERENCE_IMAGE_BYTES = 7 * 1024 * 1024;
const VISION_TIMEOUT_MS = 90_000;

function resolveKey(provider: string, userKeys: Record<string, string> = {}): string {
  const envMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
    custom: "CUSTOM_API_KEY",
    aihubmix: "AIHUBMIX_API_KEY",
    qwen: "QWEN_API_KEY",
  };
  const envName = envMap[provider];
  if (!envName) return "";
  return userKeys[envName]?.trim() || process.env[envName]?.trim() || "";
}

function hasCustomRelay(userKeys: Record<string, string> = {}): boolean {
  return Boolean(resolveKey("custom", userKeys) && (userKeys.CUSTOM_BASE_URL?.trim() || process.env.CUSTOM_BASE_URL?.trim()));
}

function normalizeBase64(dataUrl: string): { mimeType: string; base64: string; buffer: Buffer } {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new Error("参考图格式无效，请重新上传。 Invalid reference image data.");
  }
  const mimeType = match[1].toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType)) {
    throw new Error("仅支持 JPG、PNG、WEBP 或 GIF 参考图。 Only JPG, PNG, WEBP, or GIF reference images are supported.");
  }
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error("参考图过大，请换一张更小的图片。 Reference image is too large.");
  }
  return { mimeType, base64: match[2], buffer };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;
}

function closestAspectRatio(width: number, height: number): string {
  const ratio = width / Math.max(height, 1);
  const choices = [
    { label: "1:1", value: 1 },
    { label: "4:5", value: 0.8 },
    { label: "3:4", value: 0.75 },
    { label: "2:3", value: 0.667 },
    { label: "3:2", value: 1.5 },
    { label: "4:3", value: 1.333 },
    { label: "16:9", value: 1.778 },
    { label: "9:16", value: 0.5625 },
    { label: "21:9", value: 2.333 },
  ];
  return choices
    .map((item) => ({ ...item, delta: Math.abs(item.value - ratio) }))
    .sort((a, b) => a.delta - b.delta)[0]?.label ?? `${width}:${height}`;
}

function analyzePixels(raw: Buffer, channels: number): Pick<LocalImageAnalysis, "averageColor" | "palette" | "brightness" | "contrast" | "saturation"> {
  const pixels: Array<{ r: number; g: number; b: number }> = [];
  for (let i = 0; i + channels - 1 < raw.length; i += channels) {
    const alpha = channels >= 4 ? raw[i + 3] : 255;
    if (alpha < 24) continue;
    pixels.push({ r: raw[i], g: raw[i + 1], b: raw[i + 2] });
  }
  const safePixels = pixels.length ? pixels : [{ r: 128, g: 128, b: 128 }];
  const sums = safePixels.reduce<{
    r: number;
    g: number;
    b: number;
    luma: number;
    saturation: number;
    lumas: number[];
  }>(
    (acc, p) => {
      const max = Math.max(p.r, p.g, p.b);
      const min = Math.min(p.r, p.g, p.b);
      const luma = 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
      acc.r += p.r;
      acc.g += p.g;
      acc.b += p.b;
      acc.luma += luma;
      acc.saturation += max === 0 ? 0 : (max - min) / max;
      acc.lumas.push(luma);
      return acc;
    },
    { r: 0, g: 0, b: 0, luma: 0, saturation: 0, lumas: [] as number[] },
  );
  const count = safePixels.length;
  const averageLuma = sums.luma / count;
  const averageSaturation = sums.saturation / count;
  const variance = sums.lumas.reduce((sum, value) => sum + Math.pow(value - averageLuma, 2), 0) / count;
  const stdDev = Math.sqrt(variance);
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  for (const p of safePixels) {
    const key = `${Math.round(p.r / 48)}-${Math.round(p.g / 48)}-${Math.round(p.b / 48)}`;
    const existing = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    existing.r += p.r;
    existing.g += p.g;
    existing.b += p.b;
    existing.count += 1;
    buckets.set(key, existing);
  }
  const palette = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((item) => rgbToHex(item.r / item.count, item.g / item.count, item.b / item.count));

  return {
    averageColor: rgbToHex(sums.r / count, sums.g / count, sums.b / count),
    palette,
    brightness: averageLuma < 90 ? "dark" : averageLuma > 175 ? "bright" : "balanced",
    contrast: stdDev < 38 ? "soft" : stdDev > 76 ? "high" : "balanced",
    saturation: averageSaturation < 0.22 ? "muted" : averageSaturation > 0.46 ? "vivid" : "balanced",
  };
}

export function parseReferenceImage(input: ReferenceImageInput): { mimeType: string; base64: string; buffer: Buffer } {
  return normalizeBase64(input.dataUrl);
}

export async function analyzeReferenceImage(input: ReferenceImageInput): Promise<{ local: LocalImageAnalysis; base64: string; mimeType: string; buffer: Buffer }> {
  const parsed = parseReferenceImage(input);
  const image = sharp(parsed.buffer, { limitInputPixels: 28_000_000, animated: false }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("无法读取参考图尺寸，请换一张清晰图片。 Could not read reference image dimensions.");
  }
  const sanitized = await image
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  const sample = await sharp(sanitized)
    .resize(18, 18, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const stats = analyzePixels(sample, 4);
  const width = metadata.width;
  const height = metadata.height;
  const orientation = Math.abs(width - height) / Math.max(width, height) < 0.08
    ? "square"
    : width > height
      ? "landscape"
      : "portrait";
  const likelyUse = [
    orientation === "portrait" ? "portrait / character / poster" : orientation === "landscape" ? "scene / banner / cinematic frame" : "social post / product card / avatar",
    stats.brightness === "dark" ? "low-key or night lighting" : stats.brightness === "bright" ? "bright commercial or daylight lighting" : "balanced exposure",
    stats.saturation === "vivid" ? "high-color stylized look" : stats.saturation === "muted" ? "minimal, cinematic, or editorial palette" : "natural color palette",
  ];

  return {
    local: {
      source: "local_free",
      width,
      height,
      format: metadata.format ?? parsed.mimeType.replace("image/", ""),
      aspectRatio: Math.round((width / height) * 1000) / 1000,
      aspectRatioLabel: closestAspectRatio(width, height),
      orientation,
      ...stats,
      likelyUse,
      sha256: crypto.createHash("sha256").update(parsed.buffer).digest("hex"),
      sanitizedBytes: sanitized.length,
    },
    base64: sanitized.toString("base64"),
    mimeType: "image/jpeg",
    buffer: sanitized,
  };
}

export function summarizeLocalAnalysis(local: LocalImageAnalysis): string {
  return [
    `Free local image analysis: ${local.width}x${local.height}, ${local.orientation}, approximate aspect ratio ${local.aspectRatioLabel}.`,
    `Average color ${local.averageColor}; palette ${local.palette.join(", ")}.`,
    `Brightness ${local.brightness}; contrast ${local.contrast}; saturation ${local.saturation}.`,
    `Likely visual use: ${local.likelyUse.join("; ")}.`,
    "This local analysis is deterministic and privacy-preserving, but it cannot truly identify faces, objects, brands, small text, or style history without a vision model.",
  ].join("\n");
}

export function modelSupportsVision(model?: ModelInfo | null): boolean {
  if (!model) return false;
  const text = `${model.id} ${model.name} ${(model.tags ?? []).join(" ")}`.toLowerCase();
  return /(vision|multimodal|omni|gpt-4o|gpt-4\.1|gpt-5|claude|gemini|qwen.*vl|vl-|llava|pixtral|glm.*v|phi-4-multimodal)/i.test(text);
}

export function canCallVisionModel(model: ModelInfo, userKeys: Record<string, string>, availableModelIds?: string[]): boolean {
  const provider = resolveVisionProvider(model, userKeys, availableModelIds);
  if (!modelSupportsVision(model)) return false;
  if (provider === "custom" || provider === "aihubmix") return hasCustomRelay(userKeys) || Boolean(resolveKey("aihubmix", userKeys));
  if (provider === "openai") return Boolean(resolveKey("openai", userKeys));
  if (provider === "anthropic") return Boolean(resolveKey("anthropic", userKeys));
  if (provider === "google") return Boolean(resolveKey("google", userKeys));
  if (provider === "qwen") return Boolean(resolveKey("qwen", userKeys));
  return false;
}

export function resolveVisionProvider(model: ModelInfo, userKeys: Record<string, string>, availableModelIds?: string[]): string {
  const listed = availableModelIds?.some((id) => id.toLowerCase() === model.id.toLowerCase());
  if (hasCustomRelay(userKeys) && (listed || model.apiProvider === "aihubmix" || model.apiProvider === "custom")) return "aihubmix";
  return model.apiProvider;
}

export function chooseEnhancedVisionModel(
  models: ModelInfo[],
  userKeys: Record<string, string>,
  availableModelIds: string[] | undefined,
  avoidModelId?: string,
): ModelInfo | null {
  const preferredIds = [
    process.env.VISION_ANALYSIS_MODEL,
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-3.1-pro-preview",
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-5.5-pro",
    "claude-sonnet-4-6",
    "qwen-vl-max",
  ].filter((id): id is string => Boolean(id));

  const candidates = models
    .filter((model) => (model.category ?? "text") === "text")
    .filter((model) => model.id !== avoidModelId)
    .filter(modelSupportsVision)
    .filter((model) => canCallVisionModel(model, userKeys, availableModelIds));

  for (const id of preferredIds) {
    const exact = candidates.find((model) => model.id.toLowerCase() === id.toLowerCase());
    if (exact) return exact;
  }

  return candidates.sort((a, b) => {
    const providerBias = (model: ModelInfo) => model.apiProvider === "google" ? 20 : model.apiProvider === "openai" ? 12 : 0;
    return scoreModel(b, "accurate") + providerBias(b) - (scoreModel(a, "accurate") + providerBias(a));
  })[0] ?? null;
}

function buildVisionAnalysisPrompt(local: LocalImageAnalysis, userIdea: string, channel: "original_api_vision" | "enhanced_vision"): string {
  return `Analyze the uploaded reference image for an image-to-image prompt generator.

User text goal:
${userIdea || "The user wants a prompt that recreates the reference image's visual effect."}

Known deterministic local metadata:
${summarizeLocalAnalysis(local)}

Channel:
${channel}

Return a compact but precise visual analysis. Cover:
- main subject and likely scene
- composition and camera/lens language
- style/medium and realism level
- color palette, lighting, mood, texture/materials
- visible text/OCR if any, with uncertainty when text is unclear
- details that an image prompt must preserve
- negative constraints to prevent drift, fake hands/faces, unreadable text, wrong proportions, weak commercial finish

Do not invent details you cannot see. Mark uncertainty explicitly.`;
}

async function withVisionTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), VISION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resolveOpenAICompatibleBase(provider: string, userKeys: Record<string, string>): { apiKey: string; baseURL?: string } {
  if (provider === "custom" || provider === "aihubmix") {
    const raw = userKeys.CUSTOM_BASE_URL?.trim() || process.env.CUSTOM_BASE_URL?.trim() || (provider === "aihubmix" ? "https://aihubmix.com/v1" : "");
    if (!raw) throw new Error("Missing relay Base URL");
    let baseURL = validatePublicHttpUrl(raw);
    if (!baseURL.endsWith("/v1")) baseURL += "/v1";
    return {
      apiKey: resolveKey("custom", userKeys) || resolveKey("aihubmix", userKeys),
      baseURL,
    };
  }
  if (provider === "qwen") {
    return {
      apiKey: resolveKey("qwen", userKeys),
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    };
  }
  return { apiKey: resolveKey("openai", userKeys) };
}

export async function analyzeImageWithVisionModel(args: {
  model: ModelInfo;
  channel: "original_api_vision" | "enhanced_vision";
  userIdea: string;
  local: LocalImageAnalysis;
  base64: string;
  mimeType: string;
  userKeys: Record<string, string>;
  availableModelIds?: string[];
}): Promise<VisionAnalysisResult> {
  const provider = resolveVisionProvider(args.model, args.userKeys, args.availableModelIds);
  const prompt = buildVisionAnalysisPrompt(args.local, args.userIdea, args.channel);
  const dataUrl = `data:${args.mimeType};base64,${args.base64}`;

  try {
    let text = "";
    if (provider === "openai" || provider === "custom" || provider === "aihubmix" || provider === "qwen") {
      const clientConfig = resolveOpenAICompatibleBase(provider, args.userKeys);
      const client = new OpenAI({ ...clientConfig, timeout: VISION_TIMEOUT_MS });
      const response = await withVisionTimeout(
        client.chat.completions.create({
          model: args.model.id,
          max_tokens: 1400,
          temperature: 0.2,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
        `${args.model.name} vision analysis`,
      );
      text = response.choices[0]?.message?.content ?? "";
    } else if (provider === "google") {
      const genAI = new GoogleGenerativeAI(resolveKey("google", args.userKeys));
      const model = genAI.getGenerativeModel({
        model: args.model.id,
        generationConfig: { maxOutputTokens: 1400, temperature: 0.2 },
      });
      const response = await withVisionTimeout(
        model.generateContent([
          { text: prompt },
          { inlineData: { mimeType: args.mimeType, data: args.base64 } },
        ]),
        `${args.model.name} vision analysis`,
      );
      text = response.response.text();
    } else if (provider === "anthropic") {
      const client = new Anthropic({ apiKey: resolveKey("anthropic", args.userKeys), timeout: VISION_TIMEOUT_MS });
      const response = await withVisionTimeout(
        client.messages.create({
          model: args.model.id,
          max_tokens: 1400,
          temperature: 0.2,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: args.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: args.base64 },
                },
                { type: "text", text: prompt },
              ],
            },
          ],
        }),
        `${args.model.name} vision analysis`,
      );
      text = response.content
        .filter((item): item is Extract<typeof item, { type: "text" }> => item.type === "text")
        .map((item) => item.text)
        .join("\n");
    } else {
      throw new Error(`Provider ${provider} does not support reference image analysis yet`);
    }

    return {
      source: args.channel,
      modelId: args.model.id,
      modelName: args.model.name,
      provider,
      summary: text.trim() || summarizeLocalAnalysis(args.local),
      local: args.local,
      available: true,
    };
  } catch (error: any) {
    return {
      source: args.channel,
      modelId: args.model.id,
      modelName: args.model.name,
      provider,
      summary: summarizeLocalAnalysis(args.local),
      local: args.local,
      available: false,
      error: String(error?.message || error).slice(0, 500),
    };
  }
}

export function localVisionResult(local: LocalImageAnalysis, channel: "enhanced_vision" | "local_free" = "local_free"): VisionAnalysisResult {
  return {
    source: channel,
    modelId: "local-free-sharp-analysis",
    modelName: "Free Local Image Analyzer",
    provider: "local",
    summary: summarizeLocalAnalysis(local),
    local,
    available: true,
  };
}

export function buildReferenceCandidatePrompt(args: {
  userIdea: string;
  targetModel: ModelInfo;
  language: "zh" | "en";
  analysis: VisionAnalysisResult;
  local: LocalImageAnalysis;
  attempt: number;
  channelLabel: string;
  previousFailures?: string[];
}): string {
  const outputLanguage = args.language === "zh" ? "Chinese" : "English";
  const retryNote = args.attempt > 1
    ? `\nPrevious internal quality gate failed. Strengthen visual specificity, reference similarity, negative constraints, and model parameters. Avoid these failures: ${(args.previousFailures ?? []).join("; ") || "generic or low-detail prompt"}.\n`
    : "";

  return `Create one production-ready image-to-image prompt from the uploaded reference image analysis.

User text goal:
${args.userIdea || "Make a new image with a very similar look, composition, color, lighting, and finish to the uploaded reference image."}

Target image model:
${args.targetModel.name} (${args.targetModel.provider})

Reference image deterministic metadata:
${summarizeLocalAnalysis(args.local)}

${args.channelLabel} analysis:
${args.analysis.summary}
${retryNote}

Hard requirements:
- User intent is first priority; the reference image supplies visual style, composition, color, lighting, mood, material, and quality targets.
- Preserve the reference effect without claiming exact identity if identity is uncertain.
- Include positive prompt, negative prompt, and recommended parameters.
- Recommended parameters must include aspect ratio ${args.local.aspectRatioLabel}, reference/image weight guidance, style strength, CFG/steps or equivalent when useful, and seed guidance when useful.
- Negative prompt must directly guard against bad hands, distorted faces, unreadable text, wrong object proportions, low-res artifacts, identity drift, composition drift, over-smoothing, and generic stock-photo look.
- If visible text is uncertain, say to preserve only clearly visible text and avoid inventing unknown text.
- Do not expose internal scoring, model errors, or retry details.

Output only the final optimized prompt in ${outputLanguage}, with these sections:
1. 正向提示词 / Positive Prompt
2. 负向提示词 / Negative Prompt
3. 推荐参数 / Recommended Parameters`;
}

export function buildQualityFallbackPrompt(args: {
  userIdea: string;
  targetModel: ModelInfo;
  language: "zh" | "en";
  local: LocalImageAnalysis;
  analyses: VisionAnalysisResult[];
}): string {
  const zh = args.language === "zh";
  const visual = args.analyses
    .map((analysis) => analysis.summary)
    .filter(Boolean)
    .slice(0, 2)
    .join("\n\n");
  if (zh) {
    return `正向提示词 / Positive Prompt
基于上传参考图进行图生图创作，优先满足用户目标：${args.userIdea || "生成与参考图效果高度相似的新图片"}。参考图为 ${args.local.width}x${args.local.height} ${args.local.orientation} 构图，画幅接近 ${args.local.aspectRatioLabel}，整体色彩以 ${args.local.palette.join("、")} 为主，平均色 ${args.local.averageColor}，亮度 ${args.local.brightness}，对比度 ${args.local.contrast}，饱和度 ${args.local.saturation}。严格复刻参考图的主体层级、构图重心、镜头距离、光影方向、材质质感、色彩氛围、景深关系和商业完成度；在此基础上融入用户输入的新主题或变化。保持参考图的视觉秩序和比例关系，主体清晰，背景服务主体，边缘干净，细节真实，画面完整，适合 ${args.targetModel.name} 的图生图/参考图生成流程。

视觉分析摘要 / Reference Analysis
${visual || summarizeLocalAnalysis(args.local)}

负向提示词 / Negative Prompt
不要偏离参考图构图；不要错误比例、肢体畸形、坏手、歪脸、五官漂移、身份漂移、主体变形、文字乱码、虚构不可见文字、低清晰度、噪点、过度磨皮、塑料质感、AI伪影、过曝、欠曝、背景抢主体、廉价库存图感、风格混乱、画面裁切错误。

推荐参数 / Recommended Parameters
aspect ratio: ${args.local.aspectRatioLabel}; reference image weight: high / 0.75-0.9; style strength: medium-high / 0.55-0.75; CFG: 6-8; steps: 28-40; seed: 固定 seed 便于复现，满意后再小范围变化；优先使用图生图、参考图或编辑模式，并保留原图构图与色彩。`;
  }

  return `Positive Prompt
Create an image-to-image result based on the uploaded reference image, with the user's goal as the first priority: ${args.userIdea || "create a new image with a highly similar visual effect to the reference"}. The reference image is ${args.local.width}x${args.local.height}, ${args.local.orientation}, approximately ${args.local.aspectRatioLabel}, with a dominant palette of ${args.local.palette.join(", ")}, average color ${args.local.averageColor}, ${args.local.brightness} brightness, ${args.local.contrast} contrast, and ${args.local.saturation} saturation. Preserve the reference image's subject hierarchy, composition center, camera distance, lighting direction, material texture, color mood, depth relationship, and polished commercial finish while applying the user's requested change. Keep proportions accurate, subject clear, background supportive, edges clean, details realistic, and the final prompt compatible with ${args.targetModel.name}.

Reference Analysis
${visual || summarizeLocalAnalysis(args.local)}

Negative Prompt
Do not drift away from the reference composition; avoid wrong proportions, distorted limbs, bad hands, warped faces, facial identity drift, subject deformation, unreadable text, invented unseen text, low resolution, noise, over-smoothing, plastic texture, AI artifacts, overexposure, underexposure, distracting background, cheap stock-photo look, mixed styles, and incorrect cropping.

Recommended Parameters
aspect ratio: ${args.local.aspectRatioLabel}; reference image weight: high / 0.75-0.9; style strength: medium-high / 0.55-0.75; CFG: 6-8; steps: 28-40; seed: lock the seed for reproducibility, then vary slightly after approval; prefer image-to-image, reference-image, or editing mode and preserve the source composition and palette.`;
}

export function scoreReferencePromptCandidate(candidate: ReferencePromptCandidate, userIdea: string, local: LocalImageAnalysis): ReferencePromptScore {
  const prompt = candidate.prompt.toLowerCase();
  const hasReference = /(reference|参考图|uploaded|原图|image-to-image|图生图|以图生图)/i.test(candidate.prompt);
  const hasPositive = /(positive|正向|prompt)/i.test(candidate.prompt);
  const hasNegative = /(negative|负向|avoid|不要|避免|bad hands|坏手|distorted|畸形)/i.test(candidate.prompt);
  const hasParams = /(aspect|--ar|比例|参数|cfg|steps|seed|style strength|reference weight|参考图权重)/i.test(candidate.prompt);
  const hasVisual = /(composition|构图|lighting|光|palette|色|camera|镜头|material|材质|mood|氛围|texture|质感)/i.test(candidate.prompt);
  const hasQuality = /(commercial|photoreal|high quality|sharp|polished|商业|真实|清晰|完成度)/i.test(candidate.prompt);
  const hasAspect = candidate.prompt.includes(local.aspectRatioLabel) || /(aspect ratio|画幅|比例)/i.test(candidate.prompt);
  const hasIntent = userIdea
    ? userIdea.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((term) => term.length >= 2).slice(0, 18)
        .filter((term) => candidate.prompt.includes(term)).length
    : 1;
  const intentBase = userIdea ? Math.min(10, 5 + hasIntent * 0.75) : 8;
  const dimensions = {
    visual_similarity: Math.min(10, 3 + (hasReference ? 2 : 0) + (hasVisual ? 2 : 0) + (hasAspect ? 1.5 : 0) + (candidate.prompt.includes(local.averageColor) ? 1 : 0)),
    user_intent_alignment: Math.min(10, intentBase + (hasReference ? 0.8 : 0)),
    subject_accuracy: Math.min(10, 4 + (hasVisual ? 2 : 0) + (/(subject|主体|scene|场景|人物|物体)/i.test(candidate.prompt) ? 1.5 : 0)),
    style_lighting_color: Math.min(10, 3 + (/(style|风格|lighting|光|palette|色|mood|氛围)/i.test(candidate.prompt) ? 4 : 0) + (candidate.prompt.includes(local.palette[0] ?? "") ? 1 : 0)),
    model_fit: Math.min(10, 4 + (hasPositive ? 1.5 : 0) + (hasNegative ? 2 : 0) + (hasParams ? 2 : 0)),
    executable_clarity: Math.min(10, 3 + (hasPositive ? 2 : 0) + (hasNegative ? 2 : 0) + (hasParams ? 2 : 0) + (candidate.prompt.length > 500 ? 1 : 0)),
    artifact_control: Math.min(10, 3 + (/(bad hands|坏手|face|脸|artifact|伪影|distorted|畸形|unreadable|乱码|proportion|比例)/i.test(candidate.prompt) ? 5 : 0) + (hasNegative ? 1 : 0)),
    commercial_finish: Math.min(10, 4 + (hasQuality ? 3 : 0) + (/(polished|clean|sharp|premium|商业|高级|清晰)/i.test(candidate.prompt) ? 2 : 0)),
  };
  const weights: Record<keyof typeof dimensions, number> = {
    visual_similarity: 18,
    user_intent_alignment: 18,
    subject_accuracy: 11,
    style_lighting_color: 14,
    model_fit: 12,
    executable_clarity: 10,
    artifact_control: 12,
    commercial_finish: 5,
  };
  const total = Object.entries(dimensions).reduce((sum, [key, value]) => sum + (value / 10) * weights[key as keyof typeof weights], 0);
  const low = Object.entries(dimensions).filter(([, value]) => value < 7).map(([key]) => key);
  return {
    candidateId: candidate.id,
    total: Math.round(total * 100) / 100,
    dimensions,
    reason: low.length
      ? `Needs stronger ${low.join(", ")}`
      : "Reference image prompt is detailed, executable, and aligned.",
  };
}
