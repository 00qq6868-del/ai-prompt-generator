import { errorJson, okJson } from "../../../../../../server/http/response.js";
import { saveTestRunImageV3 } from "../../../../../../server/services/test-run-image-service.js";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { testRunId: string } }) {
  const { testRunId } = params;
  const form = await req.formData().catch(() => null);
  if (!form) {
    return errorJson("MULTIPART_REQUIRED", "请使用 multipart/form-data 上传图片", "multipart/form-data is required", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return errorJson("IMAGE_FILE_REQUIRED", "缺少 file 图片字段", "file image field is required", 400);
  }
  const metadataRaw = String(form.get("metadata") ?? "{}");
  let metadata: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(metadataRaw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
  } catch {
    metadata = { parseWarning: "metadata_json_invalid" };
  }
  const eventId = String(form.get("eventId") ?? "").trim();
  const result = await saveTestRunImageV3({
    testRunId,
    imageRole: form.get("imageRole") ?? "other",
    file,
    metadata,
    ...(eventId ? { eventId } : {}),
  });
  if (!result.ok) {
    return errorJson(result.code, result.message, result.message, result.code === "TEST_RUN_NOT_FOUND" ? 404 : 400);
  }
  return okJson(result.image);
}
