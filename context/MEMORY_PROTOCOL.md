# AI 提示词生成器记忆协议

> 目标：任何 AI 窗口、任何上下文压缩、任何接手者，都必须先恢复项目记忆，再开始改代码或回答结论。
> 这个文件优先级高于旧的零散习惯说明。

## 1. 开工强制顺序

每一次处理本项目，先执行或人工完成以下步骤：

1. 进入项目根目录：`E:\AIWB\ai-prompt-generator-codex`。
2. 读取高密度交接包：`context/CURRENT_HANDOFF.md`。
3. 读取长期记忆：
   - `context/MEMORIES.md`
   - `context/PROJECT_CONTEXT.md`
   - `context/PROGRESS.md`
   - `context/SESSION_LOG.md` 最新部分
   - `context/CODEX_HANDOFF.md` 最新部分
   - `AGENTS.md`
4. 过一遍 GitHub 状态：
   - `git status -sb`
   - `git remote -v`
   - `git log --oneline --decorate -8`
   - `gh repo view 00qq6868-del/ai-prompt-generator --json nameWithOwner,defaultBranchRef,url,visibility,updatedAt,pushedAt`
   - `gh run list --repo 00qq6868-del/ai-prompt-generator --limit 8`
5. 明确当前用户最新要求，再动手。

如果没有完成上述步骤，不允许声称“已理解项目状态”。

## 2. 三层记忆结构

| 层级 | 文件 | 用途 | 规则 |
| --- | --- | --- | --- |
| L1 当前交接 | `context/CURRENT_HANDOFF.md` | 上下文压缩后最先读的高密度状态 | 必须短、准、可执行，记录当前未完成项、最新用户纠正、GitHub 状态、验证结果 |
| L2 过程记录 | `context/SESSION_LOG.md`、`context/PROGRESS.md` | 记录每次会话做过什么、测过什么、还差什么 | 重要节点必须追加，不要只写最终结论 |
| L3 长期记忆 | `context/MEMORIES.md`、`context/PROJECT_CONTEXT.md`、`context/CODEX_HANDOFF.md` | 保存长期决策、技术坑、架构背景 | 不轻易删除，发现旧规则过时要写“已废弃原因” |

## 3. 什么时候必须保存记忆

以下任一情况出现，先保存记忆，再继续：

- 用户纠正了核心需求或指出 AI 理解错误。
- 做了一半但还没完成，且可能进入上下文压缩。
- 修改了关键架构、数据结构、模型选择策略、评价/反馈/记忆逻辑。
- 跑完关键验证、发现失败、修复失败或确认某个问题不是代码失败。
- 准备提交、推送、部署或结束当前回答。
- 当前任务超过 30 分钟或涉及多文件连续修改。

## 4. 标准保存命令

优先使用跨平台 Node 脚本：

```powershell
npm run memory:checkpoint
```

可选地带上本轮要点：

```powershell
$env:MEMORY_NOTE="正在合并生成器模型和评价模型；评价模型不再单独显示，后端镜像为生成模型"
npm run memory:checkpoint
```

只查看开工记忆顺序：

```powershell
npm run memory:boot
```

## 5. GitHub 保存规则

- AI 工作台根目录不上传 GitHub。
- AI 提示词生成器项目可以上传到 GitHub：`https://github.com/00qq6868-del/ai-prompt-generator`。
- 如果上下文快满、但代码还没完全完成，至少先把 `context/CURRENT_HANDOFF.md`、`context/SESSION_LOG.md`、`context/PROGRESS.md` 保存在本地。
- 如果需要远端保底，再提交并推送 context 文件，不能把 API key、真实密钥、用户隐私、原始图片、未脱敏数据写进 GitHub。
- 每次推送前必须看 `git status -sb`，确认没有把 AI 工作台根目录或密钥文件误加入项目仓库。

## 6. 当前项目不可忘记的硬要求

- 用户要的是执行和完成，不是只写方案。
- 生成器模型和评价模型必须合并为一个用户选择入口：用户选好生成/评价模型后，系统自动用同一组模型生成并评价，不再让用户单独选择评价模型。
- 人工评价优先于 AI 评价，反馈必须进入记忆并影响下一轮优化。
- 每次评价后都要记录并触发自动优化；GitHub 同步在配置 token 后执行，未配置时必须本地保留。
- 黄色问题优先优化；绿色但低于 9.0 的幻觉和用户意图问题也要继续优化。
- GPT Image 2 / gpt-image-2 生图提示词模块属于 AI 提示词生成器能力范围。
- 幻觉治理能力同时服务 AI 工作台和 AI 提示词生成器。
- 不能因为上下文压缩而丢失这些要求。

## 7. 压缩原则

压缩不是简单删细节，而是保留会影响后续决策的事实：

- 用户最新纠正是什么。
- 当前代码改到哪一步。
- 哪些文件改了。
- 哪些测试通过、哪些失败、失败原因是什么。
- 远端 GitHub 当前 commit 和 CI 状态。
- 哪些事情绝对不能重复犯错。
- 下一步从哪里继续。

如果内容太多，优先把“事实、路径、命令、文件、未完成项、失败原因、用户硬要求”保留下来，删掉空泛解释。
