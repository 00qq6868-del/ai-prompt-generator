import { WifiOff, RefreshCw } from "lucide-react";

export const metadata = {
  title: "离线 — AI 提示词生成器",
};

export default function OfflinePage() {
  return (
    <main className="relative min-h-dvh flex items-center justify-center overflow-hidden">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-[120px]" />
      </div>

      <div className="relative z-10 text-center px-6 max-w-md">
        <div className="flex justify-center mb-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/5 border border-white/10">
            <WifiOff size={36} className="text-white/40" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">
          当前没有网络连接
        </h1>
        <p className="text-white/40 text-sm mb-2">
          You are currently offline
        </p>
        <p className="text-white/30 text-xs leading-relaxed mb-8">
          提示词生成需要调用 AI 接口，请检查你的网络连接后重试。
          <br />
          已缓存的页面和模型列表仍然可用。
        </p>

        <a
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-indigo-500/25"
        >
          <RefreshCw size={14} />
          重试 Retry
        </a>

        <p className="mt-6 text-[11px] text-white/20">
          www.myprompt.asia
        </p>
      </div>
    </main>
  );
}
