from dataclasses import dataclass
from typing import Literal

Preference = Literal["new_better", "old_better", "blend_needed", "both_bad"]


@dataclass
class PromptVersion:
    id: str
    text: str
    score: float


def decide_prompt_version(old: PromptVersion, new: PromptVersion, preference: Preference):
    if preference == "new_better":
        return {
            "accepted": new.id,
            "rejected": [old.id],
            "action": "replace_old_with_new",
        }

    if preference == "old_better":
        return {
            "accepted": old.id,
            "rejected": [new.id],
            "action": "keep_old_discard_new",
        }

    if preference in ("blend_needed", "both_bad"):
        return {
            "accepted": None,
            "rejected": [],
            "action": "generate_synthetic_blend",
        }

    raise ValueError("unknown preference")


def build_blend_prompt(
    user_idea: str,
    old_prompt: str,
    new_prompt: str,
    feedback_notes: str,
    failed_dimensions: list[str],
) -> str:
    return f"""
你是严格的提示词优化器。

用户原始需求:
{user_idea}

旧版提示词:
{old_prompt}

新版提示词:
{new_prompt}

用户不满意原因:
{feedback_notes}

失败维度:
{", ".join(failed_dimensions)}

任务:
1. 提取旧版中仍然有价值的结构、约束、格式。
2. 提取新版中真正增益的细节、目标模型适配、评分检查。
3. 删除两版共同失败点。
4. 不要复述用户原文，要增加可验证的控制条件。
5. 输出一个新的合成提示词。
6. 必须更严格处理评分虚高、细节不足、参考图一致性、手部、文字、构图、光影、物体比例。

只输出最终提示词。
""".strip()


def main():
    print("Optimization worker scaffold ready. Connect queue/Redis in production deployment.")


if __name__ == "__main__":
    main()
