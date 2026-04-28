const STORAGE_KEY = "ai_prompt_history";
const MAX_ITEMS = 100;

export interface HistoryItem {
  id: string;
  timestamp: number;
  userIdea: string;
  optimizedPrompt: string;
  targetModel: string;
  generatorModel: string;
  language: "zh" | "en";
  isFavorite: boolean;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(items: HistoryItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function saveHistory(item: Omit<HistoryItem, "id" | "timestamp" | "isFavorite">): void {
  const items = getHistory();
  items.unshift({
    ...item,
    id: generateId(),
    timestamp: Date.now(),
    isFavorite: false,
  });
  if (items.length > MAX_ITEMS) {
    const nonFav = items.filter(i => !i.isFavorite);
    if (nonFav.length > 0) {
      const oldest = nonFav[nonFav.length - 1];
      const idx = items.indexOf(oldest);
      items.splice(idx, 1);
    } else {
      items.pop();
    }
  }
  saveAll(items);
}

export function toggleFavorite(id: string): HistoryItem[] {
  const items = getHistory();
  const item = items.find(i => i.id === id);
  if (item) item.isFavorite = !item.isFavorite;
  saveAll(items);
  return items;
}

export function deleteHistory(id: string): HistoryItem[] {
  const items = getHistory().filter(i => i.id !== id);
  saveAll(items);
  return items;
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
