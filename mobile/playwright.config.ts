import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/browser', timeout: 60000, fullyParallel: false, workers: 1, reporter: 'list', use: { baseURL: 'http://127.0.0.1:8100', viewport: { width: 390, height: 844 }, screenshot: 'only-on-failure', trace: 'retain-on-failure', timezoneId: 'Asia/Kolkata' } });
