import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Separate from Vite's app configuration: tests never load production .env files.
export default defineConfig({
  envDir: false,
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{js,jsx,ts,tsx,mjs,mts,cjs,cts}',
      'tests/unit/**/*.{test,spec}.{js,jsx,ts,tsx,mjs,mts,cjs,cts}',
    ],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['src/**'] },
    clearMocks: true,
  },
});
