import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Com globals desativados o RTL não registra cleanup sozinho.
afterEach(() => cleanup())
