from dataclasses import dataclass

CORE_DIMENSIONS = {
    "intent_fidelity",
    "reference_similarity",
    "object_proportion",
    "text_rendering",
    "artifact_control",
}

IMAGE_WEIGHTS = {
    "composition": 10,
    "color_accuracy": 8,
    "texture_detail": 10,
    "object_proportion": 12,
    "lighting_consistency": 10,
    "reference_similarity": 15,
    "text_rendering": 10,
    "identity_preservation": 10,
    "artifact_control": 10,
    "commercial_finish": 5,
}


@dataclass
class ScoreResult:
    total: float
    passed: bool
    deductions: list[dict]
    dimension_scores: dict[str, float]


def strict_weighted_score(dimension_scores: dict[str, float], weights: dict[str, int] | None = None) -> ScoreResult:
    active_weights = weights or IMAGE_WEIGHTS
    deductions = []
    total = 0.0
    normalized = {}

    for name, weight in active_weights.items():
        raw = float(dimension_scores.get(name, 0))
        score = max(0, min(10, raw))
        normalized[name] = score
        total += score / 10 * weight

        if score < 3:
            deductions.append({
                "dimension": name,
                "reason": "dimension_below_3_direct_fail",
                "score": score,
            })

        if name == "text_rendering" and score < 6:
            deductions.append({
                "dimension": name,
                "reason": "text_not_reliably_readable",
                "score": score,
            })

        if name == "reference_similarity" and score < 5:
            deductions.append({
                "dimension": name,
                "reason": "reference_identity_or_pose_drift",
                "score": score,
            })

    passed = total >= 60 and not any(
        d["dimension"] in CORE_DIMENSIONS and d["score"] < 3
        for d in deductions
    )

    return ScoreResult(
        total=round(total, 2),
        passed=passed,
        deductions=deductions,
        dimension_scores=normalized,
    )


def image_to_image_score(metrics: dict, ai_judge_scores: dict) -> ScoreResult:
    face_similarity = float(metrics.get("face_similarity", 0))
    ssim = float(metrics.get("ssim", 0))
    dimension_scores = {
        "reference_similarity": min(10, face_similarity * 10),
        "composition": max(float(ai_judge_scores.get("composition", 0)), min(10, ssim * 10)),
        "color_accuracy": float(ai_judge_scores.get("color_accuracy", 0)),
        "texture_detail": float(ai_judge_scores.get("texture_detail", 0)),
        "object_proportion": float(ai_judge_scores.get("object_proportion", 0)),
        "lighting_consistency": float(ai_judge_scores.get("lighting_consistency", 0)),
        "text_rendering": float(ai_judge_scores.get("text_rendering", 0)),
        "identity_preservation": min(10, face_similarity * 10),
        "artifact_control": float(ai_judge_scores.get("artifact_control", 0)),
        "commercial_finish": float(ai_judge_scores.get("commercial_finish", 0)),
    }
    return strict_weighted_score(dimension_scores)
