import { describe, expect, it } from "vitest";

import { APP_VERSION, UPGRADE_VALIDATION_LABEL } from "@/core/app-version";

describe("application version", () => {
  it("uses the requested #107 upgrade validation version", () => {
    expect(APP_VERSION).toBe("0.2.1-poc.1");
    expect(UPGRADE_VALIDATION_LABEL).toBe("#107 升级验证版 · v0.2.1-poc.1");
  });
});
