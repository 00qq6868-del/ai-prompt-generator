# GitHub Project Tracker Status

Updated: 2026-06-10T20:44:36.323Z

All user-provided repositories are retained. Stars/forks/activity are only filled when verified by GitHub API.

## hallucination

| Repo | Stars | Forks | Quality | Verified | Focus |
|---|---:|---:|---:|---|---|
| [confident-ai/deepeval](https://github.com/confident-ai/deepeval) | 16084 | 1520 | 89 | verified | LLM evaluation metrics and hallucination scoring. |
| [Arize-ai/phoenix](https://github.com/Arize-ai/phoenix) | 10088 | 914 | 86.9 | verified | LLM observability, traces, evals, dataset debugging. |
| [truera/trulens](https://github.com/truera/trulens) | 3369 | 291 | 82.1 | verified | Feedback functions and groundedness checks. |
| [uptrain-ai/uptrain](https://github.com/uptrain-ai/uptrain) | 2351 | 202 | 65.5 | verified | LLM evaluation checks and experiment tracking. |
| [stanford-oval/WikiChat](https://github.com/stanford-oval/WikiChat) | 1599 | 143 | 73.9 | verified | Grounded conversational QA ideas. |
| [cvs-health/uqlm](https://github.com/cvs-health/uqlm) | 1165 | 126 | 77.8 | verified | Uncertainty quantification for LLM outputs. |
| [potsawee/selfcheckgpt](https://github.com/potsawee/selfcheckgpt) | 619 | 70 | 60.1 | verified | Sampling-based self-consistency hallucination checks. |
| [KRLabsOrg/LettuceDetect](https://github.com/KRLabsOrg/LettuceDetect) | 578 | 39 | 74.1 | verified | Hallucination/factual inconsistency detection; verify README. |
| [DAMO-NLP-SG/VCD](https://github.com/DAMO-NLP-SG/VCD) | 406 | 25 | 57.5 | verified | Vision-language hallucination mitigation/detection; verify README. |

Top 3 by verified stars: confident-ai/deepeval, Arize-ai/phoenix, truera/trulens

## prompt_optimization

| Repo | Stars | Forks | Quality | Verified | Focus |
|---|---:|---:|---:|---|---|
| [x1xhlol/system-prompts-and-models-of-ai-tools](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools) | 139478 | 34586 | 98.6 | verified | Prompt corpus for defensive pattern analysis. |
| [dair-ai/Prompt-Engineering-Guide](https://github.com/dair-ai/Prompt-Engineering-Guide) | 75504 | 8204 | 90.9 | verified | Prompt engineering methods and examples. |
| [danielmiessler/Fabric](https://github.com/danielmiessler/Fabric) | 42256 | 4174 | 93.2 | verified | Reusable task prompt workflow templates. |
| [linshenkx/prompt-optimizer](https://github.com/linshenkx/prompt-optimizer) | 30699 | 3580 | 92.1 | verified | Prompt optimizer product patterns. |
| [JushBJJ/Mr.-Ranedeer-AI-Tutor](https://github.com/JushBJJ/Mr.-Ranedeer-AI-Tutor) | 29603 | 3304 | 81.9 | verified | Adaptive tutor prompt patterns. |
| [elder-plinius/CL4R1T4S](https://github.com/elder-plinius/CL4R1T4S) | 26935 | 4885 | 92.1 | verified | Adversarial corpus for defensive evaluation only. |
| [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) | 22086 | 1958 | 90.3 | verified | Prompt testing, eval CI, regression gates. |
| [elder-plinius/L1B3RT4S](https://github.com/elder-plinius/L1B3RT4S) | 19171 | 2323 | 85.1 | verified | Adversarial corpus for safety regression tests only. |
| [Nagi-ovo/gemini-voyager](https://github.com/Nagi-ovo/gemini-voyager) | 18683 | 591 | 88.2 | verified | Gemini workflow and prompt adaptation ideas. |
| [liyupi/ai-guide](https://github.com/liyupi/ai-guide) | 15514 | 1741 | 89.1 | verified | Chinese AI prompt/product guide material. |

Top 3 by verified stars: x1xhlol/system-prompts-and-models-of-ai-tools, dair-ai/Prompt-Engineering-Guide, danielmiessler/Fabric

## gpt_image_2

| Repo | Stars | Forks | Quality | Verified | Focus |
|---|---:|---:|---:|---|---|
| [EvoLinkAI/awesome-gpt-image-2-API-and-Prompts](https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts) | 16471 | 1673 | 89.2 | verified | GPT Image 2 API and prompt examples. |
| [YouMind-OpenLab/awesome-gpt-image-2](https://github.com/YouMind-OpenLab/awesome-gpt-image-2) | 7320 | 657 | 85.5 | verified | Awesome list for GPT Image 2 resources. |
| [wuyoscar/GPT-Image2-Skill](https://github.com/wuyoscar/GPT-Image2-Skill) | 2902 | 256 | 81.5 | verified | GPT Image 2 skill/prompt patterns. |
| [Anil-matcha/Awesome-GPT-Image-2-API-Prompts](https://github.com/Anil-matcha/Awesome-GPT-Image-2-API-Prompts) | 55 | 13 | 65.7 | verified | GPT Image 2 prompt examples and API notes. |

Top 3 by verified stars: EvoLinkAI/awesome-gpt-image-2-API-and-Prompts, YouMind-OpenLab/awesome-gpt-image-2, wuyoscar/GPT-Image2-Skill

## Extracted Rules

- 人工反馈优先级高于 AI 评价；人工指出的问题必须进入下一轮自动优化。
- 事实型任务不得编造来源、stars、commit、release；无法实时确认时标记待验证。
- 候选提示词必须通过意图保真、幻觉防护、目标模型适配、可执行性评分后才能展示。
- 黄色问题优先修复；绿色但低于 9.0 的幻觉和用户意图问题继续优化。
- GPT Image 2/以图生图必须保留参考图构图、色彩、比例、主体、风格和商业完成度。
