# Composer-native Attach, Effort & Vision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the plugin's photo/file attachment into the composer tool row, mint a draft chip instead of pasting instruction text, inject the read instruction only into the message that sends the attachment, and give the composer a combined model + reasoning-effort control.

**Architecture:** Everything lives in `dsh-upload-plugin`'s client half and uses only public DSH extension points. Pure logic (token minting, instruction text, effort menu, settings row rewrite) sits in dependency-free modules that vitest can exercise directly; React components are thin shells over them. The one runtime dependency on DSH internals is `sessions.scope(id)` → `actx.bail(...)`, which is how a plugin mints a reference chip.

**Tech Stack:** TypeScript 5.8, React 18 (externalised), esbuild bundle via `build-client.mjs`, vitest 3 (node environment), Cordis plugin kernel.

**Spec:** `docs/superpowers/specs/2026-09-26-composer-native-attach-effort-vision-design.md`

## Global Constraints

- Target repo: `D:\dsh-vision-plugim`. Never edit `D:\deepseek-harness`.
- Package name stays `dsh-upload-plugin`; the client bundle id must stay equal to it (`build-client.mjs` reads `package.json.name`).
- Only these specifiers may be imported at runtime: `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-web-react`, `@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-ui-attachment`, `@deepseek-ai/dsh-client-schema-form`. Every other `@deepseek-ai/...` import must be `import type`.
- Reach DSH services only through `ctx.get('name')`: `slots`, `sessions`, `modelDirectories`, `inputTriggers`, `locale`, `connection`, `remote`.
- vitest runs in the `node` environment — no DOM. Testable logic must be pure or take an injected storage.
- Test command: `pnpm test`. Build command: `pnpm run build`.
- Commit after every task.
- Vietnamese copy is the product copy for user-facing instruction strings; keep the existing wording.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/client/attachments.ts` | NEW — record type, token/ref minting, list operations, active-set derivation (pure) |
| `src/client/attachment-store.ts` | NEW — per-session record store with injected storage + ref index |
| `src/client/instruction.ts` | NEW — record → model-facing instruction (pure) |
| `src/client/reference.ts` | NEW — the `InputTriggerSource`, its codec, and chip minting |
| `src/client/effort.ts` | NEW — reasoning metadata → menu choices (pure) |
| `src/client/vision-setting.ts` | NEW — model row read-modify-write for the image flag (pure) |
| `src/client/composer/attach-buttons.tsx` | NEW — attach buttons for `conversation.input.right` |
| `src/client/composer/model-seat.tsx` | NEW — model + effort control for `conversation.input.model` |
| `src/client/settings/vision-section.tsx` | NEW — `settings.section` page |
| `src/client/index.ts` | MODIFY — wiring for all four surfaces |
| `src/client/uploader.ts` | MODIFY — drop `generateDraftPrompt`/`insertPromptIntoComposer` |
| `src/client/attachment-bar.ts` | MODIFY — stop rewriting the textarea |
| `src/client/commands.ts` | MODIFY — `/uploads` mints a chip instead of pasting text |
| `package.json` | MODIFY — `dsh.client.inject` additions |
| `tests/*.spec.ts` | NEW — one spec per pure module |

**Phase ordering.** Phase 0 gates Phases 1–4: it proves chip minting works at runtime. Phases 5 and 6 are independent of Phases 0–4 and may be executed in any order once Phase 0 is settled.

---

## Phase 0 — Spike: prove programmatic chip minting

### Task 0: Mint a chip from a button and confirm it serializes

**Files:**
- Modify: `src/client/index.ts` (temporary probe, removed in Task 5)
- Modify: `src/client/attachment-bar.ts` (temporary probe button)

**Interfaces:**
- Consumes: nothing.
- Produces: a recorded answer to *"does `actx.bail(actx, 'slash/input-insert-reference', …)` from a plugin component mint a chip that the codec later serializes?"* Everything in Phases 1–4 assumes yes.

- [ ] **Step 1: Register a throwaway trigger source**

In `src/client/index.ts`, inside `apply(ctx)`, add a probe that registers a source whose codec logs and returns a fixed string:

```ts
const probe = ctx.get('inputTriggers') as { registerSource: (s: unknown) => () => void } | undefined
probe?.registerSource({
  trigger: '@',
  name: 'visionprobe',
  candidates: async () => [{ name: 'probe' }],
  onPick: () => ({
    kind: 'insert',
    insert: { source: 'visionprobe', ref: 'probe', label: 'probe', clipboardText: '@probe' },
  }),
  lexicon: () => ['probe'],
  codec: {
    clipboardText: (ref: string) => `@${ref}`,
    serialize: async (ref: string) => {
      console.log('[visionprobe] serialize called for', ref)
      return `<probe ref="${ref}"/>`
    },
  },
})
```

- [ ] **Step 2: Mint a chip on a click**

Add a temporary button to `renderAttachmentBar`'s container that runs the mint:

```ts
const mint = (): void => {
  const sessions = ctx.get('sessions') as any
  const actx = sessions?.scope?.(sessionId)
  if (actx === undefined) { console.warn('[visionprobe] scope() returned undefined'); return }
  const applied = actx.bail(actx, 'slash/input-insert-reference', {
    reference: { source: 'visionprobe', ref: 'probe', label: 'probe', clipboardText: '@probe' },
    span: { start: draft.length, end: draft.length, draftRev },
  })
  console.log('[visionprobe] bail returned', applied)
}
```

Take `draft`/`draftRev` from the component's `InputZone` owner share (`input.draft`, `input.draftRev`).

- [ ] **Step 3: Build and load**

```bash
pnpm run build
```

Then reload `http://127.0.0.1:3080` in the browser.

- [ ] **Step 4: Observe and record the outcome**

With the composer empty, click the probe button. In the browser console check, in order:

1. `bail returned true` — the scoped event was applied.
2. A chip appears in the draft.
3. Sending the message logs `[visionprobe] serialize called for probe` and the outgoing message contains `<probe ref="probe"/>`.

**Decision gate.** Record which of these holds:

- **All three** → the mechanism works. Proceed to Phase 1.
- **`bail` returns `true` but no chip** → `span` is wrong. Retry with `start`/`end` at the caret position and confirm `draftRev` is the live value, not a captured one.
- **`scope()` returns `undefined`** → the session is not listed/scoped at that moment; retry from a `conversation.input.*` slot component (which is inside the session scope) rather than the rail.
- **`bail` returns `undefined`** → the scoped consumer did not accept. **STOP.** Report to the user; the fallback is the `+`-menu pick path (a menu pick supplies its own span), which changes §4.2/§4.3 of the spec and needs the user's decision before continuing.

- [ ] **Step 5: Commit the probe**

```bash
git add src/client/index.ts src/client/attachment-bar.ts
git commit -m "spike: probe programmatic reference chip minting"
```

---

## Phase 1 — Attachment state (pure)

### Task 1: Record type, token minting and list operations

**Files:**
- Create: `src/client/attachments.ts`
- Test: `tests/attachments.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AttachmentRecord`, `ChipOccurrence`, `VISION_SOURCE`, `makeToken(fileName, taken)`, `makeRef(sessionTag, token)`, `addRecord(records, record)`, `removeRecord(records, token)`, `findRecord(records, token)`, `activeTokens(occurrences, records)`. Tasks 2–6 rely on these exact names and signatures.

- [ ] **Step 1: Write the failing test**

Create `tests/attachments.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  VISION_SOURCE, activeTokens, addRecord, findRecord, makeRef, makeToken, removeRecord,
  type AttachmentRecord,
} from '../src/client/attachments.js'

const rec = (token: string, isPhoto = true): AttachmentRecord => ({
  token, ref: makeRef('abc12345', token), relativePath: `uploads/s/${token}`,
  isPhoto, size: 10, uploadedAt: 1,
})

describe('makeToken', () => {
  it('strips the session prefix the uploader adds', () => {
    expect(makeToken('session_abc12345__photo.png', [])).toBe('photo.png')
  })

  it('returns the bare name when free', () => {
    expect(makeToken('photo.png', [])).toBe('photo.png')
  })

  it('suffixes before the extension on collision', () => {
    expect(makeToken('photo.png', ['photo.png'])).toBe('photo_2.png')
    expect(makeToken('photo.png', ['photo.png', 'photo_2.png'])).toBe('photo_3.png')
  })

  it('suffixes a name with no extension', () => {
    expect(makeToken('notes', ['notes'])).toBe('notes_2')
  })
})

describe('makeRef', () => {
  it('is session-scoped so the codec can resolve a ref without a session', () => {
    expect(makeRef('abc12345', 'photo.png')).toBe('abc12345-photo.png')
  })

  it('differs across sessions for the same token', () => {
    expect(makeRef('a', 'x.png')).not.toBe(makeRef('b', 'x.png'))
  })
})

describe('list operations', () => {
  it('adds, finds and removes by token', () => {
    const one = addRecord([], rec('a.png'))
    expect(findRecord(one, 'a.png')?.token).toBe('a.png')
    expect(removeRecord(one, 'a.png')).toEqual([])
  })

  it('replaces an existing token rather than duplicating it', () => {
    const twice = addRecord(addRecord([], rec('a.png')), { ...rec('a.png'), size: 99 })
    expect(twice).toHaveLength(1)
    expect(twice[0].size).toBe(99)
  })
})

describe('activeTokens', () => {
  const records = [rec('a.png'), rec('notes.txt', false)]

  it('returns only chips of this source that resolve to a known record', () => {
    const occ = [
      { source: VISION_SOURCE, ref: makeRef('abc12345', 'a.png') },
      { source: 'subagent', ref: 'other' },
      { source: VISION_SOURCE, ref: makeRef('abc12345', 'gone.png') },
    ]
    expect(activeTokens(occ, records)).toEqual([makeRef('abc12345', 'a.png')])
  })

  it('ignores invalid chips', () => {
    const occ = [{ source: VISION_SOURCE, ref: makeRef('abc12345', 'a.png'), invalid: true }]
    expect(activeTokens(occ, records)).toEqual([])
  })

  it('is empty when the draft holds no chips — the one-shot guarantee', () => {
    expect(activeTokens([], records)).toEqual([])
  })

  it('deduplicates a token that appears twice', () => {
    const ref = makeRef('abc12345', 'a.png')
    expect(activeTokens([{ source: VISION_SOURCE, ref }, { source: VISION_SOURCE, ref }], records)).toEqual([ref])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/attachments.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/client/attachments.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/client/attachments.ts`:

```ts
/**
 * Attachment records and the pure list operations over them.
 *
 * A record is what the plugin knows about one uploaded file; a chip in the
 * draft refers to it by `ref`. Nothing here touches the DOM, storage or DSH.
 */

/** The trigger-source name this plugin registers. Only chips it owns are serialized by it. */
export const VISION_SOURCE = 'vision'

/** One uploaded attachment a session can reference from the composer. */
export interface AttachmentRecord {
  /** Human-readable, session-unique name; also the chip label. */
  token: string
  /** Globally unique reference id — the codec resolves it with no session context. */
  ref: string
  /** Workspace-relative path, e.g. `uploads/<session>/photo.png`. */
  relativePath: string
  isPhoto: boolean
  size: number
  uploadedAt: number
}

/** Structural view of one draft chip occurrence (avoids a runtime import of the slot package). */
export interface ChipOccurrence {
  source: string
  ref: string
  invalid?: boolean
}

/**
 * Mint a session-unique token from an uploaded file name.
 * Keeps the extension so the model can see what it is being asked to read, and
 * suffixes `_2`, `_3`, … before the extension on collision.
 */
export function makeToken(fileName: string, taken: readonly string[]): string {
  const base = fileName.replace(/^session_[a-zA-Z0-9_-]+__/, '')
  if (!taken.includes(base)) return base
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ''
  for (let n = 2; ; n++) {
    const candidate = `${stem}_${n}${ext}`
    if (!taken.includes(candidate)) return candidate
  }
}

/**
 * Mint the globally unique reference id for a token.
 * The session tag is what makes it resolvable from `codec.serialize(ref)`, which
 * receives no session context.
 */
export function makeRef(sessionTag: string, token: string): string {
  return `${sessionTag}-${token}`
}

/** Append a record, replacing any earlier record with the same token. */
export function addRecord(records: readonly AttachmentRecord[], record: AttachmentRecord): AttachmentRecord[] {
  return [...records.filter(r => r.token !== record.token), record]
}

/** Drop one record by token. */
export function removeRecord(records: readonly AttachmentRecord[], token: string): AttachmentRecord[] {
  return records.filter(r => r.token !== token)
}

/** Find one record by token. */
export function findRecord(records: readonly AttachmentRecord[], token: string): AttachmentRecord | undefined {
  return records.find(r => r.token === token)
}

/**
 * The refs whose chip is in the draft right now — the only attachments that get
 * serialized on send.
 *
 * This is the whole one-shot guarantee: DSH clears the draft when a send
 * settles, so the next message has no chips and therefore no injection. There is
 * deliberately no pending queue anywhere in the plugin.
 */
export function activeTokens(
  occurrences: readonly ChipOccurrence[],
  records: readonly AttachmentRecord[],
): string[] {
  const known = new Set(records.map(r => r.ref))
  const out: string[] = []
  for (const o of occurrences) {
    if (o.source !== VISION_SOURCE || o.invalid === true) continue
    if (!known.has(o.ref) || out.includes(o.ref)) continue
    out.push(o.ref)
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/attachments.spec.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/attachments.ts tests/attachments.spec.ts
git commit -m "feat: attachment records, token minting and active-set derivation"
```

### Task 2: Model-facing instruction text

**Files:**
- Create: `src/client/instruction.ts`
- Test: `tests/instruction.spec.ts`

**Interfaces:**
- Consumes: `AttachmentRecord` from `./attachments.js` (Task 1).
- Produces: `instructionFor(record: AttachmentRecord): string`. Task 4's codec calls it.

- [ ] **Step 1: Write the failing test**

Create `tests/instruction.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { instructionFor } from '../src/client/instruction.js'
import { makeRef, type AttachmentRecord } from '../src/client/attachments.js'

const record = (over: Partial<AttachmentRecord> = {}): AttachmentRecord => ({
  token: 'photo.png', ref: makeRef('abc12345', 'photo.png'),
  relativePath: 'uploads/session-abc12345/photo.png', isPhoto: true, size: 10, uploadedAt: 1,
  ...over,
})

describe('instructionFor', () => {
  it('asks for read_image on a photo, naming the workspace path', () => {
    const text = instructionFor(record())
    expect(text).toContain('read_image')
    expect(text).toContain('uploads/session-abc12345/photo.png')
  })

  it('asks for read on a file, naming the workspace path', () => {
    const text = instructionFor(record({ token: 'notes.txt', isPhoto: false }))
    expect(text).toContain('`read`')
    expect(text).toContain('uploads/session-abc12345/photo.png')
  })

  it('never leaks the token or the ref into the model text', () => {
    const text = instructionFor(record())
    expect(text).not.toContain('abc12345-photo.png')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/instruction.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/client/instruction.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/client/instruction.ts`:

```ts
import type { AttachmentRecord } from './attachments.js'

/**
 * The model-facing instruction for one attachment.
 *
 * This text never enters the draft: the draft holds a chip, and this string is
 * produced by the reference codec at submit time.
 */
export function instructionFor(record: AttachmentRecord): string {
  if (record.isPhoto) {
    return `Tôi vừa tải lên ảnh \`${record.relativePath}\`. Bạn hãy gọi tool \`read_image\` để xem và phân tích ảnh này nhé: `
  }
  return `Tôi vừa tải lên file \`${record.relativePath}\`. Bạn hãy đọc nội dung file này (dùng tool \`read\`) và hỗ trợ tôi: `
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/instruction.spec.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/instruction.ts tests/instruction.spec.ts
git commit -m "feat: model-facing instruction text per attachment"
```

### Task 3: Per-session attachment store

**Files:**
- Create: `src/client/attachment-store.ts`
- Test: `tests/attachment-store.spec.ts`

**Interfaces:**
- Consumes: `AttachmentRecord`, `addRecord`, `removeRecord`, `findRecord`, `makeToken` from `./attachments.js` (Task 1).
- Produces: `AttachmentStore` class with `list(sessionId): readonly AttachmentRecord[]`, `tokens(sessionId): readonly string[]`, `add(sessionId, record): void`, `remove(sessionId, token): void`, `byRef(ref): AttachmentRecord | undefined`, `nextToken(sessionId, fileName): string`. Tasks 4–6 rely on these.

- [ ] **Step 1: Write the failing test**

Create `tests/attachment-store.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { AttachmentStore, type KeyValueStorage } from '../src/client/attachment-store.js'
import { makeRef } from '../src/client/attachments.js'

function memoryStorage(): KeyValueStorage & { dump: () => Record<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v) },
    removeItem: k => { map.delete(k) },
    dump: () => Object.fromEntries(map),
  }
}

const record = (sessionTag: string, token: string) => ({
  token, ref: makeRef(sessionTag, token), relativePath: `uploads/${sessionTag}/${token}`,
  isPhoto: true, size: 1, uploadedAt: 1,
})

describe('AttachmentStore', () => {
  let storage: ReturnType<typeof memoryStorage>
  let store: AttachmentStore

  beforeEach(() => {
    storage = memoryStorage()
    store = new AttachmentStore(storage)
  })

  it('keeps sessions isolated', () => {
    store.add('s1', record('aaa', 'a.png'))
    store.add('s2', record('bbb', 'b.png'))
    expect(store.tokens('s1')).toEqual(['a.png'])
    expect(store.tokens('s2')).toEqual(['b.png'])
  })

  it('resolves a record by ref without knowing the session', () => {
    const r = record('aaa', 'a.png')
    store.add('s1', r)
    expect(store.byRef(r.ref)?.token).toBe('a.png')
    expect(store.byRef('nope')).toBeUndefined()
  })

  it('mints a non-colliding token for the session', () => {
    store.add('s1', record('aaa', 'photo.png'))
    expect(store.nextToken('s1', 'photo.png')).toBe('photo_2.png')
    expect(store.nextToken('s1', 'other.png')).toBe('other.png')
  })

  it('survives a reload from the same storage', () => {
    store.add('s1', record('aaa', 'a.png'))
    const reopened = new AttachmentStore(storage)
    expect(reopened.tokens('s1')).toEqual(['a.png'])
    expect(reopened.byRef(makeRef('aaa', 'a.png'))?.token).toBe('a.png')
  })

  it('drops a record on remove', () => {
    store.add('s1', record('aaa', 'a.png'))
    store.remove('s1', 'a.png')
    expect(store.tokens('s1')).toEqual([])
    expect(store.byRef(makeRef('aaa', 'a.png'))).toBeUndefined()
  })

  it('ignores corrupt stored JSON instead of throwing', () => {
    storage.setItem('dsh_vision_attachments_s1', '{not json')
    expect(store.tokens('s1')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/attachment-store.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/client/attachment-store.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/client/attachment-store.ts`:

```ts
import {
  addRecord, findRecord, makeRef, makeToken, removeRecord,
  type AttachmentRecord,
} from './attachments.js'

/** The slice of `localStorage` this store needs (injected so tests stay in node). */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const PREFIX = 'dsh_vision_attachments_'

/** The session's short tag, used in refs and file names. */
function sessionTag(sessionId: string): string {
  return sessionId.replace(/^session-/, '').slice(0, 8) || 'common'
}

/**
 * Per-session attachment records, persisted to injected storage.
 *
 * Records are history: they survive a send so `/uploads` can list them. What
 * gets injected is decided by `activeTokens` over the live draft, never by this
 * store — that is what keeps attachment one-shot per send.
 */
export class AttachmentStore {
  private readonly cache = new Map<string, AttachmentRecord[]>()

  constructor(private readonly storage: KeyValueStorage) {}

  /** Records for one session, newest last. */
  list(sessionId: string): readonly AttachmentRecord[] {
    const cached = this.cache.get(sessionId)
    if (cached !== undefined) return cached
    const loaded = this.load(sessionId)
    this.cache.set(sessionId, loaded)
    return loaded
  }

  /** Token list for one session, used for collision-free minting and the lexicon. */
  tokens(sessionId: string): readonly string[] {
    return this.list(sessionId).map(r => r.token)
  }

  /** Mint a token that does not collide within the session. */
  nextToken(sessionId: string, fileName: string): string {
    return makeToken(fileName, this.tokens(sessionId))
  }

  /** The ref for a token in this session — the id the chip carries. */
  refFor(sessionId: string, token: string): string {
    return makeRef(sessionTag(sessionId), token)
  }

  /** Add or replace a record. */
  add(sessionId: string, record: AttachmentRecord): void {
    this.write(sessionId, addRecord(this.list(sessionId), record))
  }

  /** Drop one record by token. */
  remove(sessionId: string, token: string): void {
    this.write(sessionId, removeRecord(this.list(sessionId), token))
  }

  /** Find a record by token within one session. */
  find(sessionId: string, token: string): AttachmentRecord | undefined {
    return findRecord(this.list(sessionId), token)
  }

  /**
   * Resolve a record from its ref alone.
   * `codec.serialize(ref)` receives no session, so this is the lookup the codec uses.
   */
  byRef(ref: string): AttachmentRecord | undefined {
    for (const records of this.allSessions()) {
      const hit = records.find(r => r.ref === ref)
      if (hit !== undefined) return hit
    }
    return undefined
  }

  private allSessions(): AttachmentRecord[][] {
    const out: AttachmentRecord[][] = [...this.cache.values()]
    for (let i = 0; i < this.storageLength(); i++) {
      const key = this.storageKeyAt(i)
      if (key === null || !key.startsWith(PREFIX)) continue
      const sessionId = key.slice(PREFIX.length)
      if (!this.cache.has(sessionId)) out.push(this.load(sessionId))
    }
    return out
  }

  private load(sessionId: string): AttachmentRecord[] {
    const raw = this.storage.getItem(PREFIX + sessionId)
    if (raw === null) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((r): r is AttachmentRecord =>
        typeof r === 'object' && r !== null
        && typeof (r as AttachmentRecord).token === 'string'
        && typeof (r as AttachmentRecord).ref === 'string')
    } catch {
      return []
    }
  }

  private write(sessionId: string, records: AttachmentRecord[]): void {
    this.cache.set(sessionId, records)
    try {
      this.storage.setItem(PREFIX + sessionId, JSON.stringify(records))
    } catch {
      // Quota or privacy mode: the in-memory cache still serves this session.
    }
  }

  /** Number of persisted keys, when the storage exposes enumeration. */
  private storageLength(): number {
    const withLength = this.storage as KeyValueStorage & { length?: number }
    return typeof withLength.length === 'number' ? withLength.length : 0
  }

  /** Nth persisted key, when the storage exposes enumeration. */
  private storageKeyAt(index: number): string | null {
    const withKey = this.storage as KeyValueStorage & { key?: (i: number) => string | null }
    return typeof withKey.key === 'function' ? withKey.key(index) : null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/attachment-store.spec.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/attachment-store.ts tests/attachment-store.spec.ts
git commit -m "feat: per-session attachment store with ref index"
```

---

## Phase 2 — Reference source and chip minting

### Task 4: The vision trigger source and its codec

**Files:**
- Create: `src/client/reference.ts`
- Test: `tests/reference.spec.ts`

**Interfaces:**
- Consumes: `VISION_SOURCE` (Task 1), `instructionFor` (Task 2), `AttachmentStore` (Task 3).
- Produces: `createVisionSource(store: AttachmentStore): VisionSource` and `mintChip(sessions, sessionId, input, record): boolean`. Task 5 registers the source and calls `mintChip`.

- [ ] **Step 1: Write the failing test**

Create `tests/reference.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createVisionSource } from '../src/client/reference.js'
import { AttachmentStore } from '../src/client/attachment-store.js'
import { makeRef } from '../src/client/attachments.js'

const session = (sessionId: string) => ({ sessionId } as never)

function storeWith(sessionId: string, token: string, isPhoto = true) {
  const store = new AttachmentStore({ getItem: () => null, setItem: () => {}, removeItem: () => {} })
  store.add(sessionId, {
    token, ref: makeRef('abc12345', token), relativePath: `uploads/${sessionId}/${token}`,
    isPhoto, size: 1, uploadedAt: 1,
  })
  return store
}

describe('createVisionSource', () => {
  it('registers under the plugin source name on the @ trigger', () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    expect(source.trigger).toBe('@')
    expect(source.name).toBe('vision')
  })

  it('offers the session attachments as candidates', async () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    const candidates = await source.candidates(session('s1'), {} as never)
    expect(candidates.map(c => c.name)).toEqual(['a.png'])
  })

  it('inserts a chip whose ref is the session-scoped id and whose label is the token', () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    const outcome = source.onPick({
      candidate: { name: 'a.png' }, session: session('s1'), via: 'menu', span: { start: 0, end: 0, draftRev: 0 },
    } as never) as { kind: string; insert: { ref: string; label: string; clipboardText: string } }
    expect(outcome.kind).toBe('insert')
    expect(outcome.insert.ref).toBe(makeRef('abc12345', 'a.png'))
    expect(outcome.insert.label).toBe('a.png')
    expect(outcome.insert.clipboardText).toBe('@a.png')
  })

  it('serializes a photo ref into the read_image instruction', async () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    const text = await source.codec.serialize(makeRef('abc12345', 'a.png'), new AbortController().signal)
    expect(text).toContain('read_image')
    expect(text).toContain('uploads/s1/a.png')
  })

  it('serializes a file ref into the read instruction', async () => {
    const source = createVisionSource(storeWith('s1', 'n.txt', false))
    const text = await source.codec.serialize(makeRef('abc12345', 'n.txt'), new AbortController().signal)
    expect(text).toContain('`read`')
  })

  it('rejects an unknown ref so the send blocks instead of silently degrading', async () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    await expect(source.codec.serialize('gone', new AbortController().signal)).rejects.toThrow(/gone/)
  })

  it('lists the session tokens as the lexicon', () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    expect(source.lexicon(session('s1'))).toEqual(['a.png'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/reference.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/client/reference.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/client/reference.ts`:

```ts
import type { AttachmentStore } from './attachment-store.js'
import type { AttachmentRecord } from './attachments.js'
import { VISION_SOURCE } from './attachments.js'
import { instructionFor } from './instruction.js'

/** Structural shapes for the trigger-source contract (type-only elsewhere; no runtime import). */
export interface SourceSession {
  sessionId: string
}

export interface SourceCandidate {
  name: string
  description?: string
}

export interface ReferenceInsertPayload {
  source: string
  ref: string
  label: string
  clipboardText: string
}

export interface TokenSpanPayload {
  start: number
  end: number
  draftRev: number
}

export interface VisionSource {
  trigger: '@'
  name: typeof VISION_SOURCE
  candidates(session: SourceSession, req: unknown): Promise<readonly SourceCandidate[]>
  onPick(pick: { candidate: SourceCandidate; session: SourceSession }): unknown
  lexicon(session: SourceSession): readonly string[]
  codec: {
    clipboardText(ref: string): string
    serialize(ref: string, signal: AbortSignal): Promise<string>
  }
}

/**
 * The plugin's reference source.
 *
 * The draft holds one U+FFFC chip per inserted reference; the chip carries this
 * source's name and the record's ref. At submit the facade calls `codec.serialize`
 * once per chip and splices the result into the prompt — that is the only place
 * the instruction text ever exists.
 */
export function createVisionSource(store: AttachmentStore): VisionSource {
  return {
    trigger: '@',
    name: VISION_SOURCE,

    candidates: async (session) =>
      store.list(session.sessionId).map(record => ({
        name: record.token,
        description: record.relativePath,
      })),

    onPick: (pick) => {
      const record = store.find(pick.session.sessionId, pick.candidate.name)
      const ref = record?.ref ?? store.refFor(pick.session.sessionId, pick.candidate.name)
      return {
        kind: 'insert',
        insert: {
          source: VISION_SOURCE,
          ref,
          label: pick.candidate.name,
          clipboardText: `@${pick.candidate.name}`,
        },
      }
    },

    // Lets the render side decorate a typed `@token` and lets paste matching see
    // this session's names. Synchronous by contract — no fetching here.
    lexicon: (session) => store.tokens(session.sessionId),

    codec: {
      // Reverse-resolve through the store: the session tag is not parseable out
      // of the ref reliably, and the record already holds the readable token.
      clipboardText: (ref) => `@${store.byRef(ref)?.token ?? ref}`,

      // `ref` is globally unique (session tag + token), which is what makes this
      // resolvable without a session parameter.
      serialize: async (ref, signal) => {
        if (signal.aborted) throw new Error('aborted')
        const record = store.byRef(ref)
        if (record === undefined) {
          // Blocking the send is the documented contract: never downgrade to the
          // clipboard form behind the user's back.
          throw new Error(`vision: unknown attachment reference "${ref}"`)
        }
        return instructionFor(record)
      },
    },
  }
}

/**
 * Mint one chip into the session's draft.
 *
 * `InputState.draftRev` is a CAS token: a stale value makes the whole scoped
 * event a no-op, so the caller must pass the live value from `InputZone.input`.
 * @returns true when the scoped consumer applied the insert.
 */
export function mintChip(
  sessions: { scope(id: string): { bail(ctx: unknown, event: string, payload: unknown): unknown } | undefined } | undefined,
  sessionId: string,
  input: { draft: string; draftRev: number },
  record: AttachmentRecord,
): boolean {
  const actx = sessions?.scope(sessionId)
  if (actx === undefined) return false
  const payload = {
    reference: {
      source: VISION_SOURCE,
      ref: record.ref,
      label: record.token,
      clipboardText: `@${record.token}`,
    } satisfies ReferenceInsertPayload,
    span: { start: input.draft.length, end: input.draft.length, draftRev: input.draftRev } satisfies TokenSpanPayload,
  }
  return actx.bail(actx, 'slash/input-insert-reference', payload) === true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/reference.spec.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/reference.ts tests/reference.spec.ts
git commit -m "feat: vision reference source, codec and chip minting"
```

---

## Phase 3 — Attach buttons in the composer

### Task 5: Attach buttons wired to chip minting

**Files:**
- Create: `src/client/composer/attach-buttons.tsx`
- Modify: `src/client/index.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `AttachmentStore` (Task 3), `createVisionSource` + `mintChip` (Task 4), the existing `pickFilesFromBrowser` / `optimizeImageIfNeeded` / `uploadMultipleFiles` / `fileToBase64` from `./uploader.js`.
- Produces: `registerAttachButtons(ctx, deps): void` called from `apply`.

- [ ] **Step 1: Write the component**

Create `src/client/composer/attach-buttons.tsx`:

```tsx
/**
 * The composer's attach buttons.
 *
 * Registered into `conversation.input.right`, which renders immediately left of
 * the model seat. A successful upload is turned into a draft chip; the
 * instruction text is produced later, by the reference codec at send time.
 */
import { useCallback, useRef, useState } from 'react'
import type { AttachmentStore } from '../attachment-store.js'
import type { AttachmentRecord } from '../attachments.js'
import { mintChip } from '../reference.js'
import { optimizeImageIfNeeded, pickFilesFromBrowser, uploadMultipleFiles } from '../uploader.js'

/** The `InputZone` owner share this slot delivers (point-in-time snapshots). */
export interface AttachButtonsProps {
  sessionId: string
  input: { draft: string; draftRev: number }
  store: AttachmentStore
  sessions: Parameters<typeof mintChip>[0]
  notify: (level: 'info' | 'error', text: string) => void
}

export function AttachButtons({ sessionId, input, store, sessions, notify }: AttachButtonsProps) {
  const [busy, setBusy] = useState(false)
  // The slot hands over a point-in-time snapshot and the skeleton re-renders
  // after each mint. This ref is how the loop below reads the LIVE draft and
  // draftRev instead of the values captured when the click started — draftRev is
  // a CAS token, so a stale one makes the insert a silent no-op.
  const live = useRef(input)
  live.current = input

  const attach = useCallback(async (isPhoto: boolean) => {
    const accept = isPhoto ? 'image/png,image/jpeg,image/webp,image/gif' : '*/*'
    const files = await pickFilesFromBrowser(accept, true)
    if (files.length === 0) return
    setBusy(true)
    try {
      const responses = await uploadMultipleFiles(sessionId, files, isPhoto)
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i]
        if (!response.ok || response.relativePath === undefined) continue
        const token = store.nextToken(sessionId, response.filename ?? files[i].name)
        const record: AttachmentRecord = {
          token,
          ref: store.refFor(sessionId, token),
          relativePath: response.relativePath,
          isPhoto,
          size: files[i].size,
          uploadedAt: Date.now(),
        }
        store.add(sessionId, record)
        if (!mintChip(sessions, sessionId, live.current, record)) {
          notify('error', `Không chèn được tham chiếu cho ${token}`)
        }
      }
    } catch (err) {
      notify('error', `Lỗi tải tệp: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }, [sessionId, store, sessions, notify])

  return (
    <>
      <button
        type="button"
        title="Thêm ảnh"
        aria-label="Thêm ảnh"
        disabled={busy}
        onClick={() => { void attach(true) }}
      >
        📷
      </button>
      <button
        type="button"
        title="Thêm tệp"
        aria-label="Thêm tệp"
        disabled={busy}
        onClick={() => { void attach(false) }}
      >
        📄
      </button>
    </>
  )
}
```

- [ ] **Step 2: Register the buttons and the source in `apply`**

In `src/client/index.ts`, extend the existing `apply(ctx)`:

```ts
import { AttachmentStore } from './attachment-store.js'
import { AttachButtons } from './composer/attach-buttons.js'
import { createVisionSource, type VisionSource } from './reference.js'

export function apply(ctx: Context): void {
  // Storage is injected so the store stays testable in node.
  const store = new AttachmentStore(window.localStorage)

  // One source instance: it owns the ref index the codec resolves against.
  const source: VisionSource = createVisionSource(store)
  ctx.inject(['inputTriggers'], (scoped: Context) => {
    const triggers = scoped.get('inputTriggers') as { registerSource(s: unknown): () => void }
    scoped.effect(() => triggers.registerSource(source), 'dsh-upload-plugin: vision reference source')
  })

  ctx.inject(['slots', 'sessions'], (scoped: Context) => {
    const slots = scoped.get('slots') as any
    const sessions = scoped.get('sessions') as any
    slots.inject('conversation.input.right', () => slots.register({
      name: 'conversation.input.right',
      id: 'vision-attach',
      order: 10,
    }, (props: any) => (
      <AttachButtons
        sessionId={props.sessionId}
        input={props.input}
        store={store}
        sessions={sessions}
        notify={props.inputActions ? () => {} : () => {}}
      />
    )))
  })
}
```

`notify` is wired to the composer notice channel in Step 3; leaving it inert here keeps the registration compiling.

- [ ] **Step 3: Wire `notify` to the composer notice channel**

Replace the inert `notify` with the session-scoped input facade's notice verb. The shape below is copied from ui-conversation's own `QueueDock.tsx:239` (`conversation.input.for(actx).notify(level, text)`), which is the shipped way to surface a business notice on the composer:

```ts
const conversation = ctx.get('conversation') as any
const notify = (level: 'info' | 'error', text: string): void => {
  const actx = sessions?.scope?.(props.sessionId)
  if (actx === undefined) return
  conversation?.input?.for?.(actx)?.notify?.(level, text)
}
```

If `ctx.get('conversation')` resolves to nothing in this profile, keep the buttons working and downgrade the notice to `console.warn` — a missing notice channel must not block attachment. Record which one applied in the commit message.

- [ ] **Step 4: Declare the new injects**

In `package.json`, add to `dsh.client.inject`:

```json
"@deepseek-ai/dsh-client-ui-conversation",
"@deepseek-ai/dsh-client-ui-input-trigger"
```

- [ ] **Step 5: Build and check**

Run: `pnpm run build`
Expected: `tsc` clean, `lib/client.js` written.

- [ ] **Step 6: Manual check**

Reload `http://127.0.0.1:3080`, open a session whose model declares image input, click 📷, pick an image. Expected: a chip appears in the draft left of the model control; the draft shows no instruction text.

- [ ] **Step 7: Commit**

```bash
git add src/client/composer/attach-buttons.tsx src/client/index.ts package.json
git commit -m "feat: attach buttons in the composer tool row"
```

### Task 6: Remove the old draft-text behaviour

**Files:**
- Modify: `src/client/uploader.ts`
- Modify: `src/client/attachment-bar.ts`
- Modify: `src/client/commands.ts`
- Modify: `tests/client-uploader.spec.ts`

**Interfaces:**
- Consumes: `mintChip` (Task 4), `AttachmentStore` (Task 3).
- Produces: nothing new; the plugin no longer writes instruction text into the draft.

- [ ] **Step 1: Delete the composer-text helpers**

In `src/client/uploader.ts` remove `generateDraftPrompt` and `insertPromptIntoComposer` entirely.

In `src/client/attachment-bar.ts` remove the textarea rewrite inside `removeDraftAttachment` (the whole `const textarea = …` block and both branches); removing an attachment now only updates the rail.

In `src/client/commands.ts`:
- `/photos` and `/files` call the same attach path as the buttons.
- `/uploads` re-reference mints a chip via `mintChip` instead of calling `insertPromptIntoComposer`.

- [ ] **Step 2: Update the affected test**

`tests/client-uploader.spec.ts` currently imports `generateDraftPrompt`. Delete those cases and keep the `formatFileSize` case; move nothing else.

- [ ] **Step 3: Run the suite**

Run: `pnpm test`
Expected: PASS — the remaining specs, with no import of a deleted symbol.

- [ ] **Step 4: Build**

Run: `pnpm run build`
Expected: `tsc` clean.

- [ ] **Step 5: Manual check — the one-shot guarantee**

1. Attach a photo, send the message. The sent message contains the instruction.
2. Immediately send a second message with no attachment. **It must contain no instruction.**
3. Attach the same photo again; a new chip appears and the instruction is injected again.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: drop draft-text insertion; attachments ride chips only"
```

---

## Phase 4 — Model + effort seat

### Task 7: Effort menu construction

**Files:**
- Create: `src/client/effort.ts`
- Test: `tests/effort.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `EffortChoice`, `effortChoices(reasoning, current)`, `CUSTOM_EFFORT_KEY`. Task 8 renders them.

- [ ] **Step 1: Write the failing test**

Create `tests/effort.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CUSTOM_EFFORT_KEY, effortChoices } from '../src/client/effort.js'

describe('effortChoices', () => {
  it('lists the model-declared efforts in host order, then Custom', () => {
    const choices = effortChoices(
      { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'high' },
      undefined,
    )
    expect(choices.map(c => c.key)).toEqual(['effort:low', 'effort:high', CUSTOM_EFFORT_KEY])
    expect(choices[1].label).toBe('High')
  })

  it('marks the effective effort as selected', () => {
    const choices = effortChoices({ efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' }, undefined)
    expect(choices.find(c => c.selected)?.effort).toBe('high')
  })

  it('falls back to the model default when the session names none', () => {
    const choices = effortChoices({ efforts: [{ id: 'low', name: 'Low' }], defaultEffort: 'low' }, undefined)
    expect(choices.find(c => c.selected)?.effort).toBe('low')
  })

  it('prefers the session effort over the model default', () => {
    const choices = effortChoices({ efforts: [{ id: 'low', name: 'Low' }], defaultEffort: 'low' }, 'low')
    expect(choices.find(c => c.selected)?.effort).toBe('low')
  })

  it('returns nothing when the model declares no reasoning', () => {
    expect(effortChoices(undefined, undefined)).toEqual([])
  })

  it('returns nothing when the model declares an empty effort list', () => {
    expect(effortChoices({ efforts: [], defaultEffort: 'high' }, undefined)).toEqual([])
  })

  it('offers Custom with no effort value of its own', () => {
    const choices = effortChoices({ efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' }, undefined)
    expect(choices.at(-1)?.effort).toBeUndefined()
    expect(choices.at(-1)?.custom).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/effort.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/client/effort.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/client/effort.ts`:

```ts
/**
 * Reasoning-effort menu construction.
 *
 * The vocabulary is the Host's, per model: `reasoning.efforts` is what the model
 * declares, so the menu can never offer a level the Host would reject. A Custom
 * row lets the user name a value the catalog does not list.
 */

/** Menu key of the free-text row. */
export const CUSTOM_EFFORT_KEY = 'custom'

/** The `reasoning` share of a resolved model, as the directory publishes it. */
export interface ReasoningInfo {
  efforts: readonly { id: string; name: string; description?: string }[]
  defaultEffort?: string
}

/** One menu row. */
export interface EffortChoice {
  key: string
  /** The value submitted as `reasoningEffort`; undefined on the Custom row. */
  effort?: string
  label: string
  description?: string
  selected: boolean
  /** True only on the Custom row, which opens a text input instead of submitting. */
  custom?: boolean
}

/**
 * Build the effort menu for one model.
 * @param reasoning - the model's declared reasoning metadata; undefined = no effort control.
 * @param current - the session's chosen effort, when it has one.
 */
export function effortChoices(reasoning: ReasoningInfo | undefined, current: string | undefined): EffortChoice[] {
  if (reasoning === undefined || reasoning.efforts.length === 0) return []
  const effective = current ?? reasoning.defaultEffort
  const rows: EffortChoice[] = reasoning.efforts.map(effort => ({
    key: `effort:${effort.id}`,
    effort: effort.id,
    label: effort.name,
    ...effort.description === undefined ? {} : { description: effort.description },
    selected: effort.id === effective,
  }))
  rows.push({ key: CUSTOM_EFFORT_KEY, label: 'Custom…', selected: false, custom: true })
  return rows
}

/** The label the trigger shows for the effective effort. */
export function effortLabel(reasoning: ReasoningInfo | undefined, current: string | undefined): string | undefined {
  if (reasoning === undefined) return undefined
  const effective = current ?? reasoning.defaultEffort
  if (effective === undefined) return undefined
  return reasoning.efforts.find(e => e.id === effective)?.name ?? effective
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/effort.spec.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/effort.ts tests/effort.spec.ts
git commit -m "feat: reasoning-effort menu construction from host metadata"
```

### Task 8: The model + effort seat

**Files:**
- Create: `src/client/composer/model-seat.tsx`
- Modify: `src/client/index.ts`

**Interfaces:**
- Consumes: `effortChoices`, `effortLabel` (Task 7); the `modelDirectories` service.
- Produces: `ModelSeat` component and its registration into `conversation.input.model`.

- [ ] **Step 1: Write the component**

Create `src/client/composer/model-seat.tsx`:

```tsx
/**
 * The composer's model seat, taken over so the effort control can sit to the
 * right of the model name.
 *
 * `conversation.input.model` is a `single` slot: taking it means rendering the
 * whole model affordance, so this component re-implements the shipped selector's
 * observable behaviour (provider-grouped list, loading/error/retry, locked,
 * subagent exclusion, toast on rejection) and adds the effort half.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CUSTOM_EFFORT_KEY, effortChoices, effortLabel, type ReasoningInfo } from '../effort.js'

export interface ModelSeatProps {
  locked: boolean
  available: boolean
  directory: {
    subscribe(fn: () => void): () => void
    getSnapshot(): {
      current: { provider: string; model: string; reasoningEffort?: string } | null
      groups: readonly { id: string; name: string; models: readonly { id: string; name: string; description?: string; reasoning?: ReasoningInfo }[] }[]
      status: 'idle' | 'loading' | 'ready' | 'selecting'
      error: string | null
    }
  }
  load: () => void
  select: (selection: { provider: string; model: string; reasoningEffort?: string }) => Promise<boolean>
  onError: (message: string) => void
}

export function ModelSeat({ locked, available, directory, load, select, onError }: ModelSeatProps) {
  const [snapshot, setSnapshot] = useState(() => directory.getSnapshot())
  const [open, setOpen] = useState<'none' | 'model' | 'effort'>('none')
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => directory.subscribe(() => { setSnapshot(directory.getSnapshot()) }), [directory])
  useEffect(() => { if (available) load() }, [available, load])

  useEffect(() => {
    if (open === 'none') return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) { setOpen('none'); setCustomOpen(false) }
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  const current = snapshot.current
  const currentModel = useMemo(() => {
    if (current === null) return undefined
    for (const group of snapshot.groups) {
      for (const model of group.models) {
        if (group.id === current.provider && model.id === current.model) return model
      }
    }
    return undefined
  }, [snapshot.groups, current])

  const reasoning = currentModel?.reasoning
  const choices = useMemo(
    () => effortChoices(reasoning, current?.reasoningEffort),
    [reasoning, current?.reasoningEffort],
  )

  if (!available) return null

  const submit = (selection: { provider: string; model: string; reasoningEffort?: string }): void => {
    void select(selection).then(accepted => {
      if (accepted) { setOpen('none'); setCustomOpen(false); return }
      onError(snapshot.error ?? 'Không đổi được model')
    })
  }

  const chooseEffort = (effort: string | undefined): void => {
    if (current === null || effort === undefined) return
    submit({ provider: current.provider, model: current.model, reasoningEffort: effort })
  }

  return (
    <div ref={rootRef} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        disabled={locked}
        aria-haspopup="menu"
        aria-expanded={open === 'model'}
        onClick={() => { setOpen(open === 'model' ? 'none' : 'model'); setCustomOpen(false) }}
      >
        {currentModel?.name ?? 'Chọn model'}
      </button>

      {reasoning !== undefined && (
        <button
          type="button"
          disabled={locked}
          aria-haspopup="menu"
          aria-expanded={open === 'effort'}
          onClick={() => { setOpen(open === 'effort' ? 'none' : 'effort'); setCustomOpen(false) }}
        >
          {effortLabel(reasoning, current?.reasoningEffort) ?? '—'}
        </button>
      )}

      {open === 'model' && (
        <div role="menu">
          {snapshot.status === 'loading' && <div>Đang tải…</div>}
          {snapshot.error !== null && (
            <div>
              <span>{snapshot.error}</span>
              <button type="button" onClick={load}>Thử lại</button>
            </div>
          )}
          {snapshot.groups.map(group => (
            <section key={group.id}>
              <div>{group.name}</div>
              {group.models.map(model => (
                <button
                  key={model.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current?.provider === group.id && current.model === model.id}
                  disabled={snapshot.status === 'selecting'}
                  onClick={() => { submit({ provider: group.id, model: model.id }) }}
                >
                  {model.name}
                </button>
              ))}
            </section>
          ))}
        </div>
      )}

      {open === 'effort' && (
        <div role="menu">
          {choices.filter(choice => !choice.custom).map(choice => (
            <button
              key={choice.key}
              type="button"
              role="menuitemradio"
              aria-checked={choice.selected}
              disabled={snapshot.status === 'selecting'}
              onClick={() => { chooseEffort(choice.effort) }}
            >
              {choice.label}
            </button>
          ))}
          <button type="button" onClick={() => { setCustomOpen(true) }}>Custom…</button>
          {customOpen && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                const value = customValue.trim()
                if (value !== '') chooseEffort(value)
              }}
            >
              <input
                value={customValue}
                onChange={event => { setCustomValue(event.target.value) }}
                placeholder="reasoning effort"
                aria-label="Custom reasoning effort"
              />
              <button type="submit">OK</button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Register the seat**

In `src/client/index.ts`, add inside `apply(ctx)`:

```ts
ctx.inject(['slots', 'sessions', 'modelDirectories'], (scoped: Context) => {
  const slots = scoped.get('slots') as any
  const sessions = scoped.get('sessions') as any
  const directories = scoped.get('modelDirectories') as any
  slots.inject('conversation.input.model', () => slots.register({
    name: 'conversation.input.model',
  }, (props: any) => {
    const sessionId: string = props.sessionId
    const available = sessions?.subagentAddress?.(sessionId) === undefined
    const directory = directories.directoryFor(sessionId)
    return (
      <ModelSeat
        locked={props.locked === true}
        available={available}
        directory={directory.store}
        load={() => { if (available) directory.load().catch(() => {}) }}
        select={selection => available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false)}
        onError={message => { console.warn('[dsh-upload-plugin] model seat:', message) }}
      />
    )
  }))
})
```

Add `"@deepseek-ai/dsh-client-ui-model-selection"` to `dsh.client.inject` in `package.json`.

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: `tsc` clean.

- [ ] **Step 4: Manual check**

Reload the page. Expected in the composer, left to right: `[📷] [📄] [Model ▾] [Effort ▾] [send]`. Switching models updates the effort menu; a model with no declared reasoning shows no effort trigger; Custom submits a free-text value.

- [ ] **Step 5: Commit**

```bash
git add src/client/composer/model-seat.tsx src/client/index.ts package.json
git commit -m "feat: combined model and reasoning-effort seat"
```

---

## Phase 5 — Vision settings section

### Task 9: Model row read-modify-write

**Files:**
- Create: `src/client/vision-setting.ts`
- Test: `tests/vision-setting.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `setVision(models, modelId, on): ModelRow[]`. Task 10 writes the result back through the settings API.

- [ ] **Step 1: Write the failing test**

Create `tests/vision-setting.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hasVision, setVision, type ModelRow } from '../src/client/vision-setting.js'

const rows: ModelRow[] = [
  { id: 'a', name: 'A', contextWindow: 1000 },
  { id: 'b', name: 'B', input: ['text'], future: { keep: true } },
]

describe('hasVision', () => {
  it('is true only when input lists image', () => {
    expect(hasVision({ id: 'x', input: ['text', 'image'] })).toBe(true)
    expect(hasVision({ id: 'x', input: ['text'] })).toBe(false)
    expect(hasVision({ id: 'x' })).toBe(false)
  })
})

describe('setVision', () => {
  it('adds the image modality to the named row', () => {
    const next = setVision(rows, 'a', true)
    expect(next[0].input).toEqual(['text', 'image'])
  })

  it('preserves every other field of the row verbatim', () => {
    const next = setVision(rows, 'b', true)
    expect(next[1].future).toEqual({ keep: true })
    expect(next[1].name).toBe('B')
  })

  it('removes the input key when switching off', () => {
    const next = setVision(setVision(rows, 'a', true), 'a', false)
    expect('input' in next[0]).toBe(false)
  })

  it('leaves other rows untouched', () => {
    const next = setVision(rows, 'a', true)
    expect(next[1]).toEqual(rows[1])
  })

  it('is a no-op for an unknown id', () => {
    expect(setVision(rows, 'zzz', true)).toEqual(rows)
  })

  it('does not mutate the input array', () => {
    setVision(rows, 'a', true)
    expect(rows[0].input).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/vision-setting.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/client/vision-setting.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/client/vision-setting.ts`:

```ts
/**
 * Read-modify-write for one model row's image-input declaration.
 *
 * Rows are structurally open: a field this plugin does not edit — one a future
 * schema adds, or one hand-written in the settings document — must survive being
 * touched here. So the operation clones the row and changes only `input`.
 */

/** One model row of a provider profile, with unknown fields preserved. */
export interface ModelRow {
  id: string
  name?: string
  input?: readonly string[]
  [field: string]: unknown
}

/** Whether the row declares image input. */
export function hasVision(row: ModelRow): boolean {
  return Array.isArray(row.input) && row.input.includes('image')
}

/**
 * Set or clear the image modality on one row.
 * @param models - the provider's model rows.
 * @param modelId - the row to change.
 * @param on - true writes `["text","image"]`, false removes the `input` key.
 * @returns a new array; the input is never mutated.
 */
export function setVision(models: readonly ModelRow[], modelId: string, on: boolean): ModelRow[] {
  return models.map(row => {
    if (row.id !== modelId) return row
    const next: ModelRow = { ...row }
    if (on) {
      next.input = ['text', 'image']
    } else {
      delete next.input
    }
    return next
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/vision-setting.spec.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/vision-setting.ts tests/vision-setting.spec.ts
git commit -m "feat: vision flag read-modify-write for model rows"
```

### Task 10: The Vision settings page

**Files:**
- Create: `src/client/settings/vision-section.tsx`
- Modify: `src/client/index.ts`

**Interfaces:**
- Consumes: `hasVision`, `setVision` (Task 9); the settings wire API through `connection.api`.
- Produces: the `settings.section` registration.

**Before writing any code, pin the settings API shape.** The read/write verbs used below are written against the shipped page's *usage*, not a published signature. Read `D:\deepseek-harness\packages\client\ui-settings-models\src\client\store.ts` and `ModelsSection.tsx`, and copy the exact call shapes they make against `connection.api` for reading the `llm-pi-ai` document and writing it back. Adjust `VisionSectionProps.api` below to match. If the shipped store only exposes a whole-document replace, use that instead of inventing a per-namespace write.

- [ ] **Step 1: Write the component**

Create `src/client/settings/vision-section.tsx`:

```tsx
/**
 * The plugin's own settings page: one toggle per model, controlling whether the
 * model declares image input.
 *
 * This states a declaration only — it never probes whether an upstream really
 * serves images. The shipped Models page owns provider topology; this page owns
 * exactly one field of one row and preserves everything else.
 */
import { useCallback, useEffect, useState } from 'react'
import { hasVision, setVision, type ModelRow } from '../vision-setting.js'

/** The settings namespace holding provider profiles. */
const NAMESPACE = 'llm-pi-ai'

interface ProviderRow {
  id: string
  displayName?: string
  models?: ModelRow[]
}

export interface VisionSectionProps {
  api: {
    settings: {
      read(ns: string): Promise<unknown>
      write(ns: string, value: unknown): Promise<void>
    }
  }
}

export function VisionSection({ api }: VisionSectionProps) {
  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const document = await api.settings.read(NAMESPACE) as { providers?: Record<string, ProviderRow> }
      const entries = Object.entries(document?.providers ?? {})
      setProviders(entries.map(([id, row]) => ({ ...row, id })))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  const toggle = useCallback(async (providerId: string, modelId: string, on: boolean) => {
    setBusy(true)
    try {
      const document = await api.settings.read(NAMESPACE) as { providers: Record<string, ProviderRow> }
      const provider = document.providers[providerId]
      const models = setVision(provider.models ?? [], modelId, on)
      const next = {
        ...document,
        providers: { ...document.providers, [providerId]: { ...provider, models } },
      }
      await api.settings.write(NAMESPACE, next)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }, [api, load])

  if (error !== null) {
    return (
      <div>
        <p>Không đọc được cấu hình model: {error}</p>
        <button type="button" onClick={() => { void load() }}>Thử lại</button>
      </div>
    )
  }

  return (
    <div>
      <p>Bật/tắt khả năng đọc ảnh cho từng model. Bật sẽ khai báo <code>input: ["text","image"]</code>.</p>
      {providers.map(provider => (
        <section key={provider.id}>
          <h3>{provider.displayName ?? provider.id}</h3>
          {(provider.models ?? []).map(model => (
            <label key={model.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={hasVision(model)}
                disabled={busy}
                onChange={event => { void toggle(provider.id, model.id, event.target.checked) }}
              />
              <span>{model.name ?? model.id}</span>
            </label>
          ))}
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Register the section**

In `src/client/index.ts`:

```ts
ctx.inject(['slots', 'locale', 'connection'], (scoped: Context) => {
  const slots = scoped.get('slots') as any
  const connection = scoped.get('connection') as any
  slots.inject('settings.section', () => slots.register({
    name: 'settings.section',
    id: 'vision',
    order: 20,
    label: () => 'Vision',
  }, () => <VisionSection api={connection.api} />))
})
```

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: `tsc` clean.

- [ ] **Step 4: Manual check**

Open Settings → Vision. Toggling a model writes `input: ["text","image"]` into `C:\Users\Admin\.dsh\web-search.json` and the checkbox reflects the stored value after reload. Toggling off removes the key. Every other field of the row is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/client/settings/vision-section.tsx src/client/index.ts
git commit -m "feat: vision settings section"
```

---

## Phase 6 — Final verification

### Task 11: Full suite, build and end-to-end check

**Files:**
- Modify: `README.md` (document the new controls)

**Interfaces:**
- Consumes: everything above.
- Produces: a verified build.

- [ ] **Step 1: Run the full suite**

Run: `pnpm test`
Expected: PASS, every spec.

- [ ] **Step 2: Build**

Run: `pnpm run build`
Expected: `tsc` clean, `lib/client.js` and `lib/index.js` written, bundle id still `dsh-upload-plugin`.

- [ ] **Step 3: Verify the bundle id**

Run: `findstr /c:"__ModuleLoader__" lib\client.js`
Expected: `window.__ModuleLoader__.load({id:"dsh-upload-plugin",…`.

- [ ] **Step 4: End-to-end checklist**

Reload `http://127.0.0.1:3080` and confirm each:

1. `[📷] [📄] [Model ▾] [Effort ▾]` appear in the composer tool row.
2. Attaching a photo mints a chip; the draft holds no instruction text.
3. The sent message contains the read instruction.
4. **The next message, sent without attaching, contains no instruction.**
5. Removing an attachment from the rail leaves typed text intact.
6. The effort menu lists only the model's declared efforts plus Custom.
7. Settings → Vision toggles a model's image declaration and the file round-trips.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: document composer attach, effort and vision controls"
```

---

## Notes for the executor

- Phase 0 is a hard gate. Do not start Phase 1 before its decision is recorded.
- Tasks 1–4 and 7 and 9 are pure-logic tasks: they must be TDD'd exactly as written, since they are the only part of this work that vitest can reach (the suite runs in `node` with no DOM).
- Tasks 5, 8 and 10 are React components. Their verification is the manual check in their last step; do not invent DOM tests — the harness has no jsdom dependency and adding one is out of scope.
- If `tsc` reports an unused import after a refactor, remove it rather than suppressing the error.
