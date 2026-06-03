import { okJson } from "../../../../../server/http/response.js";
import { exportDatasetJsonlV3 } from "../../../../../server/services/dataset-export-service.js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return okJson(await exportDatasetJsonlV3({ reason: String(body.reason ?? "api_export") }));
}
