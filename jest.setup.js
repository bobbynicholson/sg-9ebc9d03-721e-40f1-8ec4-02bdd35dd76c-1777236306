// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Server-side vault helpers use Web Crypto. Supply the globals consistently
// across Jest's Node and jsdom environments.
const { TextDecoder, TextEncoder } = require('util')
if (!globalThis.TextEncoder) Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder })
if (!globalThis.TextDecoder) Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder })
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: require('crypto').webcrypto, configurable: true })
}
process.env.ENCRYPTION_KEY ||= '0123456789abcdef'.repeat(4)

// Mock environment variables for tests
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

// Mock Next.js router
jest.mock('next/router', () => require('next-router-mock'))

// Mock Next.js dynamic imports
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (...args) => {
    const dynamicModule = jest.requireActual('next/dynamic')
    const dynamicActualComp = dynamicModule.default
    const RequiredComponent = dynamicActualComp(args[0])
    RequiredComponent.preload ? RequiredComponent.preload() : RequiredComponent.render.preload()
    return RequiredComponent
  },
}))
