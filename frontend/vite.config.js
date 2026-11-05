import { readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // The supplied style guide is a local reference only. It lives in public/
      // for local access but must never ship in the built site or container.
      name: 'exclude-local-reference-pdf',
      async closeBundle() {
        const outputDirectory = resolve(import.meta.dirname, 'dist')
        for (const file of await readdir(outputDirectory)) {
          if (/^Church of the Nazarene Style Guide.*\.pdf$/i.test(file)) {
            await rm(resolve(outputDirectory, file), { force: true })
          }
        }
      },
    },
  ],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
