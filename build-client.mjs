import { mkdirSync, readFileSync } from 'node:fs'
import { build } from 'esbuild'

const platformSrc = 'D:/deepseek-harness/packages/client/web/src/platform.ts'
let externals = ['react']
try {
  const platformText = readFileSync(platformSrc, 'utf8')
  const platformArray = platformText.match(/PLATFORM_MODULES\s*=\s*\[([\s\S]*?)\]/)?.[1]
  if (platformArray) {
    const platformWords = [...platformArray.matchAll(/'([^']+)'/g)].map(m => m[1])
    externals = [...new Set([...platformWords, 'react'])]
  }
} catch {
  console.warn('Could not read platform.ts from deepseek-harness checkout, using fallback externals')
  externals = [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-commands',
    '@deepseek-ai/dsh-client-ui-slots',
    'react'
  ]
}

mkdirSync('lib', { recursive: true })
await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  external: externals,
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-vision-plugin",factory:function(require){var module={exports:{}};' },
  footer: { js: 'return module.exports;}});' },
  outfile: 'lib/client.js',
  logLevel: 'info',
})
console.log('Client bundle built successfully to lib/client.js')
