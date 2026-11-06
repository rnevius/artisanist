import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ARTISANIST_E2E_DIR ||= mkdtempSync(
  join(tmpdir(), 'artisanist-e2e-'),
);

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  globalTeardown: './test/browser/teardown.js',
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    env: {
      PORT: '3100',
      HOST: '127.0.0.1',
      DATABASE_PATH: join(process.env.ARTISANIST_E2E_DIR, 'recipes.sqlite'),
    },
  },
});
