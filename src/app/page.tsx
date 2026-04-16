import { Header } from "@/components/Header";
import { PromptGenerator } from "@/components/PromptGenerator";
import { Zap, Target, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <main className="relative min-h-dvh overflow-x-hidden">
      {/* Ambient background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-purple-600/5 blur-[80px]" />
      </div>

      <Header />

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-8 pb-20">
        {/* Hero */}
        <div className="text-center mb-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/8 px-4 py-1.5 text-xs text-indigo-300 mb-5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-400" />
            </span>
            <span>11+ 大模型 · CO-STAR 框架 · 自动追踪最新模型</span>
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            <span className="bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">
              AI 提示词生成器
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-white/45 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
            输入你的想法，AI 自动应用业界最佳提示词框架，生成{" "}
            <span className="text-white/70 font-medium">更准确 · 更省 Token · 更自然</span>{" "}
            的专属提示词
          </p>

          {/* Feature cards — 3 items, Raycast-style */}
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            {[
              {
                icon: <Zap size={13} className="text-blue-400" />,
                label: "极速生成",
                desc: "秒级响应",
                color: "border-blue-500/15 bg-blue-500/5",
              },
              {
                icon: <Target size={13} className="text-violet-400" />,
                label: "CO-STAR 框架",
                desc: "业界最佳实践",
                color: "border-violet-500/15 bg-violet-500/5",
              },
              {
                icon: <ShieldCheck size={13} className="text-green-400" />,
                label: "本地存储",
                desc: "Key 不离开你的浏览器",
                color: "border-green-500/15 bg-green-500/5",
              },
            ].map(({ icon, label, desc, color }) => (
              <div
                key={label}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${color} backdrop-blur-sm`}
              >
                {icon}
                <div className="text-left">
                  <div className="text-[11px] font-semibold text-white/80">{label}</div>
                  <div className="text-[10px] text-white/35">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main card */}
        <div className="rounded-3xl border border-white/8 bg-white/[0.025] backdrop-blur-xl p-5 sm:p-7 shadow-2xl shadow-black/50">
          <PromptGenerator />
        </div>

        {/* Provider logos row */}
        <div className="mt-8 text-center">
          <p className="text-xs text-white/20 mb-3">支持的模型提供商</p>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
            {[
              "OpenAI", "Anthropic", "Google", "Meta",
              "xAI", "Mistral", "DeepSeek", "智谱AI",
              "月之暗面 Kimi", "阿里 Qwen", "百度 ERNIE",
            ].map((name) => (
              <span key={name} className="text-[11px] text-white/25 font-medium">
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
