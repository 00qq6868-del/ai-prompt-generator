import type { Modality, PromptEngineInput, PromptEngineOutput } from "../domain/types.js";
import { buildDefensiveRedTeamPromptEngine } from "./defensive-redteam-engine.js";
import { buildGeneralPromptEngine } from "./general-engine.js";
import { buildImagePromptEngine } from "./image-engine.js";
import { buildReasoningCodePromptEngine } from "./reasoning-code-engine.js";

export function detectModality(input: PromptEngineInput): Modality {
  const text = `${input.userIdea} ${input.targetModelId}`.toLowerCase();
  if (/red team|红队|逆向|漏洞|注入|渗透|防御|security|vulnerability|reverse|exploit|payload|攻击|入侵|窃取|盗取|凭证|cookie|提权|钓鱼/.test(text)) return "defensive_redteam";
  if (/image|gpt-image|dall|midjourney|flux|imagen|stable diffusion|图像|图片|海报|插画|照片|logo/.test(text)) return "image";
  if (/code|refactor|debug|api|next\.js|typescript|python|架构|重构|代码|推理|证明|数学|bug/.test(text)) return "reasoning_code";
  return "general_text";
}

export function buildPromptEngine(input: PromptEngineInput): PromptEngineOutput {
  const modality = detectModality(input);
  if (modality === "image") return buildImagePromptEngine(input);
  if (modality === "reasoning_code") return buildReasoningCodePromptEngine(input);
  if (modality === "defensive_redteam") return buildDefensiveRedTeamPromptEngine(input);
  return buildGeneralPromptEngine(input);
}
