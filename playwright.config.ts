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
    command: "npm run start",
    url: "http://127.0.0.1:3178",
    reuseExistingServer: false,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      USERPROFILE: path.resolve("tests/fixtures/user-profile"),
      LOCALAPPDATA: path.resolve("tests/fixtures/local-app-data"),
      AI_PROVIDER: "",
      OPENAI_API_KEY: "",
      OPENAI_MODEL: "",
      DEEPSEEK_API_KEY: "",
      DEEPSEEK_MODEL: "",
      HOSTNAME: "127.0.0.1",
      PORT: "3178",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
