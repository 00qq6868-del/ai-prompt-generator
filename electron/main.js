// electron/main.js  —  Electron 主进程
// 启动 Next.js 服务器 → 显示加载页 → 服务器就绪后加载 App

const { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage } = require("electron");
const { spawn } = require("child_process");
const path  = require("path");
const fs    = require("fs");
const http  = require("http");

// ── 配置 ─────────────────────────────────────────────────────
const PORT        = 3748;
const SERVER_URL  = `http://127.0.0.1:${PORT}`;

const IS_PACKAGED  = app.isPackaged;
const RESOURCES    = IS_PACKAGED ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
const ICON_PATH    = path.join(RESOURCES, "public", "icons", "icon-512.png");
const PROJECT_ENV  = path.join(RESOURCES, ".env.local");
const PORTABLE_DIR = IS_PACKAGED && process.env.PORTABLE_EXECUTABLE_DIR
  ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, "AI-Prompt-Generator-Data")
  : null;
const DATA_DIR     = PORTABLE_DIR || app.getPath("userData");
const ENV_FILE     = path.join(DATA_DIR, ".env.local");
const STATE_FILE   = path.join(DATA_DIR, "window-state.json");

let mainWindow = null;
let serverProcess = null;
let tray = null;
let isQuitting = false;

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch {}

// ── 窗口状态记忆 ──────────────────────────────────────────────
function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch {}
  return { width: 1280, height: 820 };
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getNormalBounds();
  const state = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: win.isMaximized(),
  };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), "utf-8");
  } catch {}
}

// ── 开机自启 ──────────────────────────────────────────────────
function getAutoLaunch() {
  return app.getLoginItemSettings().openAtLogin;
}

function setAutoLaunch(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
  });
}

// ── 读取 .env.local ───────────────────────────────────────────
function readEnv() {
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

function hasAnyKey(env) {
  const keys = [
    "OPENAI_API_KEY","ANTHROPIC_API_KEY","GOOGLE_API_KEY",
    "CUSTOM_API_KEY","AIHUBMIX_API_KEY",
    "GROQ_API_KEY","XAI_API_KEY","MISTRAL_API_KEY",
    "DEEPSEEK_API_KEY","ZHIPU_API_KEY","MOONSHOT_API_KEY",
    "QWEN_API_KEY","BAIDU_API_KEY",
  ];
  return keys.some((k) => env[k] && env[k].length > 5);
}

// ── 启动 Next.js 服务器进程 ───────────────────────────────────
function startServer(envVars) {
  const serverScript = [
    path.join(RESOURCES, ".next", "standalone", "server.js"),
    path.join(RESOURCES, "server.js"),
  ].find((candidate) => fs.existsSync(candidate));

  if (!serverScript) {
    showError("找不到服务器文件，请重新安装或运行 setup.bat 重新构建。");
    return;
  }

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: path.dirname(serverScript),
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

// ── 自动更新 ──────────────────────────────────────────────────
function setupAutoUpdater() {
  if (!IS_PACKAGED) return;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = false;
    autoUpdater.checkForUpdatesAndNotify();
    autoUpdater.on("update-available", (info) => {
      const { dialog } = require("electron");
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "发现新版本 New version available",
        message: `新版本 ${info.version} 可用，是否下载？\nVersion ${info.version} is available. Download now?`,
        buttons: ["下载 Download", "稍后 Later"],
      }).then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate();
      });
    });
    autoUpdater.on("update-downloaded", () => {
      const { dialog } = require("electron");
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "更新已就绪 Update ready",
        message: "更新已下载，重启应用以安装。\nUpdate downloaded. Restart to install.",
        buttons: ["重启 Restart", "稍后 Later"],
      }).then(({ response }) => {
        if (response === 0) {
          isQuitting = true;
          autoUpdater.quitAndInstall();
        }
      });
    });
    autoUpdater.on("error", (err) => {
      console.error("[updater]", err.message);
    });
  } catch (err) {
    console.error("[updater] electron-updater not available:", err.message);
  }
}

// ── 创建主窗口 ────────────────────────────────────────────────
function createMainWindow() {
  const state = loadWindowState();

  const winOpts = {
    width:     state.width,
    height:    state.height,
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
  };

  if (state.x !== undefined && state.y !== undefined) {
    winOpts.x = state.x;
    winOpts.y = state.y;
  }

  const win = new BrowserWindow(winOpts);

  if (state.isMaximized) win.maximize();

  Menu.setApplicationMenu(null);

  win.loadFile(path.join(__dirname, "loading.html"));
  win.show();

  waitForServer()
    .then(() => {
      win.loadURL(SERVER_URL);
    })
    .catch(() => {
      win.loadFile(path.join(__dirname, "error.html"));
    });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(SERVER_URL)) shell.openExternal(url);
    return { action: "deny" };
  });

  // 最小化到托盘（而非关闭）
  win.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
      return;
    }
    saveWindowState(win);
  });

  // 持续保存窗口状态
  win.on("resize", () => saveWindowState(win));
  win.on("move", () => saveWindowState(win));

  win.on("closed", () => { mainWindow = null; });
  return win;
}

// ── 系统托盘 ─────────────────────────────────────────────────
function createTray() {
  const img = nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip("AI 提示词生成器");

  const autoLaunchEnabled = getAutoLaunch();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "显示窗口 Show",
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else mainWindow = createMainWindow();
      },
    },
    { type: "separator" },
    {
      label: "开机自启 Auto Start",
      type: "checkbox",
      checked: autoLaunchEnabled,
      click: (item) => setAutoLaunch(item.checked),
    },
    { type: "separator" },
    {
      label: "退出 Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) shell.openExternal(url);
    return { action: "deny" };
  });

  ipcMain.once("save-keys", (_evt, keys) => {
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
    setupAutoUpdater();
  };

  if (!hasAnyKey(env)) {
    createSettingsWindow(launch);
  } else {
    launch();
  }
});

app.on("window-all-closed", () => {
  // 不退出 — 托盘继续运行
});

app.on("activate", () => {
  if (!mainWindow) mainWindow = createMainWindow();
  else mainWindow.show();
});

app.on("before-quit", () => {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) saveWindowState(mainWindow);
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
});

// IPC
ipcMain.on("open-settings", () => {
  createSettingsWindow(() => {
    if (mainWindow) mainWindow.reload();
  });
});

ipcMain.on("open-external", (_e, url) => {
  if (typeof url !== "string") return;
  if (!url.startsWith("https://") && !url.startsWith("http://")) return;
  shell.openExternal(url);
});

ipcMain.handle("get-auto-launch", () => getAutoLaunch());
ipcMain.handle("set-auto-launch", (_e, enabled) => setAutoLaunch(enabled));
