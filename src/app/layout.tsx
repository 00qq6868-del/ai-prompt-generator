import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { PWAPrompts } from "@/components/PWAPrompts";

export const metadata: Metadata = {
  title: "AI 提示词生成器",
  description:
    "支持 GPT-5、Claude、Gemini、Grok、Llama、DeepSeek、Kimi、Qwen 等 230+ 大模型的智能提示词优化生成器",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AI Prompt",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#060610",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body suppressHydrationWarning>
        {children}
        <PWAPrompts />
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "rgba(15,15,30,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff",
              borderRadius: "12px",
              fontSize: "13px",
              backdropFilter: "blur(20px)",
            },
          }}
        />
      </body>
    </html>
  );
}
