import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LatestRequestCoordinator } from "@/core/async/latest-request";
import {
  apiErrorResponse,
  SkillAtlasError,
} from "@/core/errors/skill-atlas-error";
import { ReviewPlanStore } from "@/core/review-plans/review-plan-store";
import { summarizeSkillInventory } from "@/core/skills/summary";
import type { SkillInventory, SkillRecord } from "@/core/skills/types";

describe("P1 architecture boundaries", () => {
  it("removes full instructions from inventory summaries", () => {
    const skill = {
      id: "sample",
      name: "sample",
      displayName: "Sample",
      description: "A sample Skill.",
      instructions: "A".repeat(50_000),
    } as SkillRecord;
    const inventory = {
      codexHome: "C:/Users/test/.codex",
      skills: [skill],
    } as SkillInventory;

    const summary = summarizeSkillInventory(inventory);

    expect(summary.skills[0]).not.toHaveProperty("instructions");
    expect(JSON.stringify(summary).length).toBeLessThan(JSON.stringify(inventory).length / 10);
  });

  it("makes newer requests invalidate older completions within the same lane", () => {
    const requests = new LatestRequestCoordinator();
    const first = requests.start("market");
    const second = requests.start("market");

    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    requests.cancel("market");
    expect(second.isCurrent()).toBe(false);
  });

  it("keeps review plans bounded, expiring, and single-use", () => {
    const plans = new ReviewPlanStore<{ expiresAt: string; value: number }>(2);
    const now = new Date("2026-08-04T00:00:00.000Z");
    const later = "2026-08-04T00:10:00.000Z";
    plans.put("a", { expiresAt: later, value: 1 }, now);
    plans.put("b", { expiresAt: later, value: 2 }, now);
    plans.put("c", { expiresAt: later, value: 3 }, now);

    expect(plans.consume("a", now)).toEqual({ status: "missing" });
    expect(plans.consume("b", now)).toMatchObject({ status: "ready", plan: { value: 2 } });
    expect(plans.consume("b", now)).toEqual({ status: "missing" });
    plans.put("expired", { expiresAt: "2026-08-03T23:59:59.000Z", value: 4 }, new Date("2026-08-03T23:59:58.000Z"));
    expect(plans.consume("expired", now)).toEqual({ status: "expired" });
  });

  it("returns stable localized API error codes instead of raw core messages", async () => {
    const request = new Request("http://127.0.0.1/api/install/confirm", {
      headers: { "X-Skill-Atlas-Language": "en" },
    });
    const response = apiErrorResponse(
      request,
      new SkillAtlasError("INSTALL_PLAN_EXPIRED"),
      "INSTALL_FAILED",
    );
    const payload = await response.json() as { code: string; error: string };

    expect(payload.code).toBe("INSTALL_PLAN_EXPIRED");
    expect(payload.error).toMatch(/expired/i);
    expect(payload.error).not.toMatch(/\p{Script=Han}/u);
  });

  it("keeps globals.css as an ordered entry point instead of a page stylesheet", async () => {
    const location = path.join(process.cwd(), "src", "app", "globals.css");
    const content = await readFile(location, "utf8");

    expect(content.trim().split(/\r?\n/)).toHaveLength(17);
    expect(content).toContain('../styles/tokens.css');
    expect(content).toContain('../styles/base.css');
    expect(content).toContain('../styles/pages/workbench.css');
    expect(content).toContain('../styles/pages/lifecycle.css');
    expect(content).toContain('../styles/pages/operations.css');
    expect(content).toContain('../styles/pages/storage.css');
    expect(content).toContain('../styles/pages/management.css');
  });
});
