import { Header } from "@/components/Header";
import { ArrowLeft, Apple, Download, ExternalLink, Github, HardDriveDownload, Monitor, PackageCheck, RefreshCw, ShieldCheck, Smartphone, Usb } from "lucide-react";

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
            桌面版在本机启动完整应用服务，不依赖本站域名持续可用。只要设备能联网访问你的 API、中转站或模型服务，就能继续生成提示词。便携包按系统分别下载，U 盘可携带对应系统版本。
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-5 shadow-2xl shadow-black/30">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2 text-white">
                  <PackageCheck size={18} className="text-indigo-300" />
                  <h2 className="text-lg font-bold">Windows 安装包</h2>
                </div>
                <p className="text-sm leading-6 text-white/65">
                  推荐长期安装在自己的电脑上使用，自动获取 GitHub Releases 中最新的安装包。
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
                下载安装版
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

          <div className="rounded-2xl border border-sky-500/20 bg-sky-950/15 p-5 shadow-2xl shadow-black/30">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2 text-white">
                  <Apple size={18} className="text-sky-300" />
                  <h2 className="text-lg font-bold">macOS 桌面版</h2>
                </div>
                <p className="text-sm leading-6 text-white/65">
                  DMG 用于正常安装，ZIP 可作为 macOS 便携包保存到移动硬盘或 U 盘。
                </p>
              </div>
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-300">
                Universal
              </span>
            </div>

            <div className="mb-5 grid gap-2 sm:grid-cols-3">
              {[
                { icon: <Apple size={14} />, label: "macOS" },
                { icon: <HardDriveDownload size={14} />, label: "DMG / ZIP" },
                { icon: <ShieldCheck size={14} />, label: "本地运行" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2 text-xs text-white/70">
                  <span className="text-sky-300">{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href="/api/download/mac"
                className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 hover:bg-sky-400"
              >
                <Download size={16} />
                下载 Mac 版
              </a>
              <a
                href="/api/download/mac/portable"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-medium text-white/70 hover:border-white/20 hover:text-white"
              >
                <Usb size={16} />
                Mac 便携 ZIP
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 shadow-2xl shadow-black/30">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2 text-white">
                  <Monitor size={18} className="text-white/70" />
                  <h2 className="text-lg font-bold">Linux 便携版</h2>
                </div>
                <p className="text-sm leading-6 text-white/65">
                  AppImage 单文件运行，适合 Linux 桌面系统和移动硬盘携带。
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[11px] font-medium text-white/70">
                AppImage
              </span>
            </div>

            <div className="mb-5 grid gap-2 sm:grid-cols-3">
              {[
                { icon: <HardDriveDownload size={14} />, label: "单文件" },
                { icon: <Usb size={14} />, label: "可携带" },
                { icon: <Github size={14} />, label: "Release" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2 text-xs text-white/70">
                  <span className="text-white/75">{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>

            <a
              href="/api/download/linux"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/80 hover:border-white/20 hover:bg-white/[0.09]"
            >
              <Download size={16} />
              下载 Linux AppImage
            </a>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/15 p-5 shadow-2xl shadow-black/30">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2 text-white">
                  <Usb size={18} className="text-emerald-300" />
                  <h2 className="text-lg font-bold">Windows 便携版</h2>
                </div>
                <p className="text-sm leading-6 text-white/65">
                  单文件运行，适合放进 U 盘。Key 和窗口状态保存在同目录数据文件夹。
                </p>
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                Portable
              </span>
            </div>

            <div className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {[
                { icon: <HardDriveDownload size={14} />, label: "无需安装" },
                { icon: <Usb size={14} />, label: "可 U 盘携带" },
                { icon: <ShieldCheck size={14} />, label: "本地 Key" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2 text-xs text-white/70">
                  <span className="text-emerald-300">{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href="/api/download/windows/portable"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
              >
                <Download size={16} />
                下载便携版
              </a>
              <a
                href={releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-medium text-white/70 hover:border-white/20 hover:text-white"
              >
                <ExternalLink size={16} />
                发布页
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-violet-500/20 bg-violet-950/15 p-5 shadow-2xl shadow-black/30">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2 text-white">
                  <Smartphone size={18} className="text-violet-300" />
                  <h2 className="text-lg font-bold">Android 手机版</h2>
                </div>
                <p className="text-sm leading-6 text-white/65">
                  当前先提供 PWA 安装：安卓 Chrome 打开本站后可“添加到主屏幕”。原生 APK 会在 Android 打包链完成后加入发布页。
                </p>
              </div>
              <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300">
                PWA
              </span>
            </div>

            <div className="mb-5 grid gap-2 sm:grid-cols-3">
              {[
                { icon: <Smartphone size={14} />, label: "安卓可装" },
                { icon: <RefreshCw size={14} />, label: "离线缓存" },
                { icon: <Github size={14} />, label: "APK 待构建" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2 text-xs text-white/70">
                  <span className="text-violet-300">{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>

            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 hover:bg-violet-400"
            >
              <Smartphone size={16} />
              打开并安装 PWA
            </a>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 lg:col-span-2">
            <h2 className="mb-3 text-base font-bold text-white">版本信息</h2>
            <div className="space-y-3 text-sm text-white/70">
              <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
                <span>当前版本</span>
                <span className="font-mono text-white/85">1.0.0</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
                <span>平台</span>
                <span className="text-white/85">Windows x64 / macOS universal / Linux AppImage / Android PWA</span>
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
