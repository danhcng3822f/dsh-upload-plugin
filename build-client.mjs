import { mkdirSync, readFileSync } from 'node:fs'
import { build } from 'esbuild'

/**
 * Mirror of the harness's `PLATFORM_MODULES`
 * (`packages/client/web/src/platform.ts`), used when that file cannot be read —
 * a clone on another machine, or a harness checkout somewhere other than the
 * path below. It is the SAME list, verbatim, so the two cannot drift: every
 * specifier here is seeded into the shell's frozen module table, and marking
 * exactly those external is what keeps the plugin's `require` resolving to the
 * shell's own copies instead of inlining a second one.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is the one that has already bitten:
 * it is imported at runtime by `src/client/composer/model-seat.tsx` and is
 * deliberately not an npm dependency, so leaving it out of this list makes the
 * documented source build (`git clone && pnpm install && pnpm run build`) fail
 * with `Could not resolve "@deepseek-ai/dsh-client-ui-primitives"`.
 */
const platformModulesFallback = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

const platformSrc = 'D:/deepseek-harness/packages/client/web/src/platform.ts'
let externals = platformModulesFallback
try {
  const platformText = readFileSync(platformSrc, 'utf8')
  const platformArray = platformText.match(/PLATFORM_MODULES\s*=\s*\[([\s\S]*?)\]/)?.[1]
  if (platformArray) {
    const platformWords = [...platformArray.matchAll(/'([^']+)'/g)].map(m => m[1])
    externals = [...new Set([...platformWords, 'react'])]
  }
} catch {
  // A warning, not a hard failure: the fallback is the same list, so an
  // off-machine build is correct rather than merely tolerated — and a genuinely
  // missing external still fails loudly at bundle time, as esbuild's own
  // "Could not resolve" rather than as a platform-mismatch story.
  console.warn(`Could not read ${platformSrc}, using the built-in mirror of PLATFORM_MODULES`)
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const pluginId = pkg.name ?? 'dsh-upload-plugin'

mkdirSync('lib', { recursive: true })
await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  external: externals,
  banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(pluginId)},factory:function(require){var module={exports:{}};` },
  footer: { js: 'return module.exports;}});' },
  outfile: 'lib/client.js',
  logLevel: 'info',
})
console.log('Client bundle built successfully to lib/client.js')
