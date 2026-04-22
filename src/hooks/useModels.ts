"use client";
// src/hooks/useModels.ts — fetch & cache model list, auto-refresh

import { useEffect, useState, useCallback, useRef } from "react";
import { ModelInfo, OptimizationMode } from "@/lib/models-registry";

interface UseModelsResult {
  models: ModelInfo[];
  recommended: ModelInfo[];
  grouped: Record<string, ModelInfo[]>;
  loading: boolean;
  source: string;
  updatedAt: string;
  refresh: () => void;
}

export function useModels(mode: OptimizationMode): UseModelsResult {
  const [models, setModels]     = useState<ModelInfo[]>([]);
  const [rec, setRec]           = useState<ModelInfo[]>([]);
  const [grouped, setGrouped]   = useState<Record<string, ModelInfo[]>>({});
  const [loading, setLoading]   = useState(true);
  const [source, setSource]     = useState("bundled");
  const [updatedAt, setUpdatedAt] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      try {
        const url = `/api/models?mode=${mode}${forceRefresh ? "&refresh=1" : ""}`;
        const res  = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`模型列表加载失败 Failed to load models (${res.status})`);
        const data = await res.json();
        setModels(data.models ?? []);
        setRec(data.recommended ?? []);
        setGrouped(data.grouped ?? {});
        setSource(data.source ?? "bundled");
        setUpdatedAt(data.updatedAt ?? "");
      } catch (e) {
        console.warn("Failed to load models", e);
      } finally {
        setLoading(false);
      }
    },
    [mode]
  );

  useEffect(() => {
    load();
    // Auto-refresh every hour
    timerRef.current = setInterval(() => load(true), 3_600_000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  return {
    models,
    recommended: rec,
    grouped,
    loading,
    source,
    updatedAt,
    refresh: () => load(true),
  };
}
