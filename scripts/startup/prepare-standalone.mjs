import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const staticTarget = path.join(standalone, ".next", "static");
const publicSource = path.join(root, "public");
const publicTarget = path.join(standalone, "public");
await rm(staticTarget, { recursive: true, force: true });
await mkdir(path.dirname(staticTarget), { recursive: true });
await cp(path.join(root, ".next", "static"), staticTarget, { recursive: true });
await rm(publicTarget, { recursive: true, force: true });
try {
  await cp(publicSource, publicTarget, { recursive: true });
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  await mkdir(publicTarget, { recursive: true });
}
console.log("Prepared Next.js standalone static assets.");
