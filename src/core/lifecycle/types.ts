export interface SkillFingerprint {
  algorithm: "sha256-manifest-v1";
  value: string;
  fileCount: number;
  totalBytes: number;
  complete: boolean;
}

export interface FingerprintedFile {
  path: string;
  size: number;
  gitBlobSha: string;
}

export interface TrackedSkillSource {
  skillDirectory: string;
  sourceUrl: string;
  repository: string;
  ref: string;
  sourceDirectory: string;
  revision: string;
  upstreamFingerprint: string;
  localFingerprint: string;
  trackedAt: string;
  sourceTrust?: import("@/core/github/skill-source").GithubSourceTrust;
  policyStatus?: "trusted" | "unlisted" | "blocked";
}

export type SkillSourceTracking =
  | { status: "not-applicable" }
  | { status: "untracked" }
  | ({ status: "tracked" } & TrackedSkillSource);

export type FileChangeKind = "added" | "modified" | "removed" | "unchanged";

export interface SkillFileChange {
  path: string;
  kind: FileChangeKind;
  localSize?: number;
  upstreamSize?: number;
  localBlobSha?: string;
  upstreamBlobSha?: string;
}

export type UpdatePreviewStatus =
  | "up-to-date"
  | "update-available"
  | "differences-found"
  | "local-changes";

export interface UpdateRisk {
  level: "info" | "review" | "blocked";
  code:
    | "preview-only"
    | "transactional-update"
    | "new-or-modified-scripts"
    | "metadata-changed"
    | "metadata-invalid"
    | "source-name-mismatch"
    | "unsupported-entry"
    | "source-limit"
    | "local-divergence";
  title: string;
  detail: string;
}

export interface SkillUpdatePreview {
  previewId: string;
  expiresAt: string;
  skillId: string;
  skillName: string;
  status: UpdatePreviewStatus;
  previewOnly: false;
  updateAllowed: boolean;
  trackingAvailable: boolean;
  source: {
    sourceUrl: string;
    repository: string;
    ref: string;
    sourceDirectory: string;
    revision: string;
  };
  local: SkillFingerprint;
  upstream: SkillFingerprint;
  baseline?: {
    localFingerprint: string;
    upstreamFingerprint: string;
    revision: string;
    trackedAt: string;
  };
  localDiverged: boolean;
  summary: Record<FileChangeKind, number>;
  changes: SkillFileChange[];
  risks: UpdateRisk[];
}

export interface InternalUpdatePreviewPlan extends SkillUpdatePreview {
  localDirectory: string;
  trackingRecord: TrackedSkillSource;
  entries: import("@/core/github/skill-source").GitTreeEntry[];
}

export interface SkillUpdateResult {
  transactionId: string;
  skillId: string;
  skillName: string;
  updatedDirectory: string;
  backupDirectory: string;
  previousFingerprint: SkillFingerprint;
  installedFingerprint: SkillFingerprint;
  revision: string;
  updatedAt: string;
  rollbackAvailable: true;
}

export interface SkillDisableRisk {
  level: "info" | "review" | "blocked";
  code: "personal-skill" | "complete-private-copy" | "hard-dependents" | "unsupported-path";
  title: string;
  detail: string;
}

export interface SkillDisableReview {
  planId: string;
  expiresAt: string;
  skillId: string;
  skillName: string;
  displayName: string;
  directoryPath: string;
  fingerprint: SkillFingerprint;
  hardDependents: Array<{ id: string; name: string; displayName: string }>;
  risks: SkillDisableRisk[];
  disableAllowed: boolean;
}

export interface InternalSkillDisablePlan extends SkillDisableReview {
  sourceTracking: SkillSourceTracking;
}

export type DisabledSkillState = "planned" | "committed" | "enabled" | "failed";

export interface DisabledSkillRecord {
  disabledId: string;
  skillId: string;
  skillName: string;
  displayName: string;
  originalDirectory: string;
  disabledDirectory: string;
  disabledAt: string;
  enabledAt?: string;
  fingerprint: SkillFingerprint;
  sourceTracking: SkillSourceTracking;
  state: DisabledSkillState;
  failure?: string;
}

export interface SkillDisableResult {
  disabledId: string;
  skillId: string;
  skillName: string;
  originalDirectory: string;
  disabledDirectory: string;
  disabledAt: string;
  fileCount: number;
  totalBytes: number;
  reEnableAvailable: true;
}

export interface SkillEnableResult {
  disabledId: string;
  skillId: string;
  skillName: string;
  restoredDirectory: string;
  enabledAt: string;
  fileCount: number;
  totalBytes: number;
}

export type LifecycleOperation =
  | "track-source"
  | "update"
  | "disable"
  | "enable"
  | "uninstall"
  | "restore"
  | "purge"
  | "migrate-duplicate"
  | "restore-migration"
  | "purge-migration";

export type LifecycleTransactionState =
  | "planned"
  | "staged"
  | "backed-up"
  | "committed"
  | "rolled-back"
  | "failed";

export interface LifecycleTransaction {
  id: string;
  operation: LifecycleOperation;
  skillId: string;
  state: LifecycleTransactionState;
  createdAt: string;
  updatedAt?: string;
  expectedFingerprint: string;
  skillName?: string;
  originalDirectory?: string;
  stagingDirectory?: string;
  backupDirectory?: string;
  targetFingerprint?: string;
  manifestPath?: string;
  failure?: string;
}

export type SkillRemovalRiskCode =
  | "personal-skill"
  | "complete-backup"
  | "hard-dependents"
  | "instruction-references"
  | "unsupported-path"
  | "source-read-only";

export interface SkillRemovalRisk {
  level: "info" | "review" | "blocked";
  code: SkillRemovalRiskCode;
  title: string;
  detail: string;
}

export interface SkillRemovalReview {
  planId: string;
  expiresAt: string;
  skillId: string;
  skillName: string;
  displayName: string;
  directoryPath: string;
  fingerprint: SkillFingerprint;
  hardDependents: Array<{ id: string; name: string; displayName: string }>;
  instructionReferences: Array<{ id: string; name: string; displayName: string }>;
  sourceTracking: SkillSourceTracking;
  risks: SkillRemovalRisk[];
  removalAllowed: boolean;
}

export interface InternalSkillRemovalPlan extends SkillRemovalReview {
  directoryKey: string;
}

export type SkillTrashState = "planned" | "committed" | "restored" | "failed";

export interface TrashedSkillRecord {
  trashId: string;
  skillId: string;
  skillName: string;
  displayName: string;
  originalDirectory: string;
  trashDirectory: string;
  deletedAt: string;
  restoredAt?: string;
  fingerprint: SkillFingerprint;
  sourceTracking: SkillSourceTracking;
  state: SkillTrashState;
  failure?: string;
}

export interface SkillRemovalResult {
  trashId: string;
  skillId: string;
  skillName: string;
  originalDirectory: string;
  trashDirectory: string;
  deletedAt: string;
  fileCount: number;
  totalBytes: number;
  rollbackAvailable: true;
}

export interface SkillRestoreResult {
  trashId: string;
  skillId: string;
  skillName: string;
  restoredDirectory: string;
  restoredAt: string;
  fileCount: number;
  totalBytes: number;
}

export interface SkillTrashOverview {
  rootPath: string;
  count: number;
  totalBytes: number;
  records: TrashedSkillRecord[];
  disabledRoot: string;
  disabledCount: number;
  disabledRecords: DisabledSkillRecord[];
  recovery: LifecycleRecoveryOverview;
}

export type LifecycleRecoveryIssueCode =
  | "trash-root-unreadable"
  | "trash-entry-unsafe"
  | "trash-manifest-invalid"
  | "trash-operation-incomplete"
  | "trash-path-mismatch"
  | "trash-fingerprint-mismatch"
  | "trash-record-failed"
  | "trash-skill-missing"
  | "purge-root-unreadable"
  | "purge-entry-unsafe"
  | "purge-manifest-invalid"
  | "purge-quarantine-intact"
  | "purge-quarantine-partial"
  | "staging-root-unreadable"
  | "staging-entry-unsafe"
  | "staging-entry-orphaned"
  | "transaction-root-unreadable"
  | "transaction-record-invalid"
  | "transaction-failed"
  | "transaction-incomplete";

export type LifecycleRecoveryAction =
  | "restore-quarantine"
  | "clean-staging"
  | "retry-transaction";

export interface LifecycleRecoveryIssue {
  id: string;
  code: LifecycleRecoveryIssueCode;
  category: "trash" | "quarantine" | "transaction" | "staging";
  severity: "warning" | "danger";
  recoverability: "safe-restore" | "safe-cleanup" | "safe-retry" | "manual-review" | "audit-only";
  availableActions?: LifecycleRecoveryAction[];
  location: string;
  relatedPath?: string;
  transactionId?: string;
  skillName?: string;
  operation?: LifecycleOperation;
  state?: LifecycleTransactionState | SkillTrashState;
  detectedAt?: string;
  diagnostic?: string;
}

export interface LifecycleRecoveryOverview {
  inspectedAt: string;
  healthy: boolean;
  counts: {
    total: number;
    trash: number;
    quarantine: number;
    transactions: number;
    staging: number;
  };
  roots: {
    atlasRoot: string;
    trashRoot: string;
    purgeRoot: string;
    transactionRoot: string;
    backupRoot: string;
    stagingRoot: string;
    disabledRoot: string;
  };
  issues: LifecycleRecoveryIssue[];
}

export interface PermanentDeletionReview {
  planId: string;
  expiresAt: string;
  trashId: string;
  skillId: string;
  skillName: string;
  displayName: string;
  originalDirectory: string;
  trashDirectory: string;
  fingerprint: SkillFingerprint;
  confirmationText: string;
  deletionAllowed: true;
}

export interface InternalPermanentDeletionPlan extends PermanentDeletionReview {
  transactionDirectory: string;
}

export interface PermanentDeletionResult {
  trashId: string;
  skillId: string;
  skillName: string;
  purgedAt: string;
  fileCount: number;
  totalBytes: number;
  auditTransactionId: string;
  auditStatus: "recorded" | "incomplete";
  auditWarning?: string;
  recoverable: false;
}
