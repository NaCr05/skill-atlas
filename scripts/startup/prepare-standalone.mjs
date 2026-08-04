import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const staticTarget = path.join(standalone, ".next", "static");
await rm(staticTarget, { recursive: true, force: true });
await mkdir(path.dirname(staticTarget), { recursive: true });
await cp(path.join(root, ".next", "static"), staticTarget, { recursive: true });
await rm(path.join(standalone, "public"), { recursive: true, force: true });
await cp(path.join(root, "public"), path.join(standalone, "public"), { recursive: true }).catch(() => undefined);
console.log("Prepared Next.js standalone static assets.");
