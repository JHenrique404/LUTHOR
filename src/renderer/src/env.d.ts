/// <reference types="vite/client" />

import type { LuthorApi } from '@shared/ipc/contract'

declare global {
  interface Window {
    /** API exposta pelo preload via contextBridge. Ausente em testes (jsdom). */
    luthor?: LuthorApi
  }
}

export {}
