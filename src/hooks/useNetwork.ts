"use client";
// src/hooks/useNetwork.ts — real-time network status with auto-reconnect

import { useEffect, useState, useCallback } from "react";

export interface NetworkStatus {
  online: boolean;
  globalAccess: boolean;
  chinaAccess: boolean;
  effectiveType?: string;  // "4g" | "3g" | "2g" | "slow-2g"
  downlink?: number;       // Mbps
  checking: boolean;
  lastChecked: Date | null;
}

const DEFAULT: NetworkStatus = {
  online: true,   // Fixed: always use safe server-compatible default; useEffect corrects this immediately on client
  globalAccess: false,
  chinaAccess: false,
  checking: false,
  lastChecked: null,
};

export function useNetwork(pollingMs = 30_000) {
  const [status, setStatus] = useState<NetworkStatus>(DEFAULT);

  const check = useCallback(async () => {
    setStatus((s) => ({ ...s, checking: true }));
    try {
      const res = await fetch("/api/network", { cache: "no-store" });
      const data = await res.json();

      // Also read Network Information API if available
      const conn = (navigator as any).connection ?? (navigator as any).mozConnection;
      setStatus({
        online: data.online,
        globalAccess: data.globalAccess,
        chinaAccess: data.chinaAccess,
        effectiveType: conn?.effectiveType,
        downlink: conn?.downlink,
        checking: false,
        lastChecked: new Date(),
      });
    } catch {
      setStatus((s) => ({
        ...s,
        online: navigator.onLine,
        checking: false,
        lastChecked: new Date(),
      }));
    }
  }, []);

  useEffect(() => {
    check();

    const id = setInterval(check, pollingMs);
    const onOnline  = () => check();
    const onOffline = () => setStatus((s) => ({ ...s, online: false }));

    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);

    // Network Information API change event
    const conn = (navigator as any).connection ?? (navigator as any).mozConnection;
    conn?.addEventListener("change", check);

    return () => {
      clearInterval(id);
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
      conn?.removeEventListener("change", check);
    };
  }, [check, pollingMs]);

  return { status, recheck: check };
}
