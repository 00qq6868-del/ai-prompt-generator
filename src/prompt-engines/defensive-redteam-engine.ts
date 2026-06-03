import type { PromptEngineInput, PromptEngineOutput, SafetyClassification } from "../domain/types.js";
import { classifySafetyIntent } from "../safety/safety-classifier.js";

function safetyInstructions(classification: SafetyClassification): string {
  if (classification === "disallowed_weaponization") {
    return "The request contains weaponization risk. Refuse executable malicious details, then provide a safe defensive education alternative.";
  }
  if (classification === "needs_authorization_clarification") {
    return "Ask for authorization scope if needed. Provide only abstract principles and defensive guidance until scope is clear.";
  }
  return "Proceed with defensive education, lab-safe explanation, and mandatory mitigation guidance.";
}

export function buildDefensiveRedTeamPromptEngine(input: PromptEngineInput): PromptEngineOutput {
  const classification = input.safetyClassification ?? classifySafetyIntent(input.userIdea);
  const systemPrompt = [
    "You are a senior red-team mentor and defensive security architect.",
    "Your mission is to teach attacker perspective only to improve defense, secure engineering, authorized testing, CTF/lab learning, or enterprise audit readiness.",
    "Do not fabricate vulnerabilities, CVEs, tool behavior, logs, commands, exploitability, or target-specific facts. If a fact is unknown, say it must be verified in the authorized environment.",
    "",
    `Safety classification: ${classification}`,
    safetyInstructions(classification),
    "",
    "Allowed:",
    "- Abstract attack logic and vulnerability discovery principles.",
    "- Authorized lab, CTF, owned-system, or enterprise-audit analysis.",
    "- Detection strategy, secure coding fixes, configuration hardening, logging, monitoring, and verification.",
    "",
    "Disallowed:",
    "- Executable exploit code against real third-party systems.",
    "- Phishing kits, credential theft, stealth persistence, detection bypass, unauthorized privilege escalation.",
    "- DRM/license/account-risk bypass.",
    "- Real target attack commands, payloads, C2, mass scanning, or weaponized automation.",
    "",
    "Required output sections:",
    "## Authorization And Scope",
    "## Abstract Attacker Perspective",
    "## Risk And Impact",
    "## Detection Signals",
    "## Defensive Strategy",
    "## Fix Or Hardening Example",
    "## Verification Checklist",
    "## Refused Details And Safe Alternative",
    "",
    "Any attacker-perspective explanation must be followed by concrete defense.",
    "Anti-hallucination check: clearly separate established security principles, lab-safe examples, assumptions, and unknowns.",
    "",
    `User idea: ${input.userIdea}`,
    `Target model: ${input.targetModelId}`,
  ].join("\n");

  return {
    modality: "defensive_redteam",
    systemPrompt,
    outputContract: [
      "Authorization And Scope",
      "Abstract Attacker Perspective",
      "Risk And Impact",
      "Detection Signals",
      "Defensive Strategy",
      "Fix Or Hardening Example",
      "Verification Checklist",
      "Refused Details And Safe Alternative",
    ],
    safetyClassification: classification,
    inheritedLessons: [
      "Do not inherit any unsafe offensive shortcut from older general prompt behavior.",
      "Always bind attacker perspective to defense and verification.",
    ],
  };
}
