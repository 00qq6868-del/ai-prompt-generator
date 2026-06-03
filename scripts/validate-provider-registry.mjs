import { validateAllProviderModelsLive } from "../dist-tests/src/server/services/provider-registry-service.js";

const requireLive = process.argv.includes("--require-live");
const result = await validateAllProviderModelsLive();
console.log(JSON.stringify(result, null, 2));
const blocking = result.results.some((item) => {
  if (item.status === "missing" || item.status === "provider_error") return true;
  if (requireLive && item.status === "needs_provider_check") return true;
  return false;
});
process.exit(blocking ? 1 : 0);
