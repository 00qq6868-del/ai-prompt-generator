export type TranslationProjectRole =
  | "ecosystem"
  | "general_llm"
  | "specialized_mt_model"
  | "mt_framework"
  | "multimodal_translation"
  | "self_hosted_api"
  | "offline_library"
  | "inference_engine"
  | "training_framework";

export interface TranslationProjectEntry {
  id: string;
  repo: string;
  url: string;
  role: TranslationProjectRole;
  userProvidedStarsForks: string;
  verificationStatus: "user_provided_pending_live_check";
  bestUse: string;
  limitations: string;
  priority: "quality_primary" | "quality_secondary" | "deployment_backup" | "speed_engine" | "reference_only";
}

export const TRANSLATION_PROJECT_MATRIX: TranslationProjectEntry[] = [
  {
    id: "huggingface-transformers",
    repo: "huggingface/transformers",
    url: "https://github.com/huggingface/transformers",
    role: "ecosystem",
    userProvidedStarsForks: "约 160k stars / 33.1k forks，来自用户 2026-05-09 可见数据，需 GitHub API 实时确认",
    verificationStatus: "user_provided_pending_live_check",
    bestUse: "作为首选生态入口加载 Qwen、NLLB、Hunyuan-MT、Marian、Seamless 等翻译/多语言模型。",
    limitations: "它是框架和生态入口，不是单一翻译模型；真实质量取决于加载的模型。",
    priority: "quality_primary",
  },
  {
    id: "qwen3",
    repo: "QwenLM/Qwen3",
    url: "https://github.com/QwenLM/Qwen3",
    role: "general_llm",
    userProvidedStarsForks: "约 27.2k stars / 2k forks，来自用户 2026-05-09 可见数据，需 GitHub API 实时确认",
    verificationStatus: "user_provided_pending_live_check",
    bestUse: "用于中英长文、上下文翻译、提示词润色和把翻译改得更像自然人话。",
    limitations: "通用大模型，不是专门机器翻译模型；生产使用需按目标模型和成本再评估。",
    priority: "quality_primary",
  },
  {
    id: "tencent-hunyuan-hy-mt",
    repo: "Tencent-Hunyuan/HY-MT",
    url: "https://github.com/Tencent-Hunyuan/HY-MT",
    role: "specialized_mt_model",
    userProvidedStarsForks: "约 700 stars，来自用户 2026-05-09 可见数据，需 GitHub API 实时确认",
    verificationStatus: "user_provided_pending_live_check",
    bestUse: "作为商业级中英互译质量主力候选，优先关注 HY-MT1.5-7B、术语干预、上下文翻译和格式保持。",
    limitations: "Star 低不代表质量低；部署、显存、许可和模型入口需 README/文档确认。",
    priority: "quality_primary",
  },
  {
    id: "tencent-hunyuan-mt",
    repo: "Tencent-Hunyuan/Hunyuan-MT",
    url: "https://github.com/Tencent-Hunyuan/Hunyuan-MT",
    role: "specialized_mt_model",
    userProvidedStarsForks: "约 700 stars，来自用户 2026-05-09 可见数据，需 GitHub API 实时确认",
    verificationStatus: "user_provided_pending_live_check",
    bestUse: "作为 Hunyuan-MT 专项翻译能力来源，和 HY-MT、Qwen3 做候选翻译对比。",
    limitations: "用户提供的 WMT25 表现与 Star 数据需实时核验；不能把未核验数据写成确定事实。",
    priority: "quality_primary",
  },
  {
    id: "facebookresearch-fairseq",
    repo: "facebookresearch/fairseq",
    url: "https://github.com/facebookresearch/fairseq",
    role: "mt_framework",
    userProvidedStarsForks: "约 32.2k stars / 6.7k forks，来自用户 2026-05-09 可见数据，需 GitHub API 实时确认",
    verificationStatus: "user_provided_pending_live_check",
    bestUse: "作为 Meta 老牌序列到序列/机器翻译框架和 NLLB 相关方法参考。",
    limitations: "更适合作为方法和旧方案参考；新项目运行主力需确认维护状态。",
    priority: "reference_only",
  },
  {
    id: "facebookresearch-seamless-communication",
    repo: "facebookresearch/seamless_communication",
    url: "https://github.com/facebookresearch/seamless_communication",
    role: "multimodal_translation",
    userProvidedStarsForks: "约 11.8k stars / 1.2k forks；用户称 2026-03-20 已归档只读，需 GitHub API 实时确认",
    verificationStatus: "user_provided_pending_live_check",
    bestUse: "用于语音、字幕、多模态翻译的参考或备用，不作为纯文本中英提示词翻译第一主力。",
    limitations: "若仓库已归档，只适合参考或跑旧方案；维护状态必须实时验证。",
    priority: "reference_only",
  },
  {
    id: "libretranslate",
    repo: "LibreTranslate/LibreTranslate",
    url: "https://github.com/LibreTranslate/LibreTranslate",
    role: "self_hosted_api",
    userProvidedStarsForks: "约 14.3k stars / 1.5k forks，来自用户 2026-05-09 可见数据，需 GitHub API 实时确认",
    verificationStatus: "user_provided_pending_live_check",
    bestUse: "作为私有化、自建翻译 API 和低成本部署备用通道。",
    limitations: "部署方便，但质量通常不应默认高于 Hunyuan-MT、Qwen3 或强 NLLB 方案。",
    priority: "deployment_backup",
  },
  {
    id: "argos-translate",
    repo: "argosopentech/argos-translate",
    url: "https://github.com/argosopentech/argos-translate",
    role: "offline_library",
    userProvidedStarsForks: "约 6k stars / 448 forks，来自用户 2026-05-09 可见数据，需 GitHub API 实时确认",
    verificationStatus: "user_provided_pending_live_check",
    bestUse: "作为离线轻量级中英翻译备用，适合无外部 API 或小机器兜底。",
    limitations: "部署简单但不应承诺接近商业 API/人工润色水准。",
    priority: "deployment_backup",
  },
  {
    id: "ctranslate2",
    repo: "OpenNMT/CTranslate2",
    url: "https://github.com/OpenNMT/CTranslate2",
    role: "inference_engine",
    userProvidedStarsForks: "约 4.5k stars / 481 forks，来自用户 2026-05-09 可见数据，需 GitHub API 实时确认",
    verificationStatus: "user_provided_pending_live_check",
    bestUse: "作为高性能生产推理引擎，配合 NLLB、OPUS、Marian、Hunyuan 转换模型提升速度。",
    limitations: "它不是翻译模型本身，必须搭配具体模型和转换链路。",
    priority: "speed_engine",
  },
  {
    id: "opennmt-py",
    repo: "OpenNMT/OpenNMT-py",
    url: "https://github.com/OpenNMT/OpenNMT-py",
    role: "training_framework",
    userProvidedStarsForks: "约 7k stars / 2.3k forks；用户称 README 表示不再积极维护并转向 Eole，需 GitHub API 实时确认",
    verificationStatus: "user_provided_pending_live_check",
    bestUse: "用于训练/微调机器翻译模型的方法参考，不作为提示词网站运行主路径。",
    limitations: "维护状态需核验；生产优先级低于质量主力和部署备用通道。",
    priority: "reference_only",
  },
];

export const TRANSLATION_PAIRWISE_RUBRIC = [
  "intent_preservation: translated prompt must keep every user detail and constraint.",
  "target_model_language_fit: foreign flagship models prefer English; China-native models prefer Chinese.",
  "terminology_control: preserve model names, API names, CLI flags, parameters, JSON keys, and product nouns.",
  "naturalness: choose the version that sounds like a strong native prompt, not literal machine translation.",
  "format_preservation: keep Markdown/XML/JSON sections stable and copy-pasteable.",
  "hallucination_control: never add facts, brands, people, statistics, links, or visual details not in the source.",
  "stability: if quality is close, prefer the more stable deployment channel over a higher-risk experimental path.",
];

export function buildTranslationStrategyMemory(): string {
  const qualityPrimary = TRANSLATION_PROJECT_MATRIX
    .filter((item) => item.priority === "quality_primary")
    .map((item) => item.repo)
    .join(", ");
  const backup = TRANSLATION_PROJECT_MATRIX
    .filter((item) => item.priority === "deployment_backup" || item.priority === "speed_engine")
    .map((item) => item.repo)
    .join(", ");

  return [
    "Translation strategy for prompt authoring:",
    "- True AI prompts must be authored in the target model's strongest language; Chinese explanations are user-facing only.",
    `- Quality-first channels to consider: ${qualityPrimary}.`,
    `- Deployment/speed fallback channels: ${backup}.`,
    "- Pairwise translation judging rubric:",
    ...TRANSLATION_PAIRWISE_RUBRIC.map((rule, index) => `  ${index + 1}. ${rule}`),
    "- GitHub project star counts in this memory are user-provided snapshots and must be rechecked with GitHub API before being presented as current facts.",
  ].join("\n");
}
