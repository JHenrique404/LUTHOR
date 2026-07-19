import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

const shared = resolve(__dirname, 'src/shared')

/**
 * CSP por ambiente, injetada no lugar do token __CSP__ do index.html.
 * - dev: só o mínimo para Vite/HMR (websocket + preamble inline do react-refresh).
 * - prod (build empacotado): sem ws:, sem localhost, sem inline scripts.
 */
const CSP_BASE = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'"
]
const CSP_DEV = [...CSP_BASE, "script-src 'self' 'unsafe-inline'", "connect-src 'self' ws: http://localhost:*"].join('; ')
const CSP_PROD = [...CSP_BASE, "script-src 'self'", "connect-src 'self'"].join('; ')

function cspPlugin(): Plugin {
  let isDev = false
  return {
    name: 'luthor-csp',
    configResolved(config) {
      isDev = config.command === 'serve'
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replaceAll('__CSP__', isDev ? CSP_DEV : CSP_PROD)
      }
    }
  }
}

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } }
  },
  preload: {
    resolve: { alias: { '@shared': shared } }
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': shared,
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss(), cspPlugin()]
  }
})
