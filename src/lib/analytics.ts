"use client";

type MetricName = "LCP" | "CLS" | "TTFB" | "INP" | "api_call" | "ttft" | "error";

interface Metric {
  name: MetricName;
  value: number;
  rating?: "good" | "needs-improvement" | "poor";
  path?: string;
  meta?: Record<string, string | number>;
  ts: number;
}

const QUEUE: Metric[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 10_000;
const MAX_BATCH = 20;

function enqueue(m: Metric) {
  QUEUE.push(m);
  if (QUEUE.length >= MAX_BATCH) flush();
  else if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_INTERVAL);
  }
}

function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (QUEUE.length === 0) return;

  const batch = QUEUE.splice(0, MAX_BATCH);
  const body = JSON.stringify(batch);

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics", body);
  } else {
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}

// ── Web Vitals ────────────────────────────────────────────────
export function reportWebVitals(metric: {
  name: string;
  value: number;
  rating?: string;
}) {
  const allowed = ["LCP", "CLS", "TTFB", "INP"];
  if (!allowed.includes(metric.name)) return;

  enqueue({
    name: metric.name as MetricName,
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    rating: metric.rating as Metric["rating"],
    path: typeof window !== "undefined" ? window.location.pathname : undefined,
    ts: Date.now(),
  });
}

// ── API call tracking ─────────────────────────────────────────
export function trackApiCall(opts: {
  endpoint: string;
  latencyMs: number;
  success: boolean;
  status?: number;
}) {
  enqueue({
    name: "api_call",
    value: opts.latencyMs,
    meta: {
      endpoint: opts.endpoint,
      success: opts.success ? 1 : 0,
      status: opts.status ?? 0,
    },
    ts: Date.now(),
  });
}

// ── Time to First Token ───────────────────────────────────────
export function trackTTFT(ttftMs: number, model: string) {
  enqueue({
    name: "ttft",
    value: Math.round(ttftMs),
    meta: { model },
    ts: Date.now(),
  });
}

// ── Error tracking ────────────────────────────────────────────
export function trackError(error: string, componentStack?: string) {
  enqueue({
    name: "error",
    value: 1,
    meta: {
      error: error.slice(0, 200),
      stack: (componentStack ?? "").slice(0, 300),
    },
    path: typeof window !== "undefined" ? window.location.pathname : undefined,
    ts: Date.now(),
  });
}

// ── Init: flush on page hide ──────────────────────────────────
export function initAnalytics() {
  if (typeof window === "undefined") return;
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}
