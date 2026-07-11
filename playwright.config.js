import { defineConfig, devices } from "@playwright/test";

const PORT = 8791;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // Auto-serve the static site for tests; reuse a server if one's already up.
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
