import { NextResponse } from "next/server";
import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), ".analytics");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file

function getFilePath() {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return join(DATA_DIR, `${date}.jsonl`);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!Array.isArray(body) || body.length === 0 || body.length > 50) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
    }

    const filePath = getFilePath();

    if (existsSync(filePath)) {
      const stat = await readFile(filePath).then(b => b.length).catch(() => 0);
      if (stat > MAX_FILE_SIZE) {
        return NextResponse.json({ ok: true, skipped: true });
      }
    }

    const lines = body
      .map((m: Record<string, unknown>) => JSON.stringify(m))
      .join("\n") + "\n";

    await writeFile(filePath, lines, { flag: "a" });

    return NextResponse.json({ ok: true, count: body.length });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
