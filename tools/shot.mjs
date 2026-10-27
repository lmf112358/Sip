// 用无头 Chrome + CDP 打开 dist 里的提醒页，抓控制台报错并截图
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.argv[2];
const PAGE = process.argv[3] || "/reminder.html?task=t1&preview=1";
const OUT = process.argv[4] || "shot.png";
const PORT = 5599;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(req.url.split("?")[0]));
    const file = join(ROOT, p === "/" ? "index.html" : p);
    const buf = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const chrome = spawn(
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  [
    "--headless=new",
    "--remote-debugging-port=9333",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1280,720",
    "--user-data-dir=C:/Windows/Temp/cdp-sip",
    "about:blank",
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target = null;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  try {
    const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch {
    /* 等浏览器起来 */
  }
}
if (!target) {
  console.log("无法连接 Chrome");
  chrome.kill();
  server.close();
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const logs = [];
const errors = [];

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    logs.push(
      `[${msg.params.type}] ` +
        msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ")
    );
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    errors.push(d.exception?.description || d.text);
  }
  if (msg.method === "Log.entryAdded") {
    logs.push(`[log:${msg.params.entry.level}] ${msg.params.entry.text}`);
  }
};

await new Promise((r) => (ws.onopen = r));
await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}${PAGE}` });
await sleep(2500);

const evalRes = await send("Runtime.evaluate", {
  expression: "document.getElementById('root').innerText.slice(0,200)",
  returnByValue: true,
});
const shot = await send("Page.captureScreenshot", { format: "png" });
const { writeFile } = await import("node:fs/promises");
await writeFile(OUT, Buffer.from(shot.data, "base64"));

console.log("=== 页面文本 ===");
console.log(JSON.stringify(evalRes.result?.value ?? ""));
console.log("=== console ===");
console.log(logs.join("\n") || "(空)");
console.log("=== 异常 ===");
console.log(errors.join("\n") || "(无)");
console.log("=== 截图 ===", OUT);

ws.close();
chrome.kill();
server.close();
process.exit(0);
