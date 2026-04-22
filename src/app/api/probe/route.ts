import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { baseUrl, apiKey } = await req.json();

    if (!baseUrl?.trim() || !apiKey?.trim()) {
      return NextResponse.json(
        { error: "需要提供 Base URL 和 API Key" },
        { status: 400 }
      );
    }

    let url = baseUrl.trim().replace(/\/+$/, "");
    if (!url.endsWith("/v1")) {
      url += "/v1";
    }

    const res = await fetch(`${url}/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          { error: "API Key 无效或已过期，请检查后重试" },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: `中转站返回错误 (${res.status}): ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const modelIds: string[] = [];

    if (Array.isArray(data?.data)) {
      for (const m of data.data) {
        if (m.id && typeof m.id === "string") {
          modelIds.push(m.id);
        }
      }
    } else if (Array.isArray(data)) {
      for (const m of data) {
        if (m.id && typeof m.id === "string") {
          modelIds.push(m.id);
        }
      }
    }

    return NextResponse.json({
      models: modelIds.sort(),
      total: modelIds.length,
      baseUrl: url,
    });
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return NextResponse.json(
        { error: "探测超时（8秒），请检查 Base URL 是否正确" },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: err?.message ?? "探测失败" },
      { status: 500 }
    );
  }
}
