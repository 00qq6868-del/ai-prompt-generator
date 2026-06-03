import { makeId } from "../repositories/local-store.js";

export function okJson(data: unknown, extra: Record<string, unknown> = {}) {
  return Response.json({
    ok: true,
    traceId: makeId(),
    data,
    warnings: [],
    ...extra,
  });
}

export function errorJson(code: string, messageZh: string, messageEn: string, status = 400, retryable = false) {
  return Response.json({
    ok: false,
    traceId: makeId(),
    error: { code, messageZh, messageEn, retryable },
  }, { status });
}
