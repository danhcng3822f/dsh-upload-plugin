# Custom Provider Vision & Files Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete DeepSeek Harness plugin (`dsh-vision-plugin`) that adds "Add photos" and "Add files" options to the chat UI plus (`+`) menu, enforces vision model support for photos, uploads files/photos to `<workspace>/uploads/`, and guides the model to use `read_image` for photos and `read` for files.

**Architecture:** A dual-face Cordis plugin (Host + Web Client). The Host face registers HTTP endpoints on `ctx.webServer` to check model vision capability via `ctx.llm.resolveModelInfo` and save uploaded files to `<workspace>/uploads/`. The Client face registers `/photos` and `/files` into `ctx.commandUi`, opens browser file pickers, uploads files to the host, and inserts prompt text into the chat draft.

**Tech Stack:** TypeScript, Node.js (v22), Cordis micro-kernel, esbuild, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-18-custom-provider-vision-and-files-plugin-design.md`

## Global Constraints

- Working directory: `D:\dsh-vision-plugim`.
- Plugin package name: `dsh-vision-plugin`.
- Must compile to `lib/index.js` (Host) and `lib/client.js` (Client bundle wrapped in `window.__ModuleLoader__.load`).
- Uploads must be written inside `<workspace>/uploads/` with unique filenames if collisions occur.
- Photo formats accepted: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`.
- File formats accepted: any file.

---

### Task 1: Package Scaffolding & Configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `cordis.patch.yml`
- Create: `build-client.mjs`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: Package definition for Cordis and DeepSeek Harness module loader.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "dsh-vision-plugin",
  "version": "0.1.0",
  "description": "DeepSeek Harness plugin providing Add photos and Add files actions in chat UI with vision validation",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
    },
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "files": [
    "lib",
    "src",
    "cordis.patch.yml",
    "README.md"
  ],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-connection",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-commands",
        "@deepseek-ai/dsh-client-ui-slots"
      ],
      "platform": "web"
    }
  },
  "scripts": {
    "build:host": "tsc -p tsconfig.json",
    "build:client": "node build-client.mjs",
    "build": "npm run build:host && npm run build:client",
    "test": "vitest run"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@types/node": "^22.0.0",
    "esbuild": "^0.25.0",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationDir": "./lib/types",
    "outDir": "./lib",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `cordis.patch.yml`**

```yaml
- insert:
    - id: vision-plugin
      name: dsh-vision-plugin
```

- [ ] **Step 4: Create `build-client.mjs`**

```javascript
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
```

- [ ] **Step 5: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
})
```

- [ ] **Step 6: Run `pnpm install` in `D:\dsh-vision-plugim`**

Run: `pnpm install`
Expected: Dependencies installed or linked.

---

### Task 2: Shared Types and File Helper Utilities

**Files:**
- Create: `src/types.ts`
- Create: `src/host/file-utils.ts`
- Create: `tests/file-utils.spec.ts`

**Interfaces:**
- Consumes: Node filesystem APIs.
- Produces:
  - `VisionCheckResponse`: `{ hasVision: boolean; provider?: string; model?: string; reason?: string }`
  - `FileUploadResponse`: `{ ok: boolean; filename: string; relativePath: string; fullPath: string; isPhoto: boolean; error?: string }`
  - `resolveUniqueUploadPath(uploadsDir: string, originalName: string): Promise<string>`
  - `isSupportedPhotoExtension(fileName: string): boolean`

- [ ] **Step 1: Write the failing unit tests for `file-utils`**

```typescript
// tests/file-utils.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isSupportedPhotoExtension, resolveUniqueUploadPath } from '../src/host/file-utils.ts'

describe('file-utils', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'dsh-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('identifies supported photo extensions correctly', () => {
    expect(isSupportedPhotoExtension('cat.png')).toBe(true)
    expect(isSupportedPhotoExtension('dog.JPG')).toBe(true)
    expect(isSupportedPhotoExtension('photo.jpeg')).toBe(true)
    expect(isSupportedPhotoExtension('img.webp')).toBe(true)
    expect(isSupportedPhotoExtension('anim.gif')).toBe(true)
    expect(isSupportedPhotoExtension('doc.pdf')).toBe(false)
    expect(isSupportedPhotoExtension('code.ts')).toBe(false)
  })

  it('resolves unique path when file does not exist', async () => {
    const resolved = await resolveUniqueUploadPath(tempDir, 'photo.png')
    expect(resolved).toBe(join(tempDir, 'photo.png'))
  })

  it('increments suffix when filename already exists', async () => {
    await writeFile(join(tempDir, 'photo.png'), 'existing')
    const resolved = await resolveUniqueUploadPath(tempDir, 'photo.png')
    expect(resolved).toBe(join(tempDir, 'photo_1.png'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL due to missing `file-utils.ts`.

- [ ] **Step 3: Implement `src/types.ts` and `src/host/file-utils.ts`**

Create `src/types.ts`:
```typescript
export interface VisionCheckResponse {
  hasVision: boolean
  provider?: string
  model?: string
  reason?: string
}

export interface FileUploadPayload {
  sessionId: string
  fileName: string
  fileBase64: string
  isPhoto: boolean
}

export interface FileUploadResponse {
  ok: boolean
  filename?: string
  relativePath?: string
  fullPath?: string
  isPhoto?: boolean
  error?: string
}
```

Create `src/host/file-utils.ts`:
```typescript
import { access, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, extname, join } from 'node:path'

const PHOTO_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

export function isSupportedPhotoExtension(fileName: string): boolean {
  const ext = extname(fileName).toLowerCase()
  return PHOTO_EXTENSIONS.has(ext)
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function resolveUniqueUploadPath(uploadsDir: string, originalName: string): Promise<string> {
  await mkdir(uploadsDir, { recursive: true })
  const ext = extname(originalName)
  const base = basename(originalName, ext)

  let candidate = join(uploadsDir, originalName)
  let counter = 1

  while (await fileExists(candidate)) {
    candidate = join(uploadsDir, `${base}_${counter}${ext}`)
    counter++
  }

  return candidate
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS.

---

### Task 3: Host Service Implementation (Vision Check & File Upload)

**Files:**
- Create: `src/host/upload-service.ts`
- Create: `src/host/vision-service.ts`
- Create: `src/index.ts`
- Create: `tests/host-endpoints.spec.ts`

**Interfaces:**
- Consumes: `@deepseek-ai/cordis` Context, `ctx.webServer`, `ctx.llm`, `ctx.workspaceRegistry`.
- Produces: Host plugin entry point `apply(ctx: Context)`.

- [ ] **Step 1: Write unit tests for host endpoints**

```typescript
// tests/host-endpoints.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { handleCheckVision, handleUpload } from '../src/host/endpoints.ts'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('host endpoints', () => {
  it('detects model vision capability correctly', async () => {
    const mockLlm = {
      resolveModelInfo: vi.fn().mockResolvedValue({
        id: 'gpt-4o',
        inputModalities: ['text', 'image'],
      }),
    }
    const result = await handleCheckVision(mockLlm as any, 'openai', 'gpt-4o')
    expect(result.hasVision).toBe(true)
    expect(result.model).toBe('gpt-4o')
  })

  it('reports no vision if model only has text modality', async () => {
    const mockLlm = {
      resolveModelInfo: vi.fn().mockResolvedValue({
        id: 'deepseek-chat',
        inputModalities: ['text'],
      }),
    }
    const result = await handleCheckVision(mockLlm as any, 'deepseek', 'deepseek-chat')
    expect(result.hasVision).toBe(false)
  })

  it('saves uploaded file to uploads directory', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'dsh-upload-'))
    try {
      const base64Data = Buffer.from('hello world').toString('base64')
      const result = await handleUpload(tempDir, 'test.txt', base64Data, false)
      expect(result.ok).toBe(true)
      expect(result.relativePath).toBe('uploads/test.txt')

      const saved = await readFile(result.fullPath!, 'utf8')
      expect(saved).toBe('hello world')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL due to missing `endpoints.ts`.

- [ ] **Step 3: Implement `src/host/endpoints.ts`, `upload-service.ts`, `vision-service.ts`, `src/index.ts`**

Create `src/host/endpoints.ts`:
```typescript
import { writeFile } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import type { FileUploadResponse, VisionCheckResponse } from '../types.ts'
import { isSupportedPhotoExtension, resolveUniqueUploadPath } from './file-utils.ts'

export async function handleCheckVision(
  llm: any,
  provider?: string,
  model?: string
): Promise<VisionCheckResponse> {
  if (!provider || !model) {
    return {
      hasVision: false,
      reason: 'No active provider/model identified for current session',
    }
  }

  if (!llm || typeof llm.resolveModelInfo !== 'function') {
    return {
      hasVision: true, // Fallback if llm service not introspectable
      provider,
      model,
    }
  }

  try {
    const info = await llm.resolveModelInfo(provider, model)
    const modalities: string[] = info.inputModalities ?? ['text']
    const hasVision = modalities.includes('image')
    return {
      hasVision,
      provider,
      model,
      reason: hasVision ? undefined : `Model "${model}" does not declare image input modality`,
    }
  } catch (err: any) {
    return {
      hasVision: false,
      provider,
      model,
      reason: err?.message ?? 'Failed to query model info',
    }
  }
}

export async function handleUpload(
  workspaceDir: string,
  originalName: string,
  base64Data: string,
  isPhoto: boolean
): Promise<FileUploadResponse> {
  try {
    const uploadsDir = join(workspaceDir, 'uploads')
    const targetPath = await resolveUniqueUploadPath(uploadsDir, originalName)
    const buffer = Buffer.from(base64Data, 'base64')
    await writeFile(targetPath, buffer)

    const finalName = basename(targetPath)
    const relPath = relative(workspaceDir, targetPath).replace(/\\/g, '/')

    return {
      ok: true,
      filename: finalName,
      relativePath: relPath,
      fullPath: targetPath,
      isPhoto,
    }
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message ?? 'Failed to write upload file',
    }
  }
}
```

Create `src/index.ts`:
```typescript
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleCheckVision, handleUpload } from './host/endpoints.ts'

export const name = 'dsh-vision-plugin'

export function apply(ctx: Context): void {
  // Inject webServer route if webServer is available
  ctx.inject(['webServer'], (scoped: Context) => {
    const webServer = scoped.get('webServer') as any
    if (!webServer) return

    // 1. Endpoint: Check vision
    webServer.register({
      kind: 'prefix',
      path: '/api/vision-plugin/check-vision',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`)
        const sessionId = url.searchParams.get('sessionId')

        // Resolve current session model via apiproxy / sessions if available
        let provider = url.searchParams.get('provider') ?? undefined
        let model = url.searchParams.get('model') ?? undefined

        const sessions = ctx.get('sessions') as any
        if (sessionId && sessions && typeof sessions.binding === 'function') {
          const binding = sessions.binding(sessionId)
          const config = binding?.session?.requestHeader?.()?.config
          if (config) {
            provider = provider ?? config.provider
            model = model ?? config.model
          }
        }

        const llm = ctx.get('llm')
        const result = await handleCheckVision(llm, provider, model)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      },
    })

    // 2. Endpoint: Upload file
    webServer.register({
      kind: 'exact',
      path: '/api/vision-plugin/upload',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }))
          return
        }

        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body)
            const { sessionId, fileName, fileBase64, isPhoto } = payload

            let workspaceDir = process.cwd()
            const workspaceRegistry = ctx.get('workspaceRegistry') as any
            if (workspaceRegistry) {
              const ws = workspaceRegistry.get?.(sessionId) ?? workspaceRegistry.current?.()
              if (ws?.path) workspaceDir = ws.path
            }

            const response = await handleUpload(workspaceDir, fileName, fileBase64, Boolean(isPhoto))
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(response))
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: err?.message ?? 'Invalid request payload' }))
          }
        })
      },
    })
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS.

---

### Task 4: Client Service Implementation (Plus Menu Commands & Dialogs)

**Files:**
- Create: `src/client/uploader.ts`
- Create: `src/client/commands.ts`
- Create: `src/client/index.ts`
- Create: `tests/client-uploader.spec.ts`

**Interfaces:**
- Consumes: `@deepseek-ai/cordis`, `ctx.commandUi`.
- Produces: Client entry point registering `/photos` and `/files`.

- [ ] **Step 1: Write test for client prompt generation helper**

```typescript
// tests/client-uploader.spec.ts
import { describe, it, expect } from 'vitest'
import { generateFileDraftPrompt } from '../src/client/uploader.ts'

describe('client uploader prompt generation', () => {
  it('generates prompt for photos referencing read_image', () => {
    const prompt = generateFileDraftPrompt('uploads/scenery.png', true)
    expect(prompt).toContain('uploads/scenery.png')
    expect(prompt).toContain('read_image')
  })

  it('generates prompt for general files referencing read tool', () => {
    const prompt = generateFileDraftPrompt('uploads/notes.txt', false)
    expect(prompt).toContain('uploads/notes.txt')
    expect(prompt).toContain('read')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL due to missing `uploader.ts`.

- [ ] **Step 3: Implement `src/client/uploader.ts`, `src/client/commands.ts`, and `src/client/index.ts`**

Create `src/client/uploader.ts`:
```typescript
import type { FileUploadResponse, VisionCheckResponse } from '../types.ts'

export function generateFileDraftPrompt(relativePath: string, isPhoto: boolean): string {
  if (isPhoto) {
    return `Tôi vừa tải lên ảnh \`${relativePath}\`. Bạn hãy gọi tool \`read_image\` để xem và phân tích ảnh này nhé: `
  }
  return `Tôi vừa tải lên file \`${relativePath}\`. Bạn hãy đọc nội dung file này (dùng tool \`read\` hoặc tool đọc file phù hợp) và hỗ trợ tôi: `
}

export async function checkModelVision(sessionId: string): Promise<VisionCheckResponse> {
  try {
    const res = await fetch(`/api/vision-plugin/check-vision?sessionId=${encodeURIComponent(sessionId)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err: any) {
    return {
      hasVision: true, // Optimistic fallback if network request fails
    }
  }
}

export function pickFileFromBrowser(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'

    input.onchange = () => {
      const file = input.files?.[0] ?? null
      document.body.removeChild(input)
      resolve(file)
    }

    input.oncancel = () => {
      document.body.removeChild(input)
      resolve(null)
    }

    document.body.appendChild(input)
    input.click()
  })
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function uploadFileToWorkspace(
  sessionId: string,
  file: File,
  isPhoto: boolean
): Promise<FileUploadResponse> {
  const fileBase64 = await fileToBase64(file)
  const res = await fetch('/api/vision-plugin/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      fileName: file.name,
      fileBase64,
      isPhoto,
    }),
  })

  if (!res.ok) {
    throw new Error(`Upload failed with status ${res.status}`)
  }
  return await res.json()
}
```

Create `src/client/commands.ts`:
```typescript
import type { Context } from '@deepseek-ai/cordis'
import {
  checkModelVision,
  generateFileDraftPrompt,
  pickFileFromBrowser,
  uploadFileToWorkspace,
} from './uploader.ts'

export function registerVisionCommands(ctx: Context): void {
  const commandUi = ctx.get('commandUi') as any
  if (!commandUi || typeof commandUi.register !== 'function') {
    return
  }

  // 1. Add photos command
  commandUi.register({
    name: 'photos',
    description: 'Add photos (Upload ảnh vào workspace và yêu cầu model xem qua read_image)',
    available: () => true,
    ui: {
      kind: 'popupSelect',
      options: async (session: any) => {
        // Run vision check first
        const vision = await checkModelVision(session.sessionId)
        if (!vision.hasVision) {
          return [
            {
              id: 'unsupported',
              label: '❌ Model hiện tại không hỗ trợ Vision (ảnh)',
              detail: vision.reason ?? 'Vui lòng chọn model có modality image',
            },
          ]
        }
        return [
          {
            id: 'pick-photo',
            label: '📷 Chọn ảnh từ máy tính để tải lên workspace',
            detail: 'Hỗ trợ .png, .jpg, .jpeg, .webp, .gif',
          },
        ]
      },
      onSelect: async (option: any, session: any) => {
        if (option.id === 'unsupported') {
          return
        }

        const file = await pickFileFromBrowser('image/png,image/jpeg,image/webp,image/gif')
        if (!file) return

        try {
          const uploadRes = await uploadFileToWorkspace(session.sessionId, file, true)
          if (uploadRes.ok && uploadRes.relativePath) {
            const prompt = generateFileDraftPrompt(uploadRes.relativePath, true)
            // Insert into composer draft via active input or session event
            const textarea = document.querySelector('textarea[data-input-target], textarea') as HTMLTextAreaElement | null
            if (textarea) {
              const current = textarea.value
              textarea.value = current ? `${current}\n${prompt}` : prompt
              textarea.dispatchEvent(new Event('input', { bubbles: true }))
              textarea.focus()
            }
          }
        } catch (err: any) {
          alert(`Lỗi upload ảnh: ${err?.message ?? err}`)
        }
      },
    },
  })

  // 2. Add files command
  commandUi.register({
    name: 'files',
    description: 'Add files (Tải file/tài liệu vào workspace để model đọc qua tool read)',
    available: () => true,
    ui: {
      kind: 'popupSelect',
      options: async () => [
        {
          id: 'pick-file',
          label: '📄 Chọn file từ máy tính để tải lên workspace',
          detail: 'Hỗ trợ mọi định dạng tệp (.txt, .pdf, .json, .csv, code...)',
        },
      ],
      onSelect: async (_option: any, session: any) => {
        const file = await pickFileFromBrowser('*/*')
        if (!file) return

        try {
          const uploadRes = await uploadFileToWorkspace(session.sessionId, file, false)
          if (uploadRes.ok && uploadRes.relativePath) {
            const prompt = generateFileDraftPrompt(uploadRes.relativePath, false)
            const textarea = document.querySelector('textarea[data-input-target], textarea') as HTMLTextAreaElement | null
            if (textarea) {
              const current = textarea.value
              textarea.value = current ? `${current}\n${prompt}` : prompt
              textarea.dispatchEvent(new Event('input', { bubbles: true }))
              textarea.focus()
            }
          }
        } catch (err: any) {
          alert(`Lỗi upload file: ${err?.message ?? err}`)
        }
      },
    },
  })
}
```

Create `src/client/index.ts`:
```typescript
import type { Context } from '@deepseek-ai/cordis'
import { registerVisionCommands } from './commands.ts'

export const name = 'dsh-vision-plugin-client'

export function apply(ctx: Context): void {
  registerVisionCommands(ctx)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS.

---

### Task 5: Build Verification & Profile Integration

**Files:**
- Create: `README.md`
- Verify: `lib/index.js`
- Verify: `lib/client.js`

- [ ] **Step 1: Build the plugin artifacts**

Run: `pnpm run build`
Expected:
- `lib/index.js` created via `tsc`.
- `lib/client.js` created via `esbuild` with the closure factory banner.

- [ ] **Step 2: Create comprehensive `README.md` with installation & usage instructions**

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests pass.
