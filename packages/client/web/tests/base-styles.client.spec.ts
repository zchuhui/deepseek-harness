/**
 * Shell base sheet contract, asserted against the CSS text on disk: base.css is
 * where the ui-theme token sheets enter the bundle, every sheet it names exists,
 * and each theme override sheet sits between design-platform.css and the
 * scrollbar consumer that reads its tokens.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const THEME_PACKAGE = '@deepseek-ai/dsh-client-ui-theme'
const baseCss = readFileSync(fileURLToPath(new URL('../src/base.css', import.meta.url)), 'utf8')
const themeManifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../ui-theme/package.json', import.meta.url)), 'utf8'),
) as { exports: Record<string, string>; files: string[] }

/**
 * Import specifiers of the sheet, in source order. Quote style and surrounding
 * whitespace are normalized away.
 * @param css - stylesheet text.
 * @returns each `@import` target in the order the sheet lists it.
 */
function importOrder(css: string): string[] {
  // The destructuring default only satisfies noUncheckedIndexedAccess; the
  // group is unconditional in the pattern.
  return [...css.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map(([, specifier = '']) => specifier)
}

/**
 * Resolve a `<package>/styles/<file>` specifier to its source path for a
 * clean-tree test. The package build copies these sheets to their public
 * `lib/styles` export.
 * @param specifier - import specifier from base.css.
 * @returns absolute path of the file the specifier names.
 */
function resolveThemeSheet(specifier: string): string {
  const name = specifier.slice(`${THEME_PACKAGE}/styles/`.length)
  return fileURLToPath(new URL(`../../ui-theme/src/styles/${name}`, import.meta.url))
}

const imports = importOrder(baseCss)
const glassCss = readFileSync(
  fileURLToPath(new URL('../../ui-theme/src/styles/glass-obsidian.css', import.meta.url)),
  'utf8',
)

describe('web shell base.css', () => {
  it('publishes theme sheets from the built artifact plane', () => {
    expect(themeManifest.exports['./styles/*']).toBe('./lib/styles/*')
    expect(themeManifest.files).toContain('lib/styles')
  })

  it('imports every sheet from the theme package and each one exists', () => {
    expect(imports.length).toBeGreaterThan(0)
    for (const specifier of imports) {
      expect(specifier.startsWith(`${THEME_PACKAGE}/styles/`), specifier).toBe(true)
      expect(existsSync(resolveThemeSheet(specifier)), specifier).toBe(true)
    }
  })

  it('imports theme overrides after their token base and before scrollbar consumers', () => {
    // Both sheets bind on `body`, so with scrollbar.css first the alias tokens
    // would still resolve; the order encodes the dependency direction so a
    // later specificity or selector change cannot silently invert it.
    const platform = imports.indexOf(`${THEME_PACKAGE}/styles/design-platform.css`)
    const glass = imports.indexOf(`${THEME_PACKAGE}/styles/glass-obsidian.css`)
    const scrollbar = imports.indexOf(`${THEME_PACKAGE}/styles/scrollbar.css`)
    expect(platform).toBeGreaterThanOrEqual(0)
    expect(glass).toBeGreaterThan(platform)
    expect(scrollbar).toBeGreaterThan(platform)
    expect(scrollbar).toBeGreaterThan(glass)
  })

  it('gives navigation, floating controls, and tooltips the Glass Obsidian surface', () => {
    expect(glassCss).toContain('--dsw-specific-sidebar-nav-item-active: rgba(72, 101, 173, 0.52)')
    expect(glassCss).toContain('--dsw-alias-button-floating-fill: rgba(58, 83, 143, 0.72)')
    expect(glassCss).toContain('--dsw-alias-tooltip-bg: rgba(31, 48, 90, 0.9)')
  })
})
