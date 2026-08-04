import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const stage = path.join(process.cwd(), "dist", "windows", "app");
const port = 3198;
const child = spawn(path.join(stage, "runtime", "node.exe"), ["server.js"], {
  cwd: stage,
  windowsHide: true,
  stdio: "ignore",
  env: { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port) },
});

try {
  let response;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { response = await fetch(`http://127.0.0.1:${port}/api/skills?summary=1`, { signal: AbortSignal.timeout(500) }); } catch { /* retry */ }
    if (response?.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!response?.ok) throw new Error("Standalone Windows stage did not become ready.");
  console.log(`Standalone response: ${response.status}`);
} finally {
  child.kill();
}
