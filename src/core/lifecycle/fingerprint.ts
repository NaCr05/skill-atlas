import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { FingerprintedFile, SkillFingerprint } from "./types";

const ignoredDirectories = new Set([".git", ".next", "node_modules"]);

export interface LocalSkillSnapshot {
  fingerprint: SkillFingerprint;
  files: FingerprintedFile[];
  unsupportedPaths: string[];
}

export function gitBlobSha(data: Uint8Array): string {
  const header = Buffer.from(`blob ${data.byteLength}\0`, "utf8");
  return createHash("sha1").update(header).update(data).digest("hex");
}

export function fingerprintManifest(
  files: FingerprintedFile[],
  complete = true,
): SkillFingerprint {
  const normalized = [...files]
    .map((file) => ({ ...file, path: file.path.replaceAll("\\", "/") }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const manifest = normalized
    .map((file) => `${file.path}\0${file.gitBlobSha}\0${file.size}\n`)
    .join("");
  return {
    algorithm: "sha256-manifest-v1",
    value: createHash("sha256").update(manifest).digest("hex"),
    fileCount: normalized.length,
    totalBytes: normalized.reduce((total, file) => total + file.size, 0),
    complete,
  };
}

export async function snapshotLocalSkill(
  directoryPath: string,
  options: { maxFiles?: number } = {},
): Promise<LocalSkillSnapshot> {
  const maxFiles = options.maxFiles ?? 500;
  const files: FingerprintedFile[] = [];
  const unsupportedPaths: string[] = [];
  const queue = [directoryPath];
  let complete = true;

  while (queue.length) {
    const directory = queue.shift();
    if (!directory) break;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(directoryPath, absolutePath).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) {
        unsupportedPaths.push(relativePath);
        continue;
      }
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) queue.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= maxFiles) {
        complete = false;
        continue;
      }
      const data = await readFile(absolutePath);
      files.push({ path: relativePath, size: data.byteLength, gitBlobSha: gitBlobSha(data) });
    }
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  return { fingerprint: fingerprintManifest(files, complete), files, unsupportedPaths };
}
