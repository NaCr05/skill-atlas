import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { isPathInside, resolvePersonalSkillsRoot } from "@/core/skills/paths";
import { snapshotLocalSkill } from "./fingerprint";
import { isTrashedSkillRecord } from "./records";
import { resolveLifecycleStorageRoots, sameWindowsPath } from "./storage";
import {
  resolveTransactionWriter,
  writeJsonAtomically,
  type TransactionWriter,
} from "./transaction-store";
import type { TrashedSkillRecord } from "./types";

export const MAX_TRASH_FILES = 500;

export type PurgeRemover = (directoryPath: string) => Promise<void>;

export interface SkillTrashOptions {
  env?: Readonly<Partial<NodeJS.ProcessEnv>>;
  homeDirectory?: string;
  now?: Date;
  idFactory?: () => string;
  transactionWriter?: TransactionWriter;
  purgeRemover?: PurgeRemover;
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export function sameTrashPath(left: string, right: string): boolean {
  return sameWindowsPath(left, right);
}

export function resolveTrashRoot(options: SkillTrashOptions): string {
  return resolveLifecycleStorageRoots(options).trashRoot;
}

export function resolvePurgeRoot(options: SkillTrashOptions): string {
  return resolveLifecycleStorageRoots(options).purgeRoot;
}

export function resolveTrashTransactionWriter(options: SkillTrashOptions): TransactionWriter {
  return resolveTransactionWriter(options);
}

export async function assertManageableSkillDirectory(
  directoryPath: string,
  options: SkillTrashOptions,
): Promise<string> {
  const skillsRoot = path.resolve(resolvePersonalSkillsRoot(options.env, options.homeDirectory));
  const resolvedDirectory = path.resolve(directoryPath);
  if (
    !isPathInside(skillsRoot, resolvedDirectory) ||
    sameTrashPath(skillsRoot, resolvedDirectory) ||
    !sameTrashPath(path.dirname(resolvedDirectory), skillsRoot)
  ) {
    throw new Error("只允许管理个人 Skills 根目录中的直接子目录。");
  }
  const details = await lstat(resolvedDirectory);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error("Skill 目录不是可管理的普通目录。");
  }
  const [realRoot, realDirectory] = await Promise.all([
    realpath(skillsRoot),
    realpath(resolvedDirectory),
  ]);
  if (!isPathInside(realRoot, realDirectory) || sameTrashPath(realRoot, realDirectory)) {
    throw new Error("Skill 的真实路径超出了个人 Skills 目录。");
  }
  return resolvedDirectory;
}

function manifestLocation(trashId: string, options: SkillTrashOptions): string {
  const root = resolveTrashRoot(options);
  const location = path.join(root, trashId, "manifest.json");
  if (!isPathInside(root, location)) throw new Error("回收站记录路径无效。");
  return location;
}

export async function writeTrashManifest(
  record: TrashedSkillRecord,
  options: SkillTrashOptions,
): Promise<void> {
  await writeJsonAtomically(manifestLocation(record.trashId, options), record);
}

export async function readTrashManifest(
  trashId: string,
  options: SkillTrashOptions,
): Promise<TrashedSkillRecord> {
  if (!/^[0-9a-f-]{36}$/i.test(trashId)) throw new Error("回收站记录 ID 无效。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestLocation(trashId, options), "utf8"));
  } catch {
    throw new Error("未找到这条 Skill 回收站记录。");
  }
  if (!isTrashedSkillRecord(parsed) || parsed.trashId !== trashId) {
    throw new Error("Skill 回收站记录损坏或格式不受支持。");
  }
  return parsed;
}

export async function assertTrashSkillDirectory(
  record: TrashedSkillRecord,
  options: SkillTrashOptions,
): Promise<string> {
  const root = resolveTrashRoot(options);
  const expected = path.join(root, record.trashId, "skill");
  if (!sameTrashPath(expected, record.trashDirectory)) {
    throw new Error("回收站中的 Skill 路径与记录不一致。");
  }
  const details = await lstat(expected);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error("回收站中的 Skill 不是可恢复的普通目录。");
  }
  const [realRoot, realDirectory] = await Promise.all([
    realpath(root),
    realpath(expected),
  ]);
  if (!isPathInside(realRoot, realDirectory) || sameTrashPath(realRoot, realDirectory)) {
    throw new Error("回收站中 Skill 的真实路径超出了安全目录。");
  }
  return expected;
}

export async function assertDirectPrivateDirectory(
  rootPath: string,
  directoryPath: string,
  label: string,
): Promise<string> {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedDirectory = path.resolve(directoryPath);
  if (
    !isPathInside(resolvedRoot, resolvedDirectory) ||
    sameTrashPath(resolvedRoot, resolvedDirectory) ||
    !sameTrashPath(path.dirname(resolvedDirectory), resolvedRoot)
  ) {
    throw new Error(label + "路径不在允许的私有目录中。");
  }
  const details = await lstat(resolvedDirectory);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error(label + "不是可管理的普通目录。");
  }
  const [realRoot, realDirectory] = await Promise.all([
    realpath(resolvedRoot),
    realpath(resolvedDirectory),
  ]);
  if (
    !isPathInside(realRoot, realDirectory) ||
    sameTrashPath(realRoot, realDirectory) ||
    !sameTrashPath(path.dirname(realDirectory), realRoot)
  ) {
    throw new Error(label + "真实路径超出了允许的私有目录。");
  }
  return resolvedDirectory;
}

export async function assertTrashTransactionDirectory(
  record: TrashedSkillRecord,
  options: SkillTrashOptions,
): Promise<string> {
  const root = resolveTrashRoot(options);
  return assertDirectPrivateDirectory(
    root,
    path.join(root, record.trashId),
    "Skill 回收站事务目录",
  );
}

export async function snapshotTrashSkill(directoryPath: string) {
  return snapshotLocalSkill(directoryPath, { maxFiles: MAX_TRASH_FILES });
}
