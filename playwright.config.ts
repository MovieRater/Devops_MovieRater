import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: '**/*.spec.ts',
    reporter: [['list'], ['html', { open: 'never' }]],
    projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
    use: {
        baseURL: 'http://127.0.0.1:5173',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: false,
        // Isolated public placeholders override local files and CI production values.
        env: {
            VITE_SUPABASE_URL: 'https://example.supabase.co',
            VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ci_browser_placeholder',
        },
    },
});
