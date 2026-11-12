import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { validateSupabaseConfig } from './src/models/supabaseConfig'
import { tastePlugin } from './server/ai/vitePlugin'

export default defineConfig(({ command, mode }) => {
  if (command === 'build' || command === 'serve') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    validateSupabaseConfig(env)
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Server-only env (prefix ''): ANTHROPIC_API_KEY never reaches the browser bundle.
      tastePlugin(loadEnv(mode, process.cwd(), '')),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      watch: {
        usePolling: process.env.DOCKER_WATCH_POLLING === 'true',
        // AI relay request/response files (server/ai/relayClient.ts) are not app code.
        ignored: ['**/.ai-relay/**'],
      },
    },
  }
})
