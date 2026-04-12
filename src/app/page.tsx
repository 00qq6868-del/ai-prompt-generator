import { Header } from "@/components/Header";
import { PromptGenerator } from "@/components/PromptGenerator";
import { Sparkles, Zap, Target, Coins, MessageSquareHeart } from "lucide-react";

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
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-1.5 text-xs text-indigo-300 mb-5">
            <Sparkles size={12} />
            <span>11+ 大模型 · 4 种优化维度 · 自动追踪最新模型</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            <span className="bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">
              AI 提示词生成器
            </span>
          </h1>
          <p className="text-white/50 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            输入你的想法，选择目标模型和优化目标，由 AI 自动为你生成{" "}
            <strong className="text-white/70">最省 Token · 最准确 · 最快 · 最自然</strong>{" "}
            的专属提示词
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {[
              { icon: <Coins size={11} />, label: "省Token", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
              { icon: <Target size={11} />, label: "高精度", color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
              { icon: <Zap size={11} />,   label: "极速响应", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
              { icon: <MessageSquareHeart size={11} />, label: "人类对齐", color: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
            ].map(({ icon, label, color }) => (
              <span
                key={label}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${color}`}
              >
                {icon}
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Main card */}
        <div className="rounded-3xl border border-white/8 bg-white/3 backdrop-blur-xl p-5 sm:p-7 shadow-2xl shadow-black/50">
          <PromptGenerator />
        </div>

        {/* Provider logos row */}
        <div className="mt-8 text-center">
          <p className="text-xs text-white/25 mb-3">支持的模型提供商</p>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            {[
              "OpenAI", "Anthropic", "Google", "Meta",
              "xAI", "Mistral", "DeepSeek", "智谱AI",
              "月之暗面 Kimi", "阿里 Qwen", "百度 ERNIE",
            ].map((name) => (
              <span key={name} className="text-xs text-white/30 font-medium">
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
