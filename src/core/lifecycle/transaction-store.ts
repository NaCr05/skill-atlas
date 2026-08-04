import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { isPathInside } from "@/core/skills/paths";
import { resolveLifecycleStorageRoots, type LifecycleStorageOptions } from "./storage";
import type { LifecycleTransaction } from "./types";

export type TransactionWriter = (transaction: LifecycleTransaction) => Promise<void>;

export interface TransactionOptions extends LifecycleStorageOptions {
  transactionWriter?: TransactionWriter;
}

const globalLocks = globalThis as typeof globalThis & {
  __skillAtlasLifecycleLocks?: Map<string, Promise<void>>;
};
const lifecycleLocks = globalLocks.__skillAtlasLifecycleLocks || new Map<string, Promise<void>>();
globalLocks.__skillAtlasLifecycleLocks = lifecycleLocks;

export async function writeJsonAtomically(location: string, value: unknown): Promise<void> {
  const temporary = `${location}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(location), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporary, location);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function persistLifecycleTransaction(
  transaction: LifecycleTransaction,
  options: LifecycleStorageOptions = {},
): Promise<void> {
  const root = resolveLifecycleStorageRoots(options).transactionRoot;
  const location = path.join(root, `${transaction.id}.json`);
  if (!isPathInside(root, location)) throw new Error("生命周期事务文件路径无效。");
  await writeJsonAtomically(location, transaction);
}

export function resolveTransactionWriter(options: TransactionOptions): TransactionWriter {
  return options.transactionWriter
    || ((transaction) => persistLifecycleTransaction(transaction, options));
}

export async function withLifecycleLock<T>(
  directoryPath: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(directoryPath).toLocaleLowerCase();
  const previous = lifecycleLocks.get(key) || Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  lifecycleLocks.set(key, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (lifecycleLocks.get(key) === queued) lifecycleLocks.delete(key);
  }
}
