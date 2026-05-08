# AI 提示词生成器自动优化系统设计与落地记录

更新时间：2026-05-08

本文件是当前仓库的工程约束文档，覆盖用户输入纠错、历史记录 GitHub 同步、GitHub 优秀项目跟进、内部细分路由、候选提示词评分择优、feedback_memory、重构对照测试和防幻觉质量门。

## 1. 需求理解与目标总结

- 用户输入可能存在明显错误或冲突，例如「汽车」需求里误写「手机」，或同一输入同时出现汽车/手机、图片/视频、网页端/手机端。系统必须先检测并在不确定时追问，不得直接生成错误方向。
- 测试面板网站历史记录和主网站历史记录都要进入统一数据管道，经过清洗、脱敏、去重后同步到 GitHub；无 GitHub token 时必须先落到本地 `.local-data`，不能丢。
- 历史记录不能只保存，必须进入 `feedback_memory`、候选评分、失败模式识别和下一次自动优化。
- 开启优化后，系统要跟进 GitHub 上解决幻觉、提示词优化、GPT Image 2 生图提示词三类优秀项目。stars/forks/activity 等只能来自 GitHub API，无法确认时标记待验证。
- 编程、图片、视频、音频、文本/推理/写作等细分模块只作为内部路由，不要求用户手动选择。
- 生成器模型和评价模型保持一个用户选择入口；后端兼容字段自动镜像，不能重新拆成两个用户选择器。
- 每次 AI 评价和人工评价后都必须保存，人工评价优先于 AI 评价；黄色问题优先优化，绿色但低于 9.0 的幻觉和用户意图问题继续优化。

## 2. 总体架构方案

```text
用户输入/参考图
  -> intent-router 输入清洗、领域/模态/任务识别、冲突检测
  -> 如需澄清：前端显示轻量确认卡片
  -> feedback_memory + 历史成功/失败案例 + GitHub 项目规则库
  -> 多候选提示词生成
  -> AI 自动评价 + strict quality gate
  -> 选最佳/融合/重试
  -> 输出给用户
  -> 人工反馈优先写入 feedback_memory
  -> 主站历史 + 测试面板记录 -> /api/history/sync / /api/test-runs -> GitHub JSONL 或本地 fallback
  -> GitHub 项目跟进脚本定时刷新 -> 规则抽取 -> 下一轮优化
```

关键文件：

- `src/lib/intent-router.ts`：用户输入纠错、冲突检测、内部分类路由。
- `src/app/api/intent/analyze/route.ts`：意图分析 API。
- `src/app/api/generate/route.ts`：生成主链路，后端再次执行冲突防护。
- `src/components/PromptGenerator.tsx`：前端澄清/纠错确认卡片、历史启动同步。
- `src/app/api/history/sync/route.ts`：主站本地历史同步接口。
- `src/lib/server/github-dataset.ts`：统一 GitHub/local JSONL 导出。
- `src/lib/github-project-tracker.ts`：用户指定 GitHub 项目种子库、评分与规则抽取。
- `scripts/sync-github-project-tracker.cjs`：GitHub API 实时项目跟进脚本。
- `database/schema.sql`：历史记录、澄清事件、项目榜单、规则版本、重构对照结果表。

## 3. 核心模块设计

### 用户输入纠错与澄清模块

- 检测范围：关键词冲突、领域冲突、任务类型冲突、模态冲突。
- 典型冲突：汽车 vs 手机、图片 vs 视频、网页端 vs 手机端。
- 高置信误写：系统显示纠错建议，用户一键接受或保留原文。
- 低置信冲突：必须追问，不允许擅自生成。
- 记录方式：前端 `saveIntentMemoryEvent()` 写入 `ai_prompt_intent_memory`，下一轮 `buildPromptFeedbackMemory()` 会读取。

### 自动分类与模态路由模块

内部分类包括：

- 编程与代码：网页端、手机端、桌面软件、后端、API、数据库、脚本、DevOps、测试、安全、性能、架构、代码审查、Bug 修复。
- 图片生成：商业图、人像、动漫、风景、以图生图、商品图、海报、Logo、UI 视觉、摄影、角色/场景设定、GPT Image 2。
- 视频生成：小说、动漫、电影、短剧、分镜、镜头语言、动作、场景调度、旁白、字幕、预告片。
- 音频生成：音乐、人声、旁白、配音、音效、播客、有声书、BPM、乐器、混音。
- 文本/推理/写作/分析：文章、文案、翻译、总结、研究、教育、法律、医疗、商业分析、产品、UX、学术、角色扮演、策略。

这些标签只进入内部 prompt、数据库和评分，不变成用户必须手动选择的步骤。

### 历史记录统一与 GitHub 同步模块

- 主站本地历史：页面启动时每 6 小时最多同步一次最近 50 条到 `/api/history/sync`。
- 测试面板记录：继续使用 `/api/test-runs`，自动生成 `test-runs` JSONL。
- 反馈记录：继续使用 `/api/feedback`，自动生成 `prompt-feedback` JSONL。
- 数据导出：统一通过 `exportDatasetRow()`，GitHub token 存在时写 GitHub；否则写 `.local-data`。
- 隐私：导出 device hash，不导出 API key，不导出原始图片，不导出 EXIF GPS。

### GitHub 项目发现与榜单模块

固定保留用户给出的全部项目，同时脚本具备实时 GitHub API 查询能力。榜单规则：

- 每类保留必选 seed 仓库。
- stars、forks、pushedAt、updatedAt、description 只来自 GitHub API 或标记待验证。
- 排序优先 stars，再看质量分。
- 质量分参考 stars、forks、最近活跃、相关性和验证状态。
- adversarial/leaked prompt 类仓库只能用于防御评测和失败模式，不得复制不安全绕过策略。

## 4. 必须保留的 GitHub 项目清单

### 解决 AI 幻觉

- https://github.com/confident-ai/deepeval?tab=readme-ov-file#readme
- https://github.com/arize-ai/phoenix
- https://github.com/truera/trulens
- https://github.com/uptrain-ai/uptrain
- https://github.com/stanford-oval/WikiChat
- https://github.com/cvs-health/uqlm
- https://github.com/potsawee/selfcheckgpt
- https://github.com/KRLabsOrg/LettuceDetect
- https://github.com/DAMO-NLP-SG/VCD

落地策略：把这些项目思想转为 groundedness、uncertainty、self-consistency、RAG/source-boundary、trace/eval、regression gate 等评价维度。具体实现细节以仓库 README 和文档实时确认，不编造。

### 全面优化 AI 提示词

- https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools
- https://github.com/dair-ai/Prompt-Engineering-Guide
- https://github.com/danielmiessler/Fabric
- https://github.com/JushBJJ/Mr.-Ranedeer-AI-Tutor
- https://github.com/linshenkx/prompt-optimizer
- https://github.com/elder-plinius/CL4R1T4S
- https://github.com/promptfoo/promptfoo
- https://github.com/elder-plinius/L1B3RT4S
- https://github.com/Nagi-ovo/gemini-voyager
- https://github.com/liyupi/ai-guide

落地策略：转为模板库、prompt rubric、回归测试、失败样例、模型适配规则和安全评测。CL4R1T4S/L1B3RT4S 只允许用于安全防御和防 jailbreak regression，不允许吸收绕过性内容。

### GPT Image 2 / gpt-image-2

- https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts
- https://github.com/Anil-matcha/Awesome-GPT-Image-2-API-Prompts
- https://github.com/wuyoscar/gpt_image_2_skill
- https://github.com/YouMind-OpenLab/awesome-gpt-image-2

落地策略：用于 GPT Image 2 生图提示词结构、图生图质量门、参考图一致性、负面约束、商业完成度和参数建议。

## 5. 数据库 / 知识库 Schema

新增表：

- `prompt_history_records`：主站/测试面板历史记录统一索引。
- `intent_clarification_events`：输入冲突、纠错、澄清记录。
- `github_project_watchlist`：GitHub 项目库与榜单。
- `optimization_rule_versions`：从 GitHub/反馈/AB 测试抽取的优化规则版本。
- `refactor_comparison_results`：旧版、新版、hybrid、redesign 的对照择优结果。

详见 `database/schema.sql`。

## 6. GitHub 自动化设计

目录结构：

```text
data/
  prompt-feedback/YYYY-MM.jsonl
  test-runs/YYYY-MM.jsonl
  score-reports/YYYY-MM.jsonl
  prompt-history/YYYY-MM.jsonl
  github-projects/PROJECT_TRACKER_STATUS.json
  github-projects/PROJECT_TRACKER_STATUS.md
src/lib/github-project-tracker-status.ts
```

自动化：

- `npm run sources:github-projects`：刷新 GitHub 项目榜单和规则。
- `npm run sources:all`：同步 GPT Image 2 来源、提示词来源、GitHub 项目跟进。
- `.github/workflows/sync-prompt-sources.yml`：每 6 小时运行并提交状态文件。
- `/api/history/sync`：主站启动时同步本地历史。
- `/api/test-runs`：测试面板同步测试记录。
- `/api/feedback`：人工反馈同步。

安全：

- 不提交 API Key、cookie、原始图片、EXIF GPS。
- 没有 token 时写 `.local-data`，不丢数据。
- GitHub 项目 stats 未验证时显示 `待验证`。

## 7. 提示词优化流水线

1. 用户输入。
2. `intent-router` 清洗、分类、冲突检测。
3. 如冲突：显示澄清卡片；用户确认后继续。
4. 读取 `feedback_memory`、历史反馈、意图澄清记忆、GitHub 规则。
5. 根据内部模态/领域生成多个候选。
6. AI 评价 + strict quality gate。
7. 候选不足 70 或关键维度不足 9.0 时自动修复或重试。
8. 多候选接近时融合；两者都差时重做。
9. 只把最佳版本展示给用户。
10. 用户反馈优先进入记忆并触发下一轮优化。
11. 记录历史、反馈、测试结果、规则变更到 GitHub 或本地 fallback。

## 8. 用户输入冲突检测与追问策略

例子：「帮我生成汽车广告海报，但关键词写手机外观，高级车灯，新能源车」。

- 如果汽车和手机都只出现一次，且上下文不清：追问「汽车还是手机？」。
- 如果汽车上下文很强，手机像误写：提示「这可能是输入错误，是否把手机改为汽车？」。
- 如果用户明确说「汽车和手机联名海报」或「车机连接手机」：不追问，按多主体/多模态处理。
- 澄清记录进入 `feedback_memory`，之后遇到类似冲突会更谨慎。

## 9. 候选提示词评分系统

核心维度：

| 维度 | 目标 |
| --- | --- |
| 意图保真 | >= 9/10 |
| 幻觉防护 | >= 9/10 |
| 目标模型适配 | >= 9/10 |
| 结构完整性 | >= 9/10 |
| 可执行性 | >= 9/10 |
| 用户语言一致 | >= 9/10 |
| 参考图一致性 | 图生图任务必须 >= 9/10 |
| 安全边界 | 不清晰直接失败 |

优先级：

1. 人工评价指出的问题。
2. 红色严重问题。
3. 黄色问题。
4. 绿色但低于 9.0 的幻觉问题。
5. 绿色但低于 9.0 的用户意图问题。
6. 其他绿色但低于 9.0 项。
7. 体验、性能、文档、可维护性。

## 10. feedback_memory 设计

来源：

- 人工评分、文字评价、偏好选择。
- AI strict score、失败维度、候选排名。
- 意图澄清/自动纠错事件。
- 主站历史、测试面板历史。
- GitHub 项目规则库。
- A/B 对比和重构决策结果。

规则：

- 人工反馈权重最高。
- 新近失败权重高于旧失败。
- 多次有效的规则提升权重，多次失败的规则降权。
- 冲突反馈不直接固化，必须保留来源和适用范围。
- 全局、项目级、用户级、任务级分层保存。

## 11. 防幻觉机制

- 对 GitHub stars、release、commit、README 内容只使用实时 API/仓库文档，不能猜。
- 高风险事实任务区分：确定事实、合理推断、待验证。
- 研究、法律、医疗、安全任务启用更严格 `source-boundary`。
- 对提示词候选使用 self-consistency、groundedness、uncertainty 和 regression cases。
- 对参考图任务只基于图像分析和用户输入生成，不编造看不见的品牌、文字、人物身份。

## 12. 重构策略

判断标准：

- 小修：单点 UI/文案/边界 bug。
- 模块级重构：单模块耦合、测试缺口、数据结构不足。
- 大面积重构：跨 API、数据库、前端、worker 的链路问题。
- 完全重构：旧架构无法支持自动化闭环、质量门、回滚、测试。

完全重构流程：

1. 冻结旧版为 benchmark source。
2. clean-room 实现新版。
3. 用同一批 golden/regression cases 跑旧版、新版、hybrid。
4. 按 `new / old / hybrid / redesign` 决策。
5. 只迁移被证明更好的能力。
6. 通过 typecheck/build/E2E/production smoke 后推送。
7. 保留 rollback 分支和对照报告。

## 13. 实施路线图

- 第 0 阶段：审计现有项目、读取记忆、确认模型选择合并和参考图链路。
- 第 1 阶段：历史记录统一与 GitHub 同步。
- 第 2 阶段：分类、纠错、澄清、feedback_memory。
- 第 3 阶段：GitHub 项目跟进与规则抽取。
- 第 4 阶段：候选提示词生成、评价、融合。
- 第 5 阶段：防幻觉与 GPT Image 2 专项优化。
- 第 6 阶段：A/B 测试、重构与上线。
- 第 7 阶段：长期自动优化闭环。

当前提交覆盖第 1、2、3 阶段的生产骨架，并接入现有生成链路。

## 14. 验收标准

| 能力 | 标准 |
| --- | --- |
| 冲突识别 | 汽车 vs 手机等高风险冲突必须触发追问 |
| 澄清继续 | 用户选择方向后必须继续生成，且不会误用冲突词 |
| 历史同步 | 主站启动自动尝试同步最近 50 条历史 |
| 测试记录 | 测试面板继续通过 `/api/test-runs` 同步 |
| GitHub 项目跟进 | `npm run sources:github-projects` 生成 JSON/MD/TS 状态 |
| 防编造 | 无法确认 GitHub stats 时必须标记待验证 |
| 质量门 | 关键维度不足时自动修复或标记失败 |
| 回滚 | 所有改动在 Git 中可回滚，数据库变更向后兼容 |

## 15. 关键伪代码

```ts
const analysis = analyzeUserIntent(userIdea);
if (analysis.status === "needs_clarification") {
  return askUser(analysis.clarificationQuestion, analysis.conflicts[0].options);
}

const effectiveIdea = userChoice
  ? applyClarificationChoice(userIdea, userChoice)
  : analysis.suggestedInput ?? userIdea;

const memory = buildPromptFeedbackMemory(effectiveIdea, targetModel);
memory.rules.push(...analysis.feedbackMemoryHints);

const candidates = await generateCandidates(effectiveIdea, memory, githubRules);
const scored = scoreCandidates(candidates);
const best = selectOrBlend(scored);
if (best.score < threshold) retryOrRepair(best);
return best.prompt;
```

