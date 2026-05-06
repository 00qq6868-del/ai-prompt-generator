function rawErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function statusFromError(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const e = err as {
    status?: number;
    code?: number | string;
    response?: { status?: number };
  };
  if (typeof e.status === "number") return e.status;
  if (typeof e.response?.status === "number") return e.response.status;
  if (typeof e.code === "number") return e.code;
  return undefined;
}

export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, "Bearer ***")
    .replace(/api[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}/gi, "apiKey=***")
    .slice(0, 700);
}

function isAlreadyBilingual(message: string): boolean {
  return /[\u3400-\u9fff]/.test(message) && /[A-Za-z]/.test(message);
}

export function toUserFacingErrorMessage(err: unknown): string {
  const raw = sanitizeErrorMessage(rawErrorMessage(err));
  const lower = raw.toLowerCase();
  const status = statusFromError(err);

  if (
    raw.includes("网络连接或中转站上游中断") ||
    raw.includes("模型响应超时") ||
    raw.includes("服务器保存记录失败") ||
    raw.includes("API Key 无效或未授权") ||
    raw.includes("当前 API Key 无权访问") ||
    raw.includes("所选模型在当前 API") ||
    raw.includes(STREAM_INTERRUPTED_WITHOUT_OUTPUT) ||
    raw.includes(STREAM_INTERRUPTED_WITH_PARTIAL_OUTPUT)
  ) {
    return raw;
  }

  if (lower.includes(".local-data") || lower.includes("/var/task")) {
    return "服务器保存记录失败，但生成结果不应因此丢失；请刷新后重试。如果再次出现，请联系我检查生产环境持久化配置。 / Server-side history save failed, but generated content should not be lost. Refresh and retry; if it repeats, production persistence needs configuration.";
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("network error") ||
    lower.includes("load failed") ||
    lower.includes("unexpected eof") ||
    lower.includes("0 bytes from the transport stream") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("socket hang up") ||
    lower.includes("connection terminated") ||
    lower.includes("terminated") ||
    lower.includes("und_err") ||
    lower.includes("aborted")
  ) {
    return `网络连接或中转站上游中断，已记录失败模型并自动冷却，避免立刻重复消耗。请稍后重试或换一个健康模型。 / Network or relay upstream interrupted. The failed model is cooled down to avoid repeated token waste; retry later or choose a healthy model. Detail: ${raw}`;
  }

  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("超时")) {
    return `模型响应超时，已把该模型临时冷却；慢模型会等待，但持续无输出会自动跳过。 / Model response timed out. Slow responsive models are waited for, but silent models are cooled down and skipped. Detail: ${raw}`;
  }

  if (status === 429 || lower.includes("rate limit") || lower.includes("too many requests") || lower.includes("限流")) {
    return `接口限流或中转站繁忙，已暂停重复调用该模型。请等一会儿再试，或切换模型。 / Rate limit or relay overload. Repeated calls to this model are paused; wait and retry or switch models. Detail: ${raw}`;
  }

  if (
    status === 401 ||
    lower.includes("invalid api key") ||
    lower.includes("incorrect api key") ||
    lower.includes("unauthorized") ||
    lower.includes("authentication")
  ) {
    return `API Key 无效或未授权，请检查钥匙设置。 / API Key is invalid or unauthorized; please check the key settings. Detail: ${raw}`;
  }

  if (
    status === 403 ||
    lower.includes("permission denied") ||
    lower.includes("access denied") ||
    lower.includes("无权访问") ||
    lower.includes("权限")
  ) {
    return `当前 API Key 无权访问所选模型，请换一个模型或确认中转站套餐权限。 / The current API Key cannot access the selected model; choose another model or check relay plan permissions. Detail: ${raw}`;
  }

  if (
    status === 404 ||
    lower.includes("model_not_found") ||
    lower.includes("model not found") ||
    lower.includes("does not exist") ||
    lower.includes("invalid model") ||
    lower.includes("不存在")
  ) {
    return `所选模型在当前 API 或中转站里不可用，已建议切换健康模型。 / The selected model is unavailable in this API or relay; switch to a healthy model. Detail: ${raw}`;
  }

  if (isAlreadyBilingual(raw)) return raw;
  return `生成失败：${raw} / Generation failed: ${raw}`;
}

export const STREAM_INTERRUPTED_WITHOUT_OUTPUT =
  "网络连接提前中断，且没有收到可保留的生成内容；失败模型已冷却，请稍后重试或换一个模型。 / The connection ended before any usable output arrived. The failed model was cooled down; retry later or choose another model.";

export const STREAM_INTERRUPTED_WITH_PARTIAL_OUTPUT =
  "网络连接提前中断，但已保留收到的部分结果，避免白白丢掉本次输出。 / The connection ended early, but the partial result was preserved instead of being discarded.";
