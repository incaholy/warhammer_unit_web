import { describe, it, expect } from 'vitest'
// Import the raw stylesheet (Vite `?raw`) so the test asserts the token
// *contract* SPEC.md documents, independent of any runtime cascade.
import theme from './theme.css?raw'

describe('design tokens (theme.css)', () => {
  it('defines the core palette tokens', () => {
    for (const token of ['--paper', '--panel', '--ink', '--muted', '--rule', '--danger']) {
      expect(theme).toContain(token)
    }
  })

  it('defines the three type families', () => {
    expect(theme).toContain('--font-serif')
    expect(theme).toContain('--font-sans')
    expect(theme).toContain('--font-mono')
  })

  it('imports the three design fonts', () => {
    expect(theme).toMatch(/Newsreader/)
    expect(theme).toMatch(/Archivo/)
    expect(theme).toMatch(/Space\+Mono/)
  })
})
