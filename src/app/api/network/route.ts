// src/app/api/network/route.ts
// GET /api/network — server-side connectivity check
// [S6 FIX] uses HEAD instead of GET — no response body downloaded

import { NextResponse } from "next/server";
import axios from "axios";

const PROBES = [
  "https://www.google.com",
  "https://www.baidu.com",
  "https://api.openai.com",
];

export async function GET() {
  const results = await Promise.allSettled(
    PROBES.map((url) =>
      // [S6 FIX] HEAD request — only checks connectivity, no body download
      axios.head(url, { timeout: 3000 }).then(() => ({ url, ok: true }))
    )
  );

  const reachable = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<{ url: string; ok: boolean }>).value.url);

  const online       = reachable.length > 0;
  const globalAccess = reachable.includes("https://www.google.com") ||
                       reachable.includes("https://api.openai.com");
  const chinaAccess  = reachable.includes("https://www.baidu.com");

  return NextResponse.json({
    online,
    globalAccess,
    chinaAccess,
    reachable,
    checkedAt: new Date().toISOString(),
  });
}
