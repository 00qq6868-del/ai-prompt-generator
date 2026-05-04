import { NextRequest, NextResponse } from "next/server";

interface FeedbackPayload {
  id?: string;
  timestamp?: number;
  userIdea?: string;
  originalPrompt?: string;
  previousPrompt?: string;
  optimizedPrompt?: string;
  selectedPrompt?: string;
  targetModel?: string;
  generatorModels?: string[];
  evaluatorModels?: string[];
  language?: "zh" | "en";
  userScore?: number;
  userNotes?: string;
  preference?: "new" | "old" | "blend" | "both_bad";
  aiPromptScore?: number | null;
  aiSummary?: string;
  sourceCommits?: string[];
  localTestRunIds?: string[];
}

export const runtime = "nodejs";

function cleanString(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanStringArray(value: unknown, maxItems = 12, maxLength = 160): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];
}

function monthPath(timestamp: number): string {
  const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `data/prompt-feedback/${year}-${month}.jsonl`;
}

function sanitizeFeedback(input: FeedbackPayload) {
  const timestamp = Number.isFinite(Number(input.timestamp)) ? Number(input.timestamp) : Date.now();
  const userScore = Math.max(0, Math.min(100, Number(input.userScore ?? 0)));
  const preference = ["new", "old", "blend", "both_bad"].includes(String(input.preference))
    ? input.preference
    : "new";

  return {
    id: cleanString(input.id, 80) || `${timestamp}`,
    timestamp,
    createdAt: new Date(timestamp).toISOString(),
    userIdea: cleanString(input.userIdea, 8000),
    originalPrompt: cleanString(input.originalPrompt, 8000),
    previousPrompt: cleanString(input.previousPrompt, 12000),
    optimizedPrompt: cleanString(input.optimizedPrompt, 12000),
    selectedPrompt: cleanString(input.selectedPrompt, 12000),
    targetModel: cleanString(input.targetModel, 160),
    generatorModels: cleanStringArray(input.generatorModels),
    evaluatorModels: cleanStringArray(input.evaluatorModels),
    language: input.language === "en" ? "en" : "zh",
    userScore,
    userNotes: cleanString(input.userNotes, 4000),
    preference,
    aiPromptScore: typeof input.aiPromptScore === "number" ? input.aiPromptScore : null,
    aiSummary: cleanString(input.aiSummary, 1000),
    sourceCommits: cleanStringArray(input.sourceCommits, 40, 220),
    localTestRunIds: cleanStringArray(input.localTestRunIds, 20, 120),
  };
}

async function githubJson(url: string, init: RequestInit & { token: string }) {
  const { token, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(rest.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok && res.status !== 404) {
    throw new Error(data?.message || `GitHub API failed: ${res.status}`);
  }
  return { status: res.status, data };
}

async function appendToGithub(feedback: ReturnType<typeof sanitizeFeedback>) {
  const token = process.env.PROMPT_FEEDBACK_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const repository = process.env.PROMPT_FEEDBACK_GITHUB_REPO || process.env.GITHUB_REPOSITORY || "00qq6868-del/ai-prompt-generator";
  const branch = process.env.PROMPT_FEEDBACK_GITHUB_BRANCH || "main";
  if (!token) {
    return {
      synced: false,
      reason: "GitHub token not configured. Feedback was accepted by the API response but only the browser local copy is guaranteed.",
    };
  }

  const filePath = monthPath(feedback.timestamp);
  const apiBase = `https://api.github.com/repos/${repository}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`;
  const existing = await githubJson(`${apiBase}?ref=${encodeURIComponent(branch)}`, {
    method: "GET",
    token,
  });

  let current = "";
  let sha: string | undefined;
  if (existing.status === 200 && typeof existing.data?.content === "string") {
    current = Buffer.from(existing.data.content, "base64").toString("utf8");
    sha = existing.data.sha;
  }

  const next = `${current}${JSON.stringify(feedback)}\n`;
  await githubJson(apiBase, {
    method: "PUT",
    token,
    body: JSON.stringify({
      message: `data: append prompt feedback ${feedback.id} [skip ci]`,
      content: Buffer.from(next, "utf8").toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  return { synced: true, repository, branch, filePath };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const feedback = sanitizeFeedback(body);
    if (!feedback.userIdea || !feedback.optimizedPrompt || !feedback.selectedPrompt) {
      return NextResponse.json(
        { ok: false, error: "Missing feedback fields / 反馈字段不完整" },
        { status: 400 },
      );
    }

    const github = await appendToGithub(feedback);
    return NextResponse.json({ ok: true, feedbackId: feedback.id, github });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Feedback save failed / 反馈保存失败" },
      { status: 500 },
    );
  }
}
