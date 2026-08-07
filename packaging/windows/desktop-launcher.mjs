import { appendFile, mkdir } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "Skill Atlas");
const logFile = path.join(logDir, "launcher.log");
const identityHeader = "x-skill-atlas-app";
const identityValue = "skill-atlas";
async function log(message) { await mkdir(logDir, { recursive: true }); await appendFile(logFile, `${new Date().toISOString()} ${message}\n`).catch(() => undefined); }
function requestReady(port) { return new Promise((resolve) => { const request = http.get({ hostname: "127.0.0.1", port, path: "/api/health", timeout: 800 }, (response) => { response.resume(); resolve(response.statusCode === 200 && response.headers[identityHeader] === identityValue); }); request.on("error", () => resolve(false)); request.on("timeout", () => { request.destroy(); resolve(false); }); }); }
function portAvailable(port) { return new Promise((resolve) => { const server = net.createServer(); server.once("error", () => resolve(false)); server.listen(port, "127.0.0.1", () => server.close(() => resolve(true))); }); }
async function choosePort() { for (let port = 3180; port < 3200; port += 1) { if (await requestReady(port)) return { port, running: true }; if (await portAvailable(port)) return { port, running: false }; } throw new Error("No available local port between 3180 and 3199."); }
function openBrowser(url) { const child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }); child.unref(); }

try {
  const { port, running } = await choosePort();
  const url = `http://127.0.0.1:${port}`;
  if (!running) {
    const child = spawn(process.execPath, [path.join(appDir, "server.js")], { cwd: appDir, detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port) } });
    child.unref();
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) { if (await requestReady(port)) { ready = true; break; } await new Promise((resolve) => setTimeout(resolve, 250)); }
    if (!ready) throw new Error(`Server did not become ready on port ${port}.`);
  }
  openBrowser(url);
  await log(`Opened ${url}`);
} catch (error) {
  await log(error instanceof Error ? error.stack || error.message : String(error));
}
