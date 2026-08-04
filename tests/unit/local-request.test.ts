import { describe, expect, it } from "vitest";

import { assertLocalMutationRequest } from "@/core/security/local-request";
import { SkillAtlasError } from "@/core/errors/skill-atlas-error";

describe("local mutation request guard", () => {
  it("accepts same-origin localhost requests", () => {
    const request = new Request("http://127.0.0.1:3000/api/install", {
      headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
    });
    expect(() => assertLocalMutationRequest(request)).not.toThrow();
  });

  it("blocks remote origins and hosts", () => {
    const remoteOrigin = new Request("http://127.0.0.1:3000/api/install", {
      headers: { host: "127.0.0.1:3000", origin: "https://attacker.example" },
    });
    expect(() => assertLocalMutationRequest(remoteOrigin)).toThrowError(
      expect.objectContaining<Partial<SkillAtlasError>>({ code: "LOCAL_REQUEST_REJECTED" }),
    );
    const remoteHost = new Request("http://127.0.0.1:3000/api/install", {
      headers: { host: "attacker.example" },
    });
    expect(() => assertLocalMutationRequest(remoteHost)).toThrowError(
      expect.objectContaining<Partial<SkillAtlasError>>({ code: "LOCAL_REQUEST_REJECTED" }),
    );
  });
});
