import { describe, expect, it } from "vitest";

import { fingerprintManifest, gitBlobSha } from "@/core/lifecycle/fingerprint";

describe("Skill fingerprints", () => {
  it("produces deterministic manifests regardless of file order", () => {
    const files = [
      { path: "SKILL.md", size: 12, gitBlobSha: gitBlobSha(Buffer.from("skill")) },
      { path: "assets/note.txt", size: 4, gitBlobSha: gitBlobSha(Buffer.from("note")) },
    ];

    const first = fingerprintManifest(files);
    const second = fingerprintManifest([...files].reverse());

    expect(first).toEqual(second);
    expect(first.algorithm).toBe("sha256-manifest-v1");
    expect(first.fileCount).toBe(2);
    expect(first.totalBytes).toBe(16);
  });

  it("changes when file content changes", () => {
    const original = fingerprintManifest([
      { path: "SKILL.md", size: 5, gitBlobSha: gitBlobSha(Buffer.from("first")) },
    ]);
    const changed = fingerprintManifest([
      { path: "SKILL.md", size: 6, gitBlobSha: gitBlobSha(Buffer.from("second")) },
    ]);

    expect(changed.value).not.toBe(original.value);
  });
});
