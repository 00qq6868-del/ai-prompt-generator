// ============================================================
//  Shared model cache — single source of truth
//  Imported by /api/generate AND /api/models to prevent divergence [C3]
// ============================================================

import { BUNDLED_MODELS, ModelInfo } from "./models-registry";
import axios from "axios";

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

let _models: ModelInfo[] | null = null;
let _fetchedAt = 0;

/** Fetch models from remote registry with TTL, falling back to bundled list */
export async function getModels(): Promise<ModelInfo[]> {
  const url = process.env.MODELS_REGISTRY_URL;

  // [C4 FIX] Guard against the placeholder URL — only attempt if real URL is set
  const isValidUrl =
    url &&
    !url.includes("yourusername") &&
    url.startsWith("https://");

  if (isValidUrl && Date.now() - _fetchedAt > CACHE_TTL) {
    try {
      const res = await axios.get<ModelInfo[]>(url, { timeout: 5000 });
      if (Array.isArray(res.data) && res.data.length > 0) {
        _models    = res.data;
        _fetchedAt = Date.now();
      }
    } catch {
      // Fall back to bundled list silently
    }
  }

  return _models ?? BUNDLED_MODELS;
}

/** Force the next getModels() call to re-fetch from remote */
export function invalidateCache(): void {
  _fetchedAt = 0;
  _models    = null;
}

/** Milliseconds since last successful remote fetch (0 = never fetched from remote) */
export function cacheAge(): number {
  return _fetchedAt > 0 ? Date.now() - _fetchedAt : 0;
}
