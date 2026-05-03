import { Header } from "@/components/Header";
import { ArrowLeft, Download, ExternalLink, Github, Monitor, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";

const releaseUrl = "https://github.com/00qq6868-del/ai-prompt-generator/releases/latest";

export default function DownloadPage() {
  return (
    <main className="relative min-h-dvh overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 -right-40 h-[560px] w-[560px] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[120px]" />
      </div>

      <Header />

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 pb-20">
        <a
          href="/"
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-medium text-white/70 hover:border-white/20 hover:text-white"
        >
          <ArrowLeft size={14} />
          返回首页
        </a>

        <section className="mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/8 px-3 py-1.5 text-xs text-indigo-300">
            <Monitor size={13} />
            桌面版 Desktop app
          </div>
          <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            下载 AI 提示词生成器
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
            Windows 桌面版保留网页端的模型选择、提示词优化、历史记录和本地 Key 存储体验，适合固定在电脑上长期使用。
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-5 shadow-2xl shadow-black/30">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2 text-white">
                  <PackageCheck size={18} className="text-indigo-300" />
                  <h2 className="text-lg font-bold">Windows 安装包</h2>
                </div>
                <p className="text-sm leading-6 text-white/65">
                  自动获取 GitHub Releases 中最新的 `.exe` 安装包。
                </p>
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                x64
              </span>
            </div>

            <div className="mb-5 grid gap-2 sm:grid-cols-3">
              {[
                { icon: <ShieldCheck size={14} />, label: "本地安装" },
                { icon: <RefreshCw size={14} />, label: "随版本更新" },
                { icon: <Github size={14} />, label: "开源发布" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2 text-xs text-white/70">
                  <span className="text-indigo-300">{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href="/api/download/windows"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400"
              >
                <Download size={16} />
                下载 Windows 版
              </a>
              <a
                href={releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-medium text-white/70 hover:border-white/20 hover:text-white"
              >
                <ExternalLink size={16} />
                查看发布页
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <h2 className="mb-3 text-base font-bold text-white">版本信息</h2>
            <div className="space-y-3 text-sm text-white/70">
              <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
                <span>当前版本</span>
                <span className="font-mono text-white/85">1.0.0</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
                <span>平台</span>
                <span className="text-white/85">Windows x64</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>发布源</span>
                <span className="text-white/85">GitHub Releases</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
