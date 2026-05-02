const fs = require("fs");
const path = require("path");

const modelsPath = path.join("public", "models.json");

const modelsToEnsure = [
  {
    id: "gpt-image-1",
    name: "GPT Image 1",
    provider: "OpenAI",
    apiProvider: "aihubmix",
    contextWindow: 32768,
    maxOutput: 4096,
    inputCostPer1M: 5,
    outputCostPer1M: 40,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: false,
    isLatest: true,
    tags: ["image-gen"],
    releaseDate: "2025-04-23",
    category: "image",
  },
  {
    id: "seedance-1.0",
    name: "Seedance 1.0",
    provider: "ByteDance",
    apiProvider: "aihubmix",
    contextWindow: 8192,
    maxOutput: 4096,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    speed: "medium",
    accuracy: "high",
    supportsStreaming: false,
    isLatest: false,
    tags: ["video-gen"],
    releaseDate: "2025-03-01",
    category: "video",
  },
  {
    id: "seedance-2.0",
    name: "Seedance 2.0",
    provider: "ByteDance",
    apiProvider: "aihubmix",
    contextWindow: 8192,
    maxOutput: 4096,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    speed: "medium",
    accuracy: "supreme",
    supportsStreaming: false,
    isLatest: true,
    tags: ["video-gen"],
    releaseDate: "2025-06-01",
    category: "video",
  },
];

const models = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
const byId = new Map(models.map((model, index) => [model.id, { model, index }]));

let added = 0;
let updated = 0;

for (const model of modelsToEnsure) {
  const existing = byId.get(model.id);
  if (existing) {
    models[existing.index] = { ...existing.model, ...model };
    updated++;
  } else {
    models.push(model);
    byId.set(model.id, { model, index: models.length - 1 });
    added++;
  }
}

const duplicateIds = [...new Set(models.map((model) => model.id))]
  .filter((id) => models.filter((model) => model.id === id).length > 1);

if (duplicateIds.length) {
  throw new Error(`Duplicate model ids found: ${duplicateIds.join(", ")}`);
}

fs.writeFileSync(modelsPath, `${JSON.stringify(models, null, 2)}\n`);

const categories = models.reduce((counts, model) => {
  const category = model.category || "text";
  counts[category] = (counts[category] || 0) + 1;
  return counts;
}, {});

const zeroCost = models.filter(
  (model) => (model.inputCostPer1M ?? 0) === 0 && (model.outputCostPer1M ?? 0) === 0,
).length;

console.log(`Added: ${added}`);
console.log(`Updated: ${updated}`);
console.log(`Total models: ${models.length}`);
console.log(`Categories: ${JSON.stringify(categories)}`);
console.log(`Zero-cost models: ${zeroCost}`);
