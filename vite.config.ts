import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  if (command === 'build' || command === 'serve') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    const supabaseUrl = env.VITE_SUPABASE_URL?.trim()
    const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

    if (!supabaseUrl) {
      throw new Error('VITE_SUPABASE_URL mangler. Udfyld variablen før build eller opstart.')
    }

    if (!supabaseKey) {
      throw new Error(
        'VITE_SUPABASE_PUBLISHABLE_KEY mangler. Udfyld variablen før build eller opstart.',
      )
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(supabaseUrl)
    } catch {
      throw new Error('VITE_SUPABASE_URL skal være en gyldig HTTP- eller HTTPS-URL.')
    }

    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      throw new Error(
        'VITE_SUPABASE_URL skal være en HTTP- eller HTTPS-URL uden loginoplysninger.',
      )
    }

    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(supabaseKey)) {
      throw new Error(
        'VITE_SUPABASE_PUBLISHABLE_KEY skal være en offentlig publishable key ' +
          '(sb_publishable_...). Secret keys og service_role må ikke bruges i frontend.',
      )
    }
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
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/unit/**/*.test.{ts,tsx}'],
      coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['src/**'] },
    },
  }
})
