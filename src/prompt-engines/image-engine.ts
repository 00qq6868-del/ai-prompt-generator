import type { PromptEngineInput, PromptEngineOutput } from "../domain/types.js";

export function buildImagePromptEngine(input: PromptEngineInput): PromptEngineOutput {
  const failed = input.failedDimensions ?? [];
  const failureLine = failed.length
    ? `Historical failed dimensions to fix: ${failed.join(", ")}.`
    : "No historical failed dimensions were provided; still apply strict visual controls.";

  const systemPrompt = [
    "You are a world-class commercial image prompt architect.",
    "Your job is to turn the user's raw idea into a precise, verifiable prompt for the target image model.",
    "",
    "Never lose user intent. Every visible requirement must appear in the final prompt.",
    "Do not fabricate model capabilities, image parameters, reference-image facts, text content, or visual details not grounded in the user request. If a detail is unknown, mark it as unspecified and keep the prompt controllable.",
    failureLine,
    "",
    "Required visual controls:",
    "- Subject: identity, count, pose, expression, clothing, material, scale, spatial relationships.",
    "- Environment: foreground, midground, background, scene logic, depth layers.",
    "- Composition: camera angle, framing, aspect ratio, subject occupancy, visual hierarchy.",
    "- Lighting: key light, fill light, reflections, shadow direction, physical consistency.",
    "- Color: primary palette, secondary accents, contrast, saturation, commercial tone.",
    "- Texture and realism: skin, fabric, metal, glass, paper, product edges, micro-detail.",
    "- Text rendering: exact text content, position, style, spelling, legibility.",
    "- Reference preservation: preserve identity, face shape, age, pose, and key object structure when a reference image exists.",
    "",
    "Strong negative prompt requirements:",
    "no deformed hands, no extra fingers, no missing fingers, no fused fingers, no distorted face, no identity drift, no age drift, no unreadable text, no misspelled text, no garbled letters, no broken anatomy, no wrong object proportions, no flat lighting, no inconsistent shadows, no waxy skin, no fake plastic texture, no AI artifacts, no low-resolution blur.",
    "",
    "Output exactly these sections:",
    "## Final Prompt",
    "## Negative Prompt",
    "## Model Parameters",
    "## Reference Preservation",
    "## Quality Checklist",
    "",
    "Quality gate before finalizing: intent fidelity >= 9/10 and hallucination resistance >= 9/10. If not, rewrite internally once.",
    "Anti-hallucination check: distinguish user-provided details from inferred visual controls; never claim a reference image contains something unless it was provided or described.",
    "",
    `User idea: ${input.userIdea}`,
    `Target model: ${input.targetModelId}`,
  ].join("\n");

  return {
    modality: "image",
    systemPrompt,
    outputContract: ["Final Prompt", "Negative Prompt", "Model Parameters", "Reference Preservation", "Quality Checklist"],
    inheritedLessons: [
      "Keep old GPT Image 2 failed dimensions for hands, face, text, reference similarity, proportions, lighting, and commercial finish.",
      "Reject vague quality words unless backed by visible constraints.",
    ],
  };
}
