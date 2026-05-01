"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, RefreshCw } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAPrompts() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const wasDismissed = sessionStorage.getItem("pwa-install-dismissed");
    if (wasDismissed) setDismissed(true);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      if (!wasDismissed) setShowInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setShowUpdate(true);
            }
          });
        });
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installEvent) return;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") {
      setShowInstall(false);
      setInstallEvent(null);
    }
  }, [installEvent]);

  const handleDismissInstall = () => {
    setShowInstall(false);
    setDismissed(true);
    sessionStorage.setItem("pwa-install-dismissed", "1");
  };

  const handleUpdate = () => {
    setShowUpdate(false);
    window.location.reload();
  };

  return (
    <>
      {/* Install banner */}
      <AnimatePresence>
        {showInstall && !dismissed && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-indigo-500/20 bg-[#0d0f1a]/95 backdrop-blur-xl px-4 py-3 shadow-2xl shadow-black/50">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15">
                <Download size={18} className="text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">
                  安装到桌面 Install App
                </p>
                <p className="text-[11px] text-white/40 truncate">
                  添加到主屏幕，像原生应用一样使用
                </p>
              </div>
              <button
                onClick={handleInstall}
                className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
              >
                安装
              </button>
              <button
                onClick={handleDismissInstall}
                aria-label="关闭 Dismiss"
                className="shrink-0 p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/10 transition-all"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Update notification */}
      <AnimatePresence>
        {showUpdate && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-4 left-4 right-4 z-50 mx-auto max-w-lg"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-[#0d0f1a]/95 backdrop-blur-xl px-4 py-3 shadow-2xl shadow-black/50">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
                <RefreshCw size={18} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">
                  有新版本可用 Update Available
                </p>
                <p className="text-[11px] text-white/40">
                  刷新页面以加载最新版本
                </p>
              </div>
              <button
                onClick={handleUpdate}
                className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                刷新
              </button>
              <button
                onClick={() => setShowUpdate(false)}
                aria-label="稍后 Later"
                className="shrink-0 p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/10 transition-all"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
