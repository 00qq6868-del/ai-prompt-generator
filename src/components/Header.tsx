"use client";

import { Sparkles, QrCode, X, ExternalLink, KeyRound } from "lucide-react";
import { NetworkStatus } from "./NetworkStatus";
import { KeysSettings } from "./KeysSettings";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Header() {
  const [showQR, setShowQR]     = useState(false);
  const [showKeys, setShowKeys] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-black/30 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <Sparkles size={16} className="text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white leading-tight">AI 提示词生成器</h1>
          <p className="text-[10px] text-white/30 leading-tight">250+ 大模型 · 4 种优化模式 · 自动更新</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <NetworkStatus />

        {/* API Key settings */}
        <button
          onClick={() => setShowKeys(true)}
          title="配置 API Key"
          className="text-white/30 hover:text-violet-400 transition-colors"
        >
          <KeyRound size={16} />
        </button>

        {/* QR Code — only on desktop, phones scan rather than show */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => setShowQR((v) => !v)}
            title="扫码在手机上打开"
            className="text-white/30 hover:text-white transition-colors"
          >
            <QrCode size={16} />
          </button>

          <AnimatePresence>
            {showQR && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -8 }}
                className="absolute right-0 top-8 z-50 rounded-2xl bg-gray-900/95 border border-white/10 shadow-2xl p-4 w-52"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-white/60 font-medium">手机扫码访问</span>
                  <button
                    onClick={() => setShowQR(false)}
                    className="text-white/30 hover:text-white transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/api/qr"
                  alt="LAN QR Code"
                  className="w-full rounded-xl bg-white p-1"
                  width={180}
                  height={180}
                />
                <p className="text-[10px] text-white/30 text-center mt-2">
                  确保手机与电脑在同一 WiFi
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <a
          href="https://github.com/00qq6868-del/ai-prompt-generator"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/30 hover:text-white transition-colors"
        >
          <ExternalLink size={16} />
        </a>
      </div>

      <KeysSettings open={showKeys} onClose={() => setShowKeys(false)} />
    </header>
  );
}
