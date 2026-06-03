export interface ScoreDimension {
  id: string;
  label: string;
  weight: number;
  core?: boolean;
}

export const PROMPT_SCORE_DIMENSIONS: ScoreDimension[] = [
  { id: "intent_fidelity", label: "Intent fidelity", weight: 12, core: true },
  { id: "detail_coverage", label: "Detail coverage", weight: 12 },
  { id: "target_model_fit", label: "Target model fit", weight: 10, core: true },
  { id: "structure_completeness", label: "Structure completeness", weight: 10 },
  { id: "specificity_control", label: "Specificity and control", weight: 10 },
  { id: "negative_constraints", label: "Negative constraints", weight: 8 },
  { id: "output_format_clarity", label: "Output clarity", weight: 8 },
  { id: "evaluation_readiness", label: "Evaluation readiness", weight: 8 },
  { id: "hallucination_resistance", label: "Hallucination resistance", weight: 8, core: true },
  { id: "generation_stability", label: "Generation stability", weight: 7 },
  { id: "reference_image_consistency", label: "Reference image consistency", weight: 7, core: true },
];

export const IMAGE_SCORE_DIMENSIONS: ScoreDimension[] = [
  { id: "composition", label: "Composition", weight: 10 },
  { id: "color_accuracy", label: "Color accuracy", weight: 8 },
  { id: "texture_detail", label: "Texture detail", weight: 10 },
  { id: "object_proportion", label: "Object proportion", weight: 12, core: true },
  { id: "lighting_consistency", label: "Lighting consistency", weight: 10 },
  { id: "reference_similarity", label: "Reference similarity", weight: 15, core: true },
  { id: "text_rendering", label: "Text rendering", weight: 10, core: true },
  { id: "identity_preservation", label: "Identity preservation", weight: 10, core: true },
  { id: "artifact_control", label: "Artifact control", weight: 10, core: true },
  { id: "commercial_finish", label: "Commercial finish", weight: 5 },
];
