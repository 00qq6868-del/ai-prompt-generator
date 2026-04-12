#!/usr/bin/env node
// scripts/tunnel.js
// 启动 localtunnel 并把 URL 打印到 stdout，供 bat/sh 脚本捕获
// 用法: node scripts/tunnel.js <port>
//   - 成功: 打印 TUNNEL_URL=https://xxxx.loca.lt 然后保持运行
//   - 失败: 打印 TUNNEL_ERROR=<原因> 并退出

const port = parseInt(process.argv[2] || "3000", 10);

async function main() {
  let localtunnel;
  try {
    localtunnel = require("localtunnel");
  } catch {
    // 如果没安装就临时安装
    console.error("TUNNEL_ERROR=localtunnel not installed, run: npm install -g localtunnel");
    process.exit(1);
  }

  let tunnel;
  try {
    tunnel = await localtunnel({ port });
  } catch (err) {
    console.error(`TUNNEL_ERROR=${err.message}`);
    process.exit(1);
  }

  // 立即打印 URL（父进程从 stdout 读取）
  process.stdout.write(`TUNNEL_URL=${tunnel.url}\n`);

  tunnel.on("close", () => {
    process.stdout.write("TUNNEL_CLOSED\n");
    process.exit(0);
  });

  tunnel.on("error", (err) => {
    process.stdout.write(`TUNNEL_ERROR=${err.message}\n`);
  });

  // 保持进程存活
  process.on("SIGINT",  () => { tunnel.close(); });
  process.on("SIGTERM", () => { tunnel.close(); });
}

main();
