# GitHub Project Tracker Status

Updated: 2026-10-27T05:00:09.841Z

All user-provided repositories are retained. Stars/forks/activity are only filled when verified by GitHub API.

## hallucination

| Repo | Stars | Forks | Quality | Verified | Focus |
|---|---:|---:|---:|---|---|
| [confident-ai/deepeval](https://github.com/confident-ai/deepeval) | 19126 | 2138 | 90 | verified | LLM evaluation metrics and hallucination scoring. |
| [Arize-ai/phoenix](https://github.com/Arize-ai/phoenix) | 12018 | 1247 | 87.8 | verified | LLM observability, traces, evals, dataset debugging. |
| [truera/trulens](https://github.com/truera/trulens) | 3613 | 377 | 82.6 | verified | Feedback functions and groundedness checks. |
| [uptrain-ai/uptrain](https://github.com/uptrain-ai/uptrain) | 2368 | 206 | 60.6 | verified | LLM evaluation checks and experiment tracking. |
| [stanford-oval/WikiChat](https://github.com/stanford-oval/WikiChat) | 1622 | 147 | 69 | verified | Grounded conversational QA ideas. |
| [cvs-health/uqlm](https://github.com/cvs-health/uqlm) | 1214 | 140 | 78 | verified | Uncertainty quantification for LLM outputs. |
| [potsawee/selfcheckgpt](https://github.com/potsawee/selfcheckgpt) | 636 | 71 | 55.2 | verified | Sampling-based self-consistency hallucination checks. |
| [KRLabsOrg/LettuceDetect](https://github.com/KRLabsOrg/LettuceDetect) | 618 | 63 | 75 | verified | Hallucination/factual inconsistency detection; verify README. |
| [DAMO-NLP-SG/VCD](https://github.com/DAMO-NLP-SG/VCD) | 420 | 28 | 52.8 | verified | Vision-language hallucination mitigation/detection; verify README. |

Top 3 by verified stars: confident-ai/deepeval, Arize-ai/phoenix, truera/trulens

## prompt_optimization

| Repo | Stars | Forks | Quality | Verified | Focus |
|---|---:|---:|---:|---|---|
| [x1xhlol/system-prompts-and-models-of-ai-tools](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools) | 144283 | 34703 | 98.6 | verified | Prompt corpus for defensive pattern analysis. |
| [dair-ai/Prompt-Engineering-Guide](https://github.com/dair-ai/Prompt-Engineering-Guide) | 79568 | 8726 | 86.1 | verified | Prompt engineering methods and examples. |
| [elder-plinius/CL4R1T4S](https://github.com/elder-plinius/CL4R1T4S) | 51524 | 10531 | 90.1 | verified | Adversarial corpus for defensive evaluation only. |
| [danielmiessler/Fabric](https://github.com/danielmiessler/Fabric) | 44450 | 4325 | 93.4 | verified | Reusable task prompt workflow templates. |
| [linshenkx/prompt-optimizer](https://github.com/linshenkx/prompt-optimizer) | 39351 | 4468 | 93.1 | verified | Prompt optimizer product patterns. |
| [JushBJJ/Mr.-Ranedeer-AI-Tutor](https://github.com/JushBJJ/Mr.-Ranedeer-AI-Tutor) | 29550 | 3249 | 76.8 | verified | Adaptive tutor prompt patterns. |
| [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) | 26479 | 2590 | 91.2 | verified | Prompt testing, eval CI, regression gates. |
| [elder-plinius/L1B3RT4S](https://github.com/elder-plinius/L1B3RT4S) | 22052 | 2674 | 80.7 | verified | Adversarial corpus for safety regression tests only. |
| [liyupi/ai-guide](https://github.com/liyupi/ai-guide) | 21647 | 2355 | 90.5 | verified | Chinese AI prompt/product guide material. |
| [voyager-crew/voyager](https://github.com/voyager-crew/voyager) | 20473 | 685 | 88.7 | verified | Gemini workflow and prompt adaptation ideas. |

Top 3 by verified stars: x1xhlol/system-prompts-and-models-of-ai-tools, dair-ai/Prompt-Engineering-Guide, elder-plinius/CL4R1T4S

## gpt_image_2

| Repo | Stars | Forks | Quality | Verified | Focus |
|---|---:|---:|---:|---|---|
| [Evolink-AI/awesome-gpt-image-2-API-Prompts](https://github.com/Evolink-AI/awesome-gpt-image-2-API-Prompts) | 17355 | 1746 | 84.4 | verified | GPT Image 2 API and prompt examples. |
| [YouMind-OpenLab/awesome-gpt-image-2](https://github.com/YouMind-OpenLab/awesome-gpt-image-2) | 10181 | 890 | 86.9 | verified | Awesome list for GPT Image 2 resources. |
| [wuyoscar/GPT-Image2-Skill](https://github.com/wuyoscar/GPT-Image2-Skill) | 5891 | 474 | 84.4 | verified | GPT Image 2 skill/prompt patterns. |
| [Anil-matcha/Awesome-GPT-Image-2-API-Prompts](https://github.com/Anil-matcha/Awesome-GPT-Image-2-API-Prompts) | 25 | 5 | 62.2 | verified | GPT Image 2 prompt examples and API notes. |

Top 3 by verified stars: Evolink-AI/awesome-gpt-image-2-API-Prompts, YouMind-OpenLab/awesome-gpt-image-2, wuyoscar/GPT-Image2-Skill

## Extracted Rules

- 人工反馈优先级高于 AI 评价；人工指出的问题必须进入下一轮自动优化。
- 事实型任务不得编造来源、stars、commit、release；无法实时确认时标记待验证。
- 候选提示词必须通过意图保真、幻觉防护、目标模型适配、可执行性评分后才能展示。
- 黄色问题优先修复；绿色但低于 9.0 的幻觉和用户意图问题继续优化。
- GPT Image 2/以图生图必须保留参考图构图、色彩、比例、主体、风格和商业完成度。
