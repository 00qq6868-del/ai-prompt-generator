# GitHub Project Tracker Status

Updated: 2026-09-19T15:52:10.485Z

All user-provided repositories are retained. Stars/forks/activity are only filled when verified by GitHub API.

## hallucination

| Repo | Stars | Forks | Quality | Verified | Focus |
|---|---:|---:|---:|---|---|
| [confident-ai/deepeval](https://github.com/confident-ai/deepeval) | 18335 | 1953 | 89.7 | verified | LLM evaluation metrics and hallucination scoring. |
| [Arize-ai/phoenix](https://github.com/Arize-ai/phoenix) | 11540 | 1139 | 87.6 | verified | LLM observability, traces, evals, dataset debugging. |
| [truera/trulens](https://github.com/truera/trulens) | 3563 | 345 | 82.5 | verified | Feedback functions and groundedness checks. |
| [uptrain-ai/uptrain](https://github.com/uptrain-ai/uptrain) | 2365 | 205 | 60.6 | verified | LLM evaluation checks and experiment tracking. |
| [stanford-oval/WikiChat](https://github.com/stanford-oval/WikiChat) | 1618 | 147 | 69 | verified | Grounded conversational QA ideas. |
| [cvs-health/uqlm](https://github.com/cvs-health/uqlm) | 1200 | 132 | 77.9 | verified | Uncertainty quantification for LLM outputs. |
| [potsawee/selfcheckgpt](https://github.com/potsawee/selfcheckgpt) | 631 | 73 | 55.2 | verified | Sampling-based self-consistency hallucination checks. |
| [KRLabsOrg/LettuceDetect](https://github.com/KRLabsOrg/LettuceDetect) | 611 | 58 | 74.8 | verified | Hallucination/factual inconsistency detection; verify README. |
| [DAMO-NLP-SG/VCD](https://github.com/DAMO-NLP-SG/VCD) | 421 | 28 | 57.8 | verified | Vision-language hallucination mitigation/detection; verify README. |

Top 3 by verified stars: confident-ai/deepeval, Arize-ai/phoenix, truera/trulens

## prompt_optimization

| Repo | Stars | Forks | Quality | Verified | Focus |
|---|---:|---:|---:|---|---|
| [x1xhlol/system-prompts-and-models-of-ai-tools](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools) | 143717 | 34812 | 93.6 | verified | Prompt corpus for defensive pattern analysis. |
| [dair-ai/Prompt-Engineering-Guide](https://github.com/dair-ai/Prompt-Engineering-Guide) | 78463 | 8626 | 86.1 | verified | Prompt engineering methods and examples. |
| [elder-plinius/CL4R1T4S](https://github.com/elder-plinius/CL4R1T4S) | 50047 | 10275 | 94.9 | verified | Adversarial corpus for defensive evaluation only. |
| [danielmiessler/Fabric](https://github.com/danielmiessler/Fabric) | 44003 | 4269 | 93.4 | verified | Reusable task prompt workflow templates. |
| [linshenkx/prompt-optimizer](https://github.com/linshenkx/prompt-optimizer) | 35098 | 4094 | 92.7 | verified | Prompt optimizer product patterns. |
| [JushBJJ/Mr.-Ranedeer-AI-Tutor](https://github.com/JushBJJ/Mr.-Ranedeer-AI-Tutor) | 29580 | 3272 | 81.8 | verified | Adaptive tutor prompt patterns. |
| [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) | 25285 | 2342 | 90.9 | verified | Prompt testing, eval CI, regression gates. |
| [elder-plinius/L1B3RT4S](https://github.com/elder-plinius/L1B3RT4S) | 21506 | 2639 | 80.6 | verified | Adversarial corpus for safety regression tests only. |
| [liyupi/ai-guide](https://github.com/liyupi/ai-guide) | 20206 | 2252 | 90.2 | verified | Chinese AI prompt/product guide material. |
| [Nagi-ovo/voyager](https://github.com/Nagi-ovo/voyager) | 20106 | 665 | 88.6 | verified | Gemini workflow and prompt adaptation ideas. |

Top 3 by verified stars: x1xhlol/system-prompts-and-models-of-ai-tools, dair-ai/Prompt-Engineering-Guide, elder-plinius/CL4R1T4S

## gpt_image_2

| Repo | Stars | Forks | Quality | Verified | Focus |
|---|---:|---:|---:|---|---|
| [EvoLinkAI/awesome-gpt-image-2-API-and-Prompts](https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts) | 17213 | 1733 | 84.4 | verified | GPT Image 2 API and prompt examples. |
| [YouMind-OpenLab/awesome-gpt-image-2](https://github.com/YouMind-OpenLab/awesome-gpt-image-2) | 9916 | 880 | 86.8 | verified | Awesome list for GPT Image 2 resources. |
| [wuyoscar/GPT-Image2-Skill](https://github.com/wuyoscar/GPT-Image2-Skill) | 5462 | 464 | 84.2 | verified | GPT Image 2 skill/prompt patterns. |
| [Anil-matcha/Awesome-GPT-Image-2-API-Prompts](https://github.com/Anil-matcha/Awesome-GPT-Image-2-API-Prompts) | 21 | 4 | 61.5 | verified | GPT Image 2 prompt examples and API notes. |

Top 3 by verified stars: EvoLinkAI/awesome-gpt-image-2-API-and-Prompts, YouMind-OpenLab/awesome-gpt-image-2, wuyoscar/GPT-Image2-Skill

## Extracted Rules

- 人工反馈优先级高于 AI 评价；人工指出的问题必须进入下一轮自动优化。
- 事实型任务不得编造来源、stars、commit、release；无法实时确认时标记待验证。
- 候选提示词必须通过意图保真、幻觉防护、目标模型适配、可执行性评分后才能展示。
- 黄色问题优先修复；绿色但低于 9.0 的幻觉和用户意图问题继续优化。
- GPT Image 2/以图生图必须保留参考图构图、色彩、比例、主体、风格和商业完成度。
