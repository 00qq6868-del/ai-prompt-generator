export type RecommendedCategory = "image" | "video" | "tts" | "code" | "reasoning" | null;

export interface Recommendation {
  category: RecommendedCategory;
  label: string;
  modelId: string;
}

const RULES: { pattern: RegExp; category: RecommendedCategory; label: string; modelId: string }[] = [
  { pattern: /画|绘|图片|插画|海报|封面|logo|头像|壁纸|draw|paint|image|illustration|poster|avatar|wallpaper|icon|thumbnail|banner|infographic|sketch|portrait/i, category: "image", label: "GPT Image 2", modelId: "gpt-image-2" },
  { pattern: /视频|短片|动画|影片|运镜|分镜|video|clip|animation|film|motion|cinematic|storyboard|footage|trailer/i, category: "video", label: "Sora 2 Pro", modelId: "sora-2-pro" },
  { pattern: /语音|朗读|配音|播报|朗诵|读出|voice|speech|narrat|tts|speak|read aloud|voiceover|podcast|audiobook/i, category: "tts", label: "ElevenLabs", modelId: "elevenlabs-tts" },
  { pattern: /音乐|歌曲|作曲|编曲|旋律|music|song|compose|melody|beat|lyrics|instrumental|soundtrack/i, category: "tts", label: "Suno", modelId: "suno" },
  { pattern: /代码|编程|函数|调试|重构|bug|code|program|function|debug|refactor|implement|algorithm|api|sdk|compile|deploy|script/i, category: "code", label: "DeepSeek V4 Pro", modelId: "deepseek-v4-pro" },
  { pattern: /数学|计算|证明|方程|公式|统计|math|calcul|proof|equation|formula|statistic|theorem|integral|derivative|probability/i, category: "reasoning", label: "o3", modelId: "o3" },
  { pattern: /推理|逻辑|分析|推导|思考|reason|logic|analy|deduc|think|evaluate|assess|diagnos/i, category: "reasoning", label: "o4-mini", modelId: "o4-mini" },
];

export function recommendModel(input: string): Recommendation | null {
  if (!input || input.length < 2) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(input)) {
      return { category: rule.category, label: rule.label, modelId: rule.modelId };
    }
  }
  return null;
}
