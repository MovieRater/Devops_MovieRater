import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Separate from Vite's app configuration: tests never load production .env files.
export default defineConfig({
  envDir: false,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx,mjs,mts,cjs,cts}'],
    clearMocks: true,
  },
});
