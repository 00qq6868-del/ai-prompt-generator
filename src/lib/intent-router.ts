export type IntentModality = "text" | "code" | "image" | "video" | "audio" | "multimodal" | "unknown";

export type IntentDomain =
  | "programming"
  | "image_generation"
  | "video_generation"
  | "audio_generation"
  | "writing_analysis"
  | "business"
  | "security"
  | "legal"
  | "medical"
  | "unknown";

export type ClarificationStatus = "ready" | "needs_clarification" | "suggest_correction";

export interface IntentConflict {
  type: "keyword" | "domain" | "task_type" | "modality";
  severity: "low" | "medium" | "high";
  message: string;
  options: string[];
  evidence: string[];
}

export interface IntentAnalysis {
  status: ClarificationStatus;
  confidence: number;
  normalizedInput: string;
  suggestedInput?: string;
  clarificationQuestion?: string;
  conflicts: IntentConflict[];
  modality: IntentModality;
  domain: IntentDomain;
  taskType: string;
  tags: string[];
  feedbackMemoryHints: string[];
}

interface DomainRule {
  id: IntentDomain;
  modality: IntentModality;
  label: string;
  keywords: string[];
  taskTypes: string[];
  correctionHints?: Array<{ from: string; to: string; reason: string }>;
}

const DOMAIN_RULES: DomainRule[] = [
  {
    id: "programming",
    modality: "code",
    label: "编程与代码",
    keywords: [
      "代码",
      "编程",
      "前端",
      "后端",
      "网页",
      "网站",
      "app",
      "api",
      "数据库",
      "脚本",
      "测试",
      "bug",
      "修复",
      "性能",
      "架构",
      "react",
      "next",
      "typescript",
      "python",
      "java",
      "android",
      "ios",
      "devops",
      "docker",
      "kubernetes",
    ],
    taskTypes: ["code_generation", "code_review", "debugging", "architecture", "testing", "devops"],
  },
  {
    id: "image_generation",
    modality: "image",
    label: "图片生成",
    keywords: [
      "图片",
      "图像",
      "生图",
      "以图生图",
      "图生图",
      "海报",
      "人像",
      "动漫",
      "风景",
      "商业图",
      "商品图",
      "logo",
      "摄影",
      "构图",
      "镜头",
      "光影",
      "材质",
      "gpt image",
      "gpt-image",
      "midjourney",
      "stable diffusion",
      "flux",
      "comfyui",
    ],
    taskTypes: ["text_to_image", "image_to_image", "visual_prompt", "negative_prompt"],
  },
  {
    id: "video_generation",
    modality: "video",
    label: "视频生成",
    keywords: ["视频", "短剧", "电影", "分镜", "镜头语言", "角色动作", "场景调度", "预告片", "sora", "veo", "runway", "pika"],
    taskTypes: ["storyboard", "video_prompt", "shot_plan"],
  },
  {
    id: "audio_generation",
    modality: "audio",
    label: "音频生成",
    keywords: ["音频", "音乐", "配音", "人声", "旁白", "音效", "播客", "有声书", "bpm", "乐器", "混音", "suno", "udio", "tts"],
    taskTypes: ["music_prompt", "voice_prompt", "sound_design"],
  },
  {
    id: "security",
    modality: "text",
    label: "安全防御",
    keywords: ["安全", "漏洞", "红队", "蓝队", "渗透", "加固", "审计", "权限", "隐私", "license", "许可证", "攻击面", "防御"],
    taskTypes: ["security_assessment", "defensive_red_team", "hardening"],
  },
  {
    id: "legal",
    modality: "text",
    label: "法律合规",
    keywords: ["法律", "合同", "诉讼", "法规", "合规", "隐私政策", "条款", "jurisdiction"],
    taskTypes: ["legal_analysis", "compliance_review"],
  },
  {
    id: "medical",
    modality: "text",
    label: "医疗健康",
    keywords: ["医疗", "健康", "诊断", "症状", "药物", "治疗", "医生", "医院", "病人"],
    taskTypes: ["medical_information", "health_triage"],
  },
  {
    id: "business",
    modality: "text",
    label: "商业产品",
    keywords: ["商业", "产品", "运营", "营销", "增长", "竞品", "用户体验", "ux", "prd", "路线图", "指标"],
    taskTypes: ["product_strategy", "marketing", "business_analysis"],
  },
  {
    id: "writing_analysis",
    modality: "text",
    label: "文本/推理/写作/分析",
    keywords: ["文章", "文案", "翻译", "总结", "研究", "教育", "学术", "分析", "报告", "角色扮演", "对话", "策略"],
    taskTypes: ["writing", "analysis", "translation", "summary", "research"],
  },
];

const KEYWORD_CONFLICT_GROUPS = [
  {
    id: "vehicle_vs_phone",
    labels: ["汽车", "手机"],
    sides: [
      { label: "汽车", keywords: ["汽车", "车", "轿车", "suv", "新能源车", "电动车", "车辆", "车机", "方向盘", "轮胎"] },
      { label: "手机", keywords: ["手机", "iphone", "安卓手机", "屏幕", "摄像头", "充电器", "移动电话"] },
    ],
  },
  {
    id: "image_vs_video",
    labels: ["图片", "视频"],
    sides: [
      { label: "图片", keywords: ["图片", "海报", "照片", "静态图", "生图", "图像"] },
      { label: "视频", keywords: ["视频", "分镜", "镜头运动", "时长", "转场", "短剧"] },
    ],
  },
  {
    id: "web_vs_mobile",
    labels: ["网页端", "手机端"],
    sides: [
      { label: "网页端", keywords: ["网页端", "web", "网站", "浏览器", "pc端"] },
      { label: "手机端", keywords: ["手机端", "移动端", "安卓", "ios", "小程序", "app"] },
    ],
  },
];

function normalizeText(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function countMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((sum, keyword) => sum + (lower.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

function classifyDomain(text: string): { domain: IntentDomain; modality: IntentModality; taskType: string; scores: Array<{ rule: DomainRule; score: number }> } {
  const scores = DOMAIN_RULES
    .map((rule) => ({ rule, score: countMatches(text, rule.keywords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = scores[0]?.rule;
  if (!top) {
    return { domain: "unknown", modality: "unknown", taskType: "general_prompt", scores };
  }

  const taskType =
    top.taskTypes.find((type) => {
      if (type.includes("image") && /以图生图|图生图|参考图/.test(text)) return true;
      if (type.includes("review") && /审查|review|检查/.test(text)) return true;
      if (type.includes("debug") && /bug|报错|修复|失败/.test(text)) return true;
      return false;
    }) ?? top.taskTypes[0] ?? "general_prompt";

  return { domain: top.id, modality: top.modality, taskType, scores };
}

function detectConflicts(text: string, scores: Array<{ rule: DomainRule; score: number }>): IntentConflict[] {
  const conflicts: IntentConflict[] = [];

  for (const group of KEYWORD_CONFLICT_GROUPS) {
    const lower = text.toLowerCase();
    const isAllowedCombination =
      group.id === "vehicle_vs_phone" &&
      /(车机.*手机|手机.*车机|车载.*手机|手机支架|carplay|android auto|联名|对比|结合|同时|连接手机|手机连接)/i.test(lower);
    if (isAllowedCombination) continue;
    const sideHits = group.sides
      .map((side) => ({
        label: side.label,
        hits: side.keywords.filter((keyword) => text.toLowerCase().includes(keyword.toLowerCase())),
      }))
      .filter((side) => side.hits.length > 0);

    if (sideHits.length >= 2) {
      conflicts.push({
        type: group.id === "image_vs_video" ? "modality" : "keyword",
        severity: "high",
        message: `输入同时出现「${group.labels.join("」和「")}」，系统无法可靠判断主目标。`,
        options: group.labels,
        evidence: sideHits.flatMap((side) => side.hits.map((hit) => `${side.label}:${hit}`)),
      });
    }
  }

  const top = scores[0];
  const second = scores[1];
  if (top && second && top.score === second.score && top.rule.modality !== second.rule.modality) {
    conflicts.push({
      type: "domain",
      severity: "medium",
      message: `输入同时接近「${top.rule.label}」和「${second.rule.label}」，需要确认主要输出方向。`,
      options: [top.rule.label, second.rule.label],
      evidence: [`${top.rule.id}:${top.score}`, `${second.rule.id}:${second.score}`],
    });
  }

  return conflicts;
}

function detectLikelyCorrection(text: string, domain: IntentDomain): { suggestedInput: string; reason: string } | null {
  if (domain !== "image_generation" && domain !== "programming" && domain !== "business") return null;

  const hasVehicleContext = /汽车|车辆|车载|车机|驾驶|轮胎|方向盘|新能源|轿车|suv/.test(text);
  const hasPhoneWord = /手机/.test(text);
  const hasAutomotivePromptContext = /海报|产品图|宣传图|外观|内饰|驾驶|车身|车灯|品牌车型/.test(text);
  if (hasVehicleContext && hasPhoneWord && hasAutomotivePromptContext) {
    return {
      suggestedInput: text.replace(/手机/g, "汽车"),
      reason: "上下文多次指向汽车产品、车身或驾驶场景，手机更像误输入。",
    };
  }

  return null;
}

function buildClarificationQuestion(conflicts: IntentConflict[], language: "zh" | "en"): string {
  const primary = conflicts[0];
  if (!primary) return "";
  if (language === "en") {
    return `I found a possible intent conflict: ${primary.options.join(" vs ")}. Which direction should I optimize for?`;
  }
  return `我检测到可能的意图冲突：${primary.options.map((item) => `「${item}」`).join("还是")}？请确认主要优化哪一个方向。`;
}

export function analyzeUserIntent(input: string, language: "zh" | "en" = "zh"): IntentAnalysis {
  const normalizedInput = normalizeText(input);
  const classified = classifyDomain(normalizedInput);
  const conflicts = detectConflicts(normalizedInput, classified.scores);
  const correction = detectLikelyCorrection(normalizedInput, classified.domain);
  const confidence = Math.max(
    0.2,
    Math.min(0.98, (classified.scores[0]?.score ?? 0) / Math.max(1, (classified.scores[0]?.score ?? 0) + (classified.scores[1]?.score ?? 0) + conflicts.length)),
  );

  const tags = [
    classified.domain,
    classified.modality,
    classified.taskType,
    ...classified.scores.slice(0, 3).map((item) => item.rule.label),
  ].filter((item, index, array) => item && array.indexOf(item) === index);

  const feedbackMemoryHints = [
    `intent_domain=${classified.domain}`,
    `intent_modality=${classified.modality}`,
    `task_type=${classified.taskType}`,
    conflicts.length ? `intent_conflicts=${conflicts.map((item) => item.options.join("_vs_")).join(",")}` : "",
    correction ? `suggested_correction=${correction.reason}` : "",
  ].filter(Boolean);

  if (conflicts.some((item) => item.severity === "high") && !correction) {
    return {
      status: "needs_clarification",
      confidence,
      normalizedInput,
      clarificationQuestion: buildClarificationQuestion(conflicts, language),
      conflicts,
      modality: classified.modality,
      domain: classified.domain,
      taskType: classified.taskType,
      tags,
      feedbackMemoryHints,
    };
  }

  if (correction && confidence >= 0.45) {
    return {
      status: "suggest_correction",
      confidence: Math.max(confidence, 0.72),
      normalizedInput,
      suggestedInput: correction.suggestedInput,
      clarificationQuestion: language === "en"
        ? `This looks like a typo. Should I use this corrected version: ${correction.suggestedInput}`
        : `这可能是输入错误：${correction.reason} 是否改为「${correction.suggestedInput}」继续？`,
      conflicts,
      modality: classified.modality,
      domain: classified.domain,
      taskType: classified.taskType,
      tags,
      feedbackMemoryHints,
    };
  }

  return {
    status: "ready",
    confidence,
    normalizedInput,
    conflicts,
    modality: classified.modality,
    domain: classified.domain,
    taskType: classified.taskType,
    tags,
    feedbackMemoryHints,
  };
}

export function applyClarificationChoice(input: string, choice: string): string {
  const cleanChoice = normalizeText(choice);
  if (!cleanChoice) return input;
  return [
    input.trim(),
    "",
    `用户已澄清主要方向：${cleanChoice}`,
    "请以澄清后的方向为最高优先级，其他冲突词只作为背景，不要误判主目标。",
  ].join("\n");
}
