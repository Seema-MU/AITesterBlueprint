import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// Browser-safe tunnel to the local LM Studio server: Vite proxies same-origin
// requests so the browser never hits its missing CORS headers.
const lmStudioProxy = {
  '/lmstudio': {
    target: 'http://127.0.0.1:1234',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/lmstudio/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Read GROQ_API_KEY from the process env OR a project .env.local file.
  const env = loadEnv(mode, process.cwd(), '')
  const groqKey = process.env.GROQ_API_KEY || env.GROQ_API_KEY || ''

  return {
    plugins: [react(), tailwindcss()],
    server: { proxy: lmStudioProxy },
    preview: { proxy: lmStudioProxy },
    // Expose the key to the Settings "Groq" preset. The app is local-first BYOK:
    // the key ends up in the browser (IndexedDB) — never commit it.
    define: {
      'import.meta.env.VITE_GROQ_API_KEY': JSON.stringify(groqKey),
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }
})
