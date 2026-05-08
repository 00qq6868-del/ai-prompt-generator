import { NextResponse } from "next/server";
import { refreshGithubProjectTracker } from "@/lib/server/github-project-tracker";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    const result = await refreshGithubProjectTracker();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "GitHub project tracker refresh failed" },
      { status: 500 },
    );
  }
}

