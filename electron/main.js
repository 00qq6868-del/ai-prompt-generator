// electron/main.js  —  Electron 主进程
// 启动 Next.js 服务器 → 显示加载页 → 服务器就绪后加载 App

const { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage } = require("electron");
const { spawn } = require("child_process");
const path  = require("path");
const fs    = require("fs");
const http  = require("http");

// ── 配置 ─────────────────────────────────────────────────────
const PORT        = 3748;          // 避免与常见端口冲突
const SERVER_URL  = `http://127.0.0.1:${PORT}`;
const ENV_FILE    = path.join(app.getPath("userData"), ".env.local");

// 打包后资源在 process.resourcesPath/app，开发时在项目根目录
const IS_PACKAGED  = app.isPackaged;
const RESOURCES    = IS_PACKAGED ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
const ICON_PATH    = path.join(RESOURCES, "public", "icons", "icon-512.png");
const PROJECT_ENV  = path.join(RESOURCES, ".env.local");

let mainWindow = null;
let serverProcess = null;
let tray = null;

// ── 读取 .env.local ───────────────────────────────────────────
function readEnv() {
  // 优先读用户数据目录（App 保存的配置）
  const target = fs.existsSync(ENV_FILE) ? ENV_FILE : PROJECT_ENV;
  if (!fs.existsSync(target)) return {};
  const env = {};
  fs.readFileSync(target, "utf-8").split(/\r?\n/).forEach((line) => {
    const eqIdx = line.indexOf("=");
    if (eqIdx > 0 && !line.startsWith("#")) {
      const k = line.slice(0, eqIdx).trim();
      const v = line.slice(eqIdx + 1).trim();
      if (k && v) env[k] = v;
    }
  });
  return env;
}

// 检查是否至少配置了一个 AI Provider Key
function hasAnyKey(env) {
  const keys = [
    "OPENAI_API_KEY","ANTHROPIC_API_KEY","GOOGLE_API_KEY",
    "GROQ_API_KEY","XAI_API_KEY","MISTRAL_API_KEY",
    "DEEPSEEK_API_KEY","ZHIPU_API_KEY","MOONSHOT_API_KEY",
    "QWEN_API_KEY","BAIDU_API_KEY",
  ];
  return keys.some((k) => env[k] && env[k].length > 5);
}

// ── 启动 Next.js 服务器进程 ───────────────────────────────────
function startServer(envVars) {
  const serverScript = path.join(RESOURCES, ".next", "standalone", "server.js");
  if (!fs.existsSync(serverScript)) {
    showError("找不到服务器文件，请重新安装或运行 setup.bat 重新构建。");
    return;
  }

  serverProcess = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      ...envVars,
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (d) => process.stdout.write("[server] " + d));
  serverProcess.stderr.on("data", (d) => process.stderr.write("[server!] " + d));
  serverProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error("[server] exited with code", code);
    }
  });
}

// ── 轮询等待服务器就绪 ────────────────────────────────────────
function waitForServer(maxMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(SERVER_URL, (res) => {
        res.resume();
        resolve();
      }).on("error", () => {
        if (Date.now() - start > maxMs) reject(new Error("Server timeout"));
        else setTimeout(check, 400);
      });
    };
    check();
  });
}

// ── 创建主窗口 ────────────────────────────────────────────────
function createMainWindow() {
  const win = new BrowserWindow({
    width:     1280,
    height:    820,
    minWidth:  900,
    minHeight: 600,
    backgroundColor: "#060610",
    title:     "AI 提示词生成器",
    icon:      ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
  });

  // 去掉默认菜单栏（更像 App）
  Menu.setApplicationMenu(null);

  // 先显示加载页
  win.loadFile(path.join(__dirname, "loading.html"));
  win.show();

  // 等服务器就绪后切换到 App
  waitForServer()
    .then(() => {
      win.loadURL(SERVER_URL);
    })
    .catch(() => {
      win.loadFile(path.join(__dirname, "error.html"));
    });

  // 外部链接在系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(SERVER_URL)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => { mainWindow = null; });
  return win;
}

// ── 系统托盘 ─────────────────────────────────────────────────
function createTray() {
  const img = nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip("AI 提示词生成器");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开",  click: () => { if (mainWindow) mainWindow.show(); else mainWindow = createMainWindow(); } },
    { label: "退出",  click: () => app.quit() },
  ]));
  tray.on("click", () => { if (mainWindow) mainWindow.show(); });
}

// ── 设置窗口（首次运行） ──────────────────────────────────────
function createSettingsWindow(onSave) {
  const win = new BrowserWindow({
    width:  520,
    height: 680,
    resizable: false,
    backgroundColor: "#060610",
    title:  "设置 API Key",
    icon:   ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "settings.html"));

  ipcMain.once("save-keys", (_evt, keys) => {
    // 写入用户数据目录
    const lines = Object.entries(keys)
      .filter(([, v]) => v && v.trim())
      .map(([k, v]) => `${k}=${v.trim()}`)
      .join("\n");
    fs.writeFileSync(ENV_FILE, lines + "\nOLLAMA_BASE_URL=http://localhost:11434\n", "utf-8");
    win.close();
    onSave();
  });
}

// ── 错误弹窗 ─────────────────────────────────────────────────
function showError(msg) {
  const { dialog } = require("electron");
  dialog.showErrorBox("AI 提示词生成器 — 错误", msg);
}

// ── App 入口 ──────────────────────────────────────────────────
app.whenReady().then(async () => {
  const env = readEnv();

  const launch = () => {
    startServer(readEnv());
    createTray();
    mainWindow = createMainWindow();
  };

  if (!hasAnyKey(env)) {
    // 首次运行 → 先填 Key
    createSettingsWindow(launch);
  } else {
    launch();
  }
});

app.on("window-all-closed", () => {
  // 关窗不退出（系统托盘继续运行），macOS 惯例
  if (process.platform !== "darwin") {
    // Windows：缩到托盘
  }
});

app.on("activate", () => {
  if (!mainWindow) mainWindow = createMainWindow();
});

app.on("before-quit", () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
});

// IPC：渲染进程请求打开设置
ipcMain.on("open-settings", () => {
  createSettingsWindow(() => {
    if (mainWindow) mainWindow.reload();
  });
});
