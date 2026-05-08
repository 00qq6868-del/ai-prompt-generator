import { NextRequest, NextResponse } from "next/server";
import { analyzeUserIntent } from "@/lib/intent-router";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const input = typeof body.userIdea === "string" ? body.userIdea : "";
    const language = body.language === "en" ? "en" : "zh";
    if (!input.trim()) {
      return NextResponse.json({ ok: false, error: "userIdea is required" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, analysis: analyzeUserIntent(input, language) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Intent analysis failed" }, { status: 500 });
  }
}

