import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const codexHome = path.resolve("tests/fixtures/codex-home");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3178",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -- -p 3178",
    url: "http://127.0.0.1:3178",
    reuseExistingServer: false,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      USERPROFILE: path.resolve("tests/fixtures/user-profile"),
      LOCALAPPDATA: path.resolve("tests/fixtures/local-app-data"),
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
