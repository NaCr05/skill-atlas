import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const fixtureRoot = path.resolve("tests/fixtures");

export default defineConfig({
  testDir: "./scripts/screenshots",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3180",
    colorScheme: "dark",
  },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3180",
    reuseExistingServer: false,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: "3180",
      CODEX_HOME: path.join(fixtureRoot, "codex-home"),
      USERPROFILE: path.join(fixtureRoot, "user-profile"),
      LOCALAPPDATA: path.join(fixtureRoot, "local-app-data"),
    },
  },
  projects: [{ name: "public-screenshots", use: { ...devices["Desktop Chrome"] } }],
});
