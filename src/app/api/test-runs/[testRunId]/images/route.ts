import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { saveTestImage } from "@/lib/server/storage";

export const runtime = "nodejs";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 15 * 1024 * 1024;

function cleanString(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function extensionFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function POST(
  req: NextRequest,
  { params }: { params: { testRunId: string } },
) {
  try {
    const form = await req.formData();
    const role = cleanString(form.get("imageRole"), 40);
    const imageRole = role === "generated" || role === "thumbnail" ? role : "reference";
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "file is required / 缺少图片文件" },
        { status: 400 },
      );
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Only jpeg/png/webp are allowed / 仅支持 JPEG、PNG、WebP" },
        { status: 415 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Image is larger than 15MB / 图片超过 15MB" },
        { status: 413 },
      );
    }

    const raw = Buffer.from(await file.arrayBuffer());
    const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
    const cleaned = await sharp(raw, { failOn: "none" })
      .rotate()
      .toFormat(extensionFor(file.type) === "jpg" ? "jpeg" : extensionFor(file.type) as "png" | "webp")
      .toBuffer();
    const metadata = await sharp(cleaned).metadata();
    const ext = extensionFor(file.type);
    const relativeDir = path.join(".local-data", "test-images", params.testRunId);
    const absoluteDir = path.join(process.cwd(), relativeDir);
    await fs.mkdir(absoluteDir, { recursive: true });
    const fileName = `${imageRole}-${sha256.slice(0, 16)}.${ext}`;
    const relativePath = path.join(relativeDir, fileName).replace(/\\/g, "/");
    await fs.writeFile(path.join(absoluteDir, fileName), cleaned);

    const image = await saveTestImage({
      testRunId: params.testRunId,
      imageRole,
      storageUrl: relativePath,
      sha256,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      mimeType: file.type,
      metadata: {
        originalName: cleanString(file.name, 220),
        originalBytes: file.size,
        exifStripped: true,
      },
    });

    return NextResponse.json({
      ok: true,
      imageId: image.id,
      imageRole,
      sha256,
      width: metadata.width,
      height: metadata.height,
      storageUrl: relativePath,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Image upload failed / 图片上传失败" },
      { status: 500 },
    );
  }
}
