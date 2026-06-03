import type { EvaluationScoreSet, QualityFinding, QualityIcon } from "../domain/types.js";

const CRITICAL_DIMENSIONS = new Set([
  "hallucination_resistance",
  "user_intent_alignment",
  "factual_accuracy",
  "safety",
]);

function clamp10(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(10, number));
}

function iconForScore(dimension: string, score: number): QualityIcon {
  if (score < 7 || (dimension === "safety" && score < 8)) return "red";
  if (score < 8.5) return "yellow";
  return "green";
}

function basePriority(icon: QualityIcon, dimension: string): number {
  if (icon === "red") return 20;
  if (icon === "yellow") return 30;
  if (icon === "green" && dimension === "hallucination_resistance") return 40;
  if (icon === "green" && dimension === "user_intent_alignment") return 50;
  if (icon === "green") return 60;
  return 90;
}

export function buildQualityFindings(args: {
  scores: Partial<EvaluationScoreSet>;
  humanNotes?: string;
  humanScore?: number;
  humanSeverity?: "low" | "medium" | "high" | "critical";
  repeatedIssueKeys?: string[];
}): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const entries = Object.entries(args.scores) as Array<[string, number | undefined]>;
  for (const [dimension, rawScore] of entries) {
    if (rawScore === undefined) continue;
    const score = clamp10(rawScore);
    const icon = iconForScore(dimension, score);
    if (icon === "green" && score >= 9) continue;
    const criticalBoost = CRITICAL_DIMENSIONS.has(dimension) ? -2 : 0;
    findings.push({
      id: `${dimension}:${score.toFixed(1)}`,
      icon,
      dimension,
      score,
      reason: icon === "green"
        ? "green_but_below_9_quality_target"
        : `${icon}_score_threshold_triggered`,
      source: "ai",
      priority: basePriority(icon, dimension) + criticalBoost,
    });
  }

  const notes = String(args.humanNotes ?? "");
  const humanScore = Number(args.humanScore ?? 100);
  const humanCritical = args.humanSeverity === "critical" || /严重|阻断|泄露|危险|unsafe|block/i.test(notes);
  const humanHigh = args.humanSeverity === "high" || humanScore < 70 || /不满意|没实现|幻觉|意图|错|bad|hallucination|intent/i.test(notes);
  if (notes || Number.isFinite(humanScore)) {
    if (humanCritical || humanHigh) {
      findings.unshift({
        id: `human:${humanCritical ? "critical" : "high"}`,
        icon: humanCritical ? "red" : "yellow",
        dimension: "human_feedback",
        score: Number.isFinite(humanScore) ? Math.max(0, Math.min(10, humanScore / 10)) : null,
        reason: "human_feedback_has_highest_priority",
        source: "human",
        priority: 10,
      });
    }
  }

  for (const issueKey of args.repeatedIssueKeys ?? []) {
    findings.push({
      id: `memory:${issueKey}`,
      icon: "yellow",
      dimension: issueKey,
      score: null,
      reason: "feedback_memory_repeated_issue",
      source: "memory",
      priority: 25,
    });
  }

  return findings.sort((a, b) => a.priority - b.priority || String(a.dimension).localeCompare(String(b.dimension)));
}

export function partitionFindings(findings: QualityFinding[]) {
  return {
    red: findings.filter((item) => item.icon === "red"),
    yellow: findings.filter((item) => item.icon === "yellow"),
    greenBelowNine: findings.filter((item) => item.icon === "green" && item.score !== null && item.score < 9),
    gray: findings.filter((item) => item.icon === "gray"),
    priorityQueue: [...findings].sort((a, b) => a.priority - b.priority),
  };
}

export function shouldOptimize(findings: QualityFinding[]): boolean {
  return findings.some((item) => item.icon === "red" || item.icon === "yellow" || (item.icon === "green" && item.score !== null && item.score < 9));
}
