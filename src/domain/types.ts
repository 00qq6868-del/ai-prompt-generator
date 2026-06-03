export type Modality = "image" | "reasoning_code" | "defensive_redteam" | "general_text";

export type ComparisonDecision = "new" | "old" | "hybrid" | "redesign";

export type SafetyClassification =
  | "allowed_defensive"
  | "allowed_lab_or_ctf"
  | "needs_authorization_clarification"
  | "disallowed_weaponization";

export interface CoreMetrics {
  intentFidelity: number;
  hallucinationResistance: number;
  stability: number;
  maintainability: number;
  userExperience: number;
  testCoverage: number;
  dataLoopCompleteness: number;
  safetyBoundaryClarity: number;
}

export interface ModuleComparisonRecord {
  module: string;
  oldBehavior: string;
  newCandidate: string;
  testCases: string[];
  oldMetrics: CoreMetrics;
  newMetrics: CoreMetrics;
  decision: ComparisonDecision;
  reason: string;
  acceptedParts: string[];
  rejectedParts: string[];
}

export interface GoldenCase {
  id: string;
  modality: Modality;
  userIdea: string;
  targetModelId: string;
  failedDimensions: string[];
  requiredPromptFeatures: string[];
  minScores: Record<string, number>;
}

export interface PromptEngineInput {
  userIdea: string;
  targetModelId: string;
  language: "zh" | "en";
  failedDimensions?: string[];
  hasReferenceImage?: boolean;
  safetyClassification?: SafetyClassification;
}

export interface PromptEngineOutput {
  modality: Modality;
  systemPrompt: string;
  outputContract: string[];
  safetyClassification?: SafetyClassification;
  inheritedLessons: string[];
}

export interface QualityGateResult {
  pass: boolean;
  totalScore: number;
  intentFidelity: number;
  hallucinationResistance: number;
  rewriteAttempted: boolean;
  needsReview: boolean;
  failedDimensions: string[];
  deductions: Array<{ dimension: string; reason: string; score: number }>;
}

export type QualityIcon = "red" | "yellow" | "green" | "gray";

export type ArtifactType = "text_prompt" | "image_prompt" | "workbench_task" | "system_prompt" | "rag_prompt";

export interface EvaluationScoreSet {
  hallucination_resistance: number;
  user_intent_alignment: number;
  completeness: number;
  factual_accuracy: number;
  actionability: number;
  format_compliance: number;
  model_specific_optimization: number;
  safety: number;
  consistency: number;
  maintainability: number;
  testability: number;
  image_prompt_quality?: number;
  workspace_task_quality?: number;
}

export interface QualityFinding {
  id: string;
  icon: QualityIcon;
  dimension: string;
  score: number | null;
  reason: string;
  source: "ai" | "human" | "memory" | "regression";
  priority: number;
}

export interface FeedbackMemoryDelta {
  id: string;
  artifactId: string;
  artifactType: ArtifactType;
  versionId: string;
  targetModelId: string;
  humanOverridesAi: boolean;
  repeatedIssueKeys: string[];
  effectiveStrategies: string[];
  ineffectiveStrategies: string[];
  yellowItems: QualityFinding[];
  greenBelowNineItems: QualityFinding[];
  createdAt: string;
}
