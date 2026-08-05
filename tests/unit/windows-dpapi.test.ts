import { describe, expect, it } from "vitest";

import { protectSecret, unprotectSecret } from "@/core/ai/windows-dpapi";

describe("Windows DPAPI", () => {
  const windowsIt = process.platform === "win32" ? it : it.skip;

  // Keep the real PowerShell integration in one test file so Vitest workers do not contend for DPAPI startup.
  windowsIt("round-trips a secret without placing plaintext in the ciphertext", async () => {
    const secret = "skill-atlas-dpapi-roundtrip";
    const ciphertext = await protectSecret(secret);
    expect(ciphertext).not.toContain(secret);
    expect(await unprotectSecret(ciphertext)).toBe(secret);
  }, 30_000);
});
