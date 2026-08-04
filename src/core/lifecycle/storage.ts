import path from "node:path";

import { isPathInside, resolveCodexEnvironment } from "@/core/skills/paths";

export interface LifecycleStorageOptions {
  env?: Readonly<Partial<NodeJS.ProcessEnv>>;
  homeDirectory?: string;
}

export interface LifecycleStorageRoots {
  atlasRoot: string;
  trashRoot: string;
  purgeRoot: string;
  transactionRoot: string;
  backupRoot: string;
  stagingRoot: string;
  disabledRoot: string;
  migrationRoot: string;
  migrationPurgeRoot: string;
  storagePurgeRoot: string;
  importBackupRoot: string;
}

export function sameWindowsPath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

export function resolveLifecycleStorageRoots(
  options: LifecycleStorageOptions = {},
): LifecycleStorageRoots {
  const environment = resolveCodexEnvironment(options.env, options.homeDirectory);
  const atlasRoot = path.join(environment.codexHome, ".skill-atlas");
  const roots = {
    atlasRoot,
    trashRoot: path.join(atlasRoot, "trash"),
    purgeRoot: path.join(atlasRoot, "purge"),
    transactionRoot: path.join(atlasRoot, "transactions"),
    backupRoot: path.join(atlasRoot, "backups"),
    stagingRoot: path.join(atlasRoot, "staging"),
    disabledRoot: path.join(atlasRoot, "disabled"),
    migrationRoot: path.join(atlasRoot, "migrations"),
    migrationPurgeRoot: path.join(atlasRoot, "migration-purge"),
    storagePurgeRoot: path.join(atlasRoot, "storage-purge"),
    importBackupRoot: path.join(atlasRoot, "import-backups"),
  };
  for (const location of Object.values(roots)) {
    if (
      !isPathInside(environment.codexHome, location) ||
      sameWindowsPath(environment.codexHome, location)
    ) {
      throw new Error("生命周期存储路径超出 CODEX_HOME。");
    }
  }
  return roots;
}
