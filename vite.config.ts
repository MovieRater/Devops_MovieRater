import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { validateSupabaseConfig } from './src/models/supabaseConfig'

export default defineConfig(({ command, mode }) => {
  if (command === 'build' || command === 'serve') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    validateSupabaseConfig(env)
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      watch: {
        usePolling: process.env.DOCKER_WATCH_POLLING === 'true',
      },
    },
  }
})
