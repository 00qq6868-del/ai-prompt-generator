export interface ScoreDimension {
  id: string;
  label: string;
  labelZh: string;
  weight: number;
  core?: boolean;
}

export interface StrictScoreInput {
  dimensions: Record<string, number>;
  scoreType?: "prompt" | "image" | "combined";
}

export interface StrictScoreResult {
  total: number;
  pass: boolean;
  scoreType: "prompt" | "image" | "combined";
  dimensionScores: Record<string, number>;
  deductions: Array<{
    dimension: string;
    reason: string;
    score: number;
  }>;
}

export const PROMPT_SCORE_DIMENSIONS: ScoreDimension[] = [
  { id: "intent_fidelity", label: "Intent fidelity", labelZh: "意图保真", weight: 12, core: true },
  { id: "detail_coverage", label: "Detail coverage", labelZh: "细节覆盖率", weight: 12 },
  { id: "target_model_fit", label: "Target model fit", labelZh: "目标模型适配", weight: 10, core: true },
  { id: "structure_completeness", label: "Structure completeness", labelZh: "结构完整性", weight: 10 },
  { id: "specificity_control", label: "Specificity and control", labelZh: "特异性与可控性", weight: 10 },
  { id: "negative_constraints", label: "Negative constraints", labelZh: "负面约束质量", weight: 8 },
  { id: "output_format_clarity", label: "Output clarity", labelZh: "输出格式清晰度", weight: 8 },
  { id: "evaluation_readiness", label: "Evaluation readiness", labelZh: "可评测性", weight: 8 },
  { id: "hallucination_resistance", label: "Hallucination resistance", labelZh: "幻觉防护", weight: 8, core: true },
  { id: "generation_stability", label: "Generation stability", labelZh: "生成稳定性", weight: 7 },
  { id: "reference_image_consistency", label: "Reference image consistency", labelZh: "参考图一致性", weight: 7, core: true },
];

export const IMAGE_SCORE_DIMENSIONS: ScoreDimension[] = [
  { id: "composition", label: "Composition", labelZh: "构图", weight: 10 },
  { id: "color_accuracy", label: "Color accuracy", labelZh: "色彩准确性", weight: 8 },
  { id: "texture_detail", label: "Texture detail", labelZh: "纹理细节", weight: 10 },
  { id: "object_proportion", label: "Object proportion", labelZh: "物体/人体比例", weight: 12, core: true },
  { id: "lighting_consistency", label: "Lighting consistency", labelZh: "光影一致性", weight: 10 },
  { id: "reference_similarity", label: "Reference similarity", labelZh: "与真实照片相似度", weight: 15, core: true },
  { id: "text_rendering", label: "Text rendering", labelZh: "文字可读性", weight: 10, core: true },
  { id: "identity_preservation", label: "Identity preservation", labelZh: "五官/身份保留", weight: 10, core: true },
  { id: "artifact_control", label: "Artifact control", labelZh: "AI痕迹/畸形控制", weight: 10, core: true },
  { id: "commercial_finish", label: "Commercial finish", labelZh: "商业完成度", weight: 5 },
];

function clamp10(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(10, number));
}

export function strictWeightedScore(
  input: StrictScoreInput,
  dimensions: ScoreDimension[] = input.scoreType === "image" ? IMAGE_SCORE_DIMENSIONS : PROMPT_SCORE_DIMENSIONS,
): StrictScoreResult {
  const deductions: StrictScoreResult["deductions"] = [];
  const normalized: Record<string, number> = {};
  let total = 0;

  for (const dimension of dimensions) {
    const score = clamp10(input.dimensions[dimension.id]);
    normalized[dimension.id] = score;
    total += (score / 10) * dimension.weight;

    if (score < 3) {
      deductions.push({
        dimension: dimension.id,
        reason: "dimension_below_3_direct_fail",
        score,
      });
    }

    if (dimension.id === "text_rendering" && score < 6) {
      deductions.push({
        dimension: dimension.id,
        reason: "text_not_reliably_readable",
        score,
      });
    }

    if (dimension.id === "reference_similarity" && score < 5) {
      deductions.push({
        dimension: dimension.id,
        reason: "reference_identity_or_pose_drift",
        score,
      });
    }
  }

  const hasCoreFailure = deductions.some((deduction) =>
    dimensions.some((dimension) => dimension.id === deduction.dimension && dimension.core && deduction.score < 3),
  );

  return {
    total: Math.round(total * 100) / 100,
    pass: total >= 60 && !hasCoreFailure,
    scoreType: input.scoreType ?? "prompt",
    dimensionScores: normalized,
    deductions,
  };
}

export function estimatePromptDimensionScores(args: {
  userIdea: string;
  promptText: string;
  targetModelId: string;
  hasReferenceImage?: boolean;
}): Record<string, number> {
  const userIdea = args.userIdea.trim();
  const prompt = args.promptText.trim();
  const lowerPrompt = prompt.toLowerCase();
  const isImage = /image|gpt-image|画|图|照片|海报|插画|logo|参考图|reference/.test(`${args.targetModelId} ${userIdea} ${prompt}`.toLowerCase());
  const hasStructure = /(role|task|context|constraints|output|negative|steps|quality|评分|输出|约束|负面|检查|细节)/i.test(prompt);
  const hasNegative = /(negative|avoid|do not|不要|避免|禁止|no\s+)/i.test(prompt);
  const hasEvaluation = /(score|rubric|check|verify|评价|评分|检查|及格|扣分|可验证)/i.test(prompt);
  const hasReference = /(reference|image-to-image|参考图|原图|真实照片|身份|五官|相似)/i.test(prompt);
  const lengthScore = prompt.length < 180 ? 3 : prompt.length < 600 ? 6 : prompt.length < 3000 ? 8 : 7;
  const ideaTerms = userIdea
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 2)
    .slice(0, 24);
  const matchedTerms = ideaTerms.filter((term) => prompt.includes(term)).length;
  const intentScore = ideaTerms.length ? Math.min(10, 4 + (matchedTerms / ideaTerms.length) * 6) : Math.min(8, lengthScore);

  return {
    intent_fidelity: Math.round(intentScore * 10) / 10,
    detail_coverage: Math.min(10, lengthScore + (hasStructure ? 1 : 0) + (hasEvaluation ? 1 : 0)),
    target_model_fit: isImage
      ? Math.min(10, 4 + (/(gpt image|gpt-image|image model|图像模型|生图)/i.test(prompt) ? 2 : 0) + (hasReference ? 2 : 0) + (hasNegative ? 1 : 0))
      : Math.min(10, 5 + (hasStructure ? 2 : 0) + (hasEvaluation ? 1 : 0)),
    structure_completeness: Math.min(10, 4 + (hasStructure ? 3 : 0) + (/#+|\n-|^\d+\./m.test(prompt) ? 2 : 0)),
    specificity_control: Math.min(10, 3 + (/(must|exact|specific|具体|必须|精确|可控|参数|镜头|材质|比例)/i.test(prompt) ? 4 : 0) + (hasNegative ? 1 : 0)),
    negative_constraints: hasNegative ? Math.min(10, 5 + (/(artifact|deformed|blurry|畸形|模糊|错误|漂移|虚高|低质)/i.test(prompt) ? 3 : 0)) : 2,
    output_format_clarity: /(format|json|markdown|只输出|输出格式|final prompt|最终提示词)/i.test(prompt) ? 8 : hasStructure ? 6 : 3,
    evaluation_readiness: hasEvaluation ? 8 : 3,
    hallucination_resistance: /(不要编造|unknown|unspecified|do not invent|only use|不得虚构|边界|来源)/i.test(prompt) ? 8 : 4,
    generation_stability: Math.min(10, 4 + (hasNegative ? 2 : 0) + (hasEvaluation ? 1 : 0) + (prompt.length > 400 ? 1 : 0)),
    reference_image_consistency: args.hasReferenceImage || hasReference ? Math.min(10, 5 + (/(身份|五官|脸型|reference|similarity|相似|原图)/i.test(prompt) ? 3 : 0)) : isImage ? 3 : 6,
  };
}

export function strictPromptScore(args: {
  userIdea: string;
  promptText: string;
  targetModelId: string;
  hasReferenceImage?: boolean;
}): StrictScoreResult {
  return strictWeightedScore({
    scoreType: "prompt",
    dimensions: estimatePromptDimensionScores(args),
  }, PROMPT_SCORE_DIMENSIONS);
}

export const STRICT_SCORE_CALIBRATION_TEXT = [
  "不要因为画面漂亮就给高分。",
  "只要不符合用户需求、参考图、文字、比例、手部、五官、材质、构图，就必须扣分。",
  "90分以上只能给商业交付级别结果。",
  "60分是及格线，不是平均线。",
  "任一核心维度低于3分直接不合格。",
].join("\n");
