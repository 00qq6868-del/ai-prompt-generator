"use client";

import { Wifi, WifiOff, Globe, ChevronDown, RefreshCw } from "lucide-react";
import { useNetwork } from "@/hooks/useNetwork";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

export function NetworkStatus() {
  const { status, recheck } = useNetwork(30_000);
  const [open, setOpen] = useState(false);

  const dot = status.checking
    ? "bg-yellow-400 animate-pulse"
    : status.online
    ? "bg-emerald-400"
    : "bg-red-500";

  const label = status.checking
    ? "检测中…"
    : status.online
    ? "已连接"
    : "离线";

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((o) => !o); recheck(); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-sm text-white/80 transition-all"
      >
        {status.online ? (
          <Wifi size={14} className="text-emerald-400" />
        ) : (
          <WifiOff size={14} className="text-red-400" />
        )}
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <span>{label}</span>
        {status.effectiveType && (
          <span className="text-white/65 text-xs">{status.effectiveType.toUpperCase()}</span>
        )}
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute right-0 top-10 z-50 w-64 rounded-2xl bg-gray-900/95 border border-white/10 shadow-2xl p-4 text-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-semibold">网络状态</span>
              <button
                onClick={recheck}
                className="text-white/50 hover:text-white transition-colors"
              >
                <RefreshCw size={13} className={status.checking ? "animate-spin" : ""} />
              </button>
            </div>

            <Row label="浏览器在线" ok={status.online} />
            <Row label="全球访问 (OpenAI / Google)" ok={status.globalAccess} />
            <Row label="国内访问 (百度 / 国产模型)" ok={status.chinaAccess} />

            {status.downlink !== undefined && (
              <div className="mt-2 text-white/65 text-xs">
                网速：{status.downlink} Mbps
              </div>
            )}

            {status.lastChecked && (
              <div className="mt-1 text-white/70 text-xs">
                更新于 {status.lastChecked.toLocaleTimeString()}
              </div>
            )}

            {!status.online && (
              <div className="mt-3 p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                💡 请连接 WiFi 或开启手机热点，网络恢复后会自动重试
              </div>
            )}
            {status.online && !status.globalAccess && (
              <div className="mt-3 p-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs">
                ⚠️ 无法访问海外服务，建议使用国产模型（DeepSeek / Qwen / Kimi）
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5">
      <span className="text-white/70 flex items-center gap-1.5">
        <Globe size={11} />
        {label}
      </span>
      <span className={`text-xs font-medium ${ok ? "text-emerald-400" : "text-red-400"}`}>
        {ok ? "✓ 正常" : "✗ 不可达"}
      </span>
    </div>
  );
}
