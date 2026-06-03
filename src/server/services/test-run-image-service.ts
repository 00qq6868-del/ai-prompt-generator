import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, getTestRun, saveTestRunImage } from "../repositories/local-store.js";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function sanitizeFileName(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return clean || "uploaded-image";
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

function normalizeImageRole(value: unknown): "reference" | "generated" | "thumbnail" | "other" {
  if (value === "reference" || value === "generated" || value === "thumbnail") return value;
  return "other";
}

export async function saveTestRunImageV3(input: {
  testRunId: string;
  eventId?: string;
  imageRole?: unknown;
  file: File;
  metadata?: Record<string, unknown>;
}) {
  const testRun = await getTestRun(input.testRunId);
  if (!testRun) {
    return { ok: false as const, code: "TEST_RUN_NOT_FOUND", message: "test run not found" };
  }

  const mimeType = input.file.type;
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return { ok: false as const, code: "UNSUPPORTED_IMAGE_TYPE", message: "only jpeg, png, and webp are allowed" };
  }
  if (input.file.size > MAX_IMAGE_BYTES) {
    return { ok: false as const, code: "IMAGE_TOO_LARGE", message: "image must be 15MB or smaller" };
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const role = normalizeImageRole(input.imageRole);
  const dir = path.join(DATA_DIR, "test-run-images", testRun.id);
  await fs.mkdir(dir, { recursive: true });

  const originalName = sanitizeFileName(input.file.name || `${role}${extensionForMime(mimeType)}`);
  const fileName = `${role}-${sha256.slice(0, 16)}${extensionForMime(mimeType)}`;
  const storagePath = path.join(dir, fileName);
  await fs.writeFile(storagePath, buffer);

  const record = await saveTestRunImage({
    eventId: input.eventId || `${testRun.id}:${role}:${sha256}`,
    testRunId: testRun.id,
    imageRole: role,
    originalName,
    fileName,
    mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp",
    sizeBytes: input.file.size,
    sha256,
    storagePath,
    fileRef: `local://test-run-images/${testRun.id}/${fileName}`,
    metadata: {
      ...input.metadata,
      exifPolicy: "metadata_not_exported_to_dataset",
      privacyPolicy: "binary_image_stays_local",
    },
  });

  return { ok: true as const, image: record };
}
