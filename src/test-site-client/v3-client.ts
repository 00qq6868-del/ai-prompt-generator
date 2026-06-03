export interface V3ClientOptions {
  baseUrl?: string;
  storageKey?: string;
}

export interface TestRunPayload {
  eventId: string;
  promptId?: string;
  promptVersionId?: string;
  originalPrompt: string;
  optimizedPrompt: string;
  targetModelId: string;
  externalScore?: number | null;
}

export interface FeedbackPayload {
  eventId: string;
  promptId: string;
  promptVersionId: string;
  userScore: number;
  starRating: number;
  preference: "new_better" | "old_better" | "blend_needed" | "both_bad";
  userNotes: string;
  artifactType?: "text_prompt" | "image_prompt" | "workbench_task" | "system_prompt" | "rag_prompt";
  targetModelId?: string;
}

type QueueItem =
  | { kind: "test-run"; payload: TestRunPayload }
  | { kind: "feedback"; payload: FeedbackPayload };

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export class V3TestClient {
  private baseUrl: string;
  private storageKey: string;

  constructor(options: V3ClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.storageKey = options.storageKey ?? "ai_prompt_v3_offline_queue";
  }

  private readQueue(): QueueItem[] {
    if (!canUseStorage()) return [];
    try {
      const raw = localStorage.getItem(this.storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeQueue(items: QueueItem[]): void {
    if (!canUseStorage()) return;
    localStorage.setItem(this.storageKey, JSON.stringify(items.slice(0, 500)));
  }

  private enqueue(item: QueueItem): void {
    this.writeQueue([item, ...this.readQueue()]);
  }

  async createTestRun(payload: TestRunPayload): Promise<unknown> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v3/test-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`test-run failed ${res.status}`);
      return res.json();
    } catch (error) {
      this.enqueue({ kind: "test-run", payload });
      return { ok: false, queued: true, error: String(error) };
    }
  }

  async submitFeedback(payload: FeedbackPayload): Promise<unknown> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v3/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`feedback failed ${res.status}`);
      return res.json();
    } catch (error) {
      this.enqueue({ kind: "feedback", payload });
      return { ok: false, queued: true, error: String(error) };
    }
  }

  async flushOfflineQueue(): Promise<{ attempted: number; remaining: number }> {
    const queue = this.readQueue().reverse();
    const remaining: QueueItem[] = [];
    for (const item of queue) {
      try {
        if (item.kind === "test-run") {
          const res = await fetch(`${this.baseUrl}/api/v3/test-runs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.payload),
          });
          if (!res.ok) throw new Error(`test-run failed ${res.status}`);
        } else {
          const res = await fetch(`${this.baseUrl}/api/v3/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.payload),
          });
          if (!res.ok) throw new Error(`feedback failed ${res.status}`);
        }
      } catch {
        remaining.push(item);
      }
    }
    this.writeQueue(remaining.reverse());
    return { attempted: queue.length, remaining: remaining.length };
  }
}
