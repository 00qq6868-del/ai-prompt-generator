import { writeGithubLedgerPayload } from "../dist-tests/src/server/services/github-ledger-service.js";
import { runGithubLedgerWorker } from "./github-ledger-worker.mjs";

await writeGithubLedgerPayload({
  dryRun: true,
  payload: {
    generatedAt: new Date().toISOString(),
    project: "ai-prompt-generator-v3",
    artifactType: "text_prompt",
    promptId: "worker-validation",
    promptVersionId: "worker-validation-version",
    redactedInput: "validate ledger worker without pushing secrets",
    humanEvaluation: { priority: "highest" },
    optimization: { triggered: true, status: "candidate" },
    yellowItems: [{ dimension: "worker_readiness" }],
    greenBelowNineItems: [{ dimension: "hallucination_resistance" }],
    redItems: [],
    regression: { commands: ["npm run test:compiled", "npm run github-ledger:validate"] },
  },
});

const result = await runGithubLedgerWorker({ dryRun: true, push: false });
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok && result.copied.length > 0 ? 0 : 1);
