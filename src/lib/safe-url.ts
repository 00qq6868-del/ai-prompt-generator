export function validatePublicHttpUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      "Invalid Base URL format. 无效的 Base URL 格式，请检查是否以 https:// 开头",
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Base URL must use HTTP(S). Base URL 必须使用 HTTP 或 HTTPS 协议");
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    host === "metadata.google.internal" ||
    host.endsWith(".internal")
  ) {
    throw new Error("Base URL must not point to private/internal networks. Base URL 不能指向内网地址");
  }

  return parsed.toString().replace(/\/+$/, "");
}

export function normalizeOpenAIBaseUrl(rawUrl: string): string {
  let url = validatePublicHttpUrl(rawUrl.trim());
  if (!url.endsWith("/v1")) {
    url += "/v1";
  }
  return url;
}
