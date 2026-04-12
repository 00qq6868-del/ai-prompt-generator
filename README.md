# AI 提示词生成器 🚀

> 支持 **11+ 大模型** · 4 种优化维度 · PWA 手机/电脑均可用 · 模型列表自动更新

---

## 功能特性

| 特性 | 说明 |
|------|------|
| 🤖 11+ 模型 | OpenAI / Claude / Gemini / Grok / Llama / Mistral / DeepSeek / Kimi / Qwen / GLM / ERNIE |
| 🎯 4种优化 | 最省Token · 最准确 · 最快速 · 最符合人类语言 |
| 📱 跨平台 | PWA，手机/平板/电脑浏览器均可安装使用 |
| 🌐 网络感知 | 实时检测网络状态，自动区分境内/境外访问 |
| 🔄 自动更新 | 每小时拉取远程模型注册表，无需手动更新 |
| 💰 费用统计 | 实时显示Token消耗、响应时间、节省比例 |

---

## 快速启动

### 1. 安装依赖
```bash
cd ai-prompt-generator
npm install
```

### 2. 配置 API Keys
```bash
cp .env.example .env.local
# 编辑 .env.local，填入你拥有的 API Key（至少填一个生成器模型的 Key）
```

### 3. 生成 PWA 图标（可选）
```bash
pip install Pillow
python3 generate_icons.py
```

### 4. 启动开发服务器
```bash
npm run dev
# 访问 http://localhost:3000
```

### 5. 局域网访问（手机/其他设备）
```bash
# 查看本机 IP
ipconfig   # Windows
ifconfig   # Mac/Linux

# 手机浏览器访问 http://你的IP:3000
# 点击"添加到主屏幕"即可像 App 一样使用
```

---

## 支持的大模型

### 🌐 国际模型（需全球网络）
| 提供商 | 模型 | 特点 |
|--------|------|------|
| OpenAI | GPT-4o, GPT-4o Mini, o3, o4-mini | 最强推理，o4-mini性价比极高 |
| Anthropic | Claude Opus 4.5, Sonnet 4.5, Haiku 3.5 | 写作/代码最佳 |
| Google | Gemini 2.5 Pro, 2.0 Flash | 100万 token 超长上下文 |
| xAI | Grok-3, Grok-3 Mini | 实时网络搜索 |
| Mistral | Mistral Large, Small | 多语言，开源友好 |
| Meta (via Groq) | Llama 3.3 70B, 3.1 8B | 开源，极速推理 |

### 🇨🇳 国产模型（国内直连）
| 提供商 | 模型 | API 文档 |
|--------|------|---------|
| 深度求索 | DeepSeek V3, R1 | https://platform.deepseek.com |
| 智谱AI | GLM-4 Plus | https://open.bigmodel.cn |
| 月之暗面 | Kimi moonshot-v1 | https://platform.moonshot.cn |
| 阿里巴巴 | Qwen Max, Turbo | https://dashscope.aliyun.com |
| 百度 | ERNIE 4.0 | https://cloud.baidu.com/product/wenxinworkshop |

---

## 模型自动更新

在 `.env.local` 中设置：
```env
MODELS_REGISTRY_URL=https://raw.githubusercontent.com/你的用户名/ai-models-registry/main/models.json
```

远程 JSON 格式遵循 `src/lib/models-registry.ts` 中的 `ModelInfo` 接口。
每次有新模型发布，只需更新 JSON 文件，所有用户将在 1 小时内自动获取最新模型列表。

---

## 网络连接说明

### 自动检测
- 应用每 30 秒自动检测一次网络状态
- 区分「全球访问」（OpenAI/Google 可用）和「国内访问」（百度/阿里可用）
- 网络恢复后自动显示提示

### 手动连接指南
**WiFi 连接：** 设备设置 → WiFi → 选择网络  
**手机热点：**
- iPhone：设置 → 个人热点 → 开启
- Android：设置 → 网络 → 热点与共享

---

## 构建生产版本

```bash
npm run build
npm start
# 或部署到 Vercel / Netlify
```

---

## 技术栈

- **框架**：Next.js 14 (App Router)
- **UI**：Tailwind CSS + Framer Motion
- **PWA**：next-pwa (Service Worker)
- **AI SDK**：OpenAI SDK, Anthropic SDK, Google GenAI
- **语言**：TypeScript
