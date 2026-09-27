import { describe, it, expect, beforeEach } from 'vitest'
import {
  VISION_ATTACHMENT_KIND, contextMessage, registerContextInjection, renderInjectionText,
} from '../src/host/context-injection.js'
import { clearRefs, syncRefs, claimRefs } from '../src/host/refs-store.js'
import type { PendingAttachment } from '../src/types.js'

const photo = (ref = 'r1'): PendingAttachment => ({
  ref, relativePath: `uploads/s/${ref}.png`, isPhoto: true,
})
const file = (ref = 'r2'): PendingAttachment => ({
  ref, relativePath: `uploads/s/${ref}.txt`, isPhoto: false,
})

beforeEach(() => { clearRefs('s1') })

describe('renderInjectionText', () => {
  it('is empty for an empty set', () => {
    expect(renderInjectionText([])).toBe('')
  })

  it('wraps the instruction in the harness reminder block', () => {
    const text = renderInjectionText([photo()])
    expect(text.startsWith('<system-reminder>')).toBe(true)
    expect(text.endsWith('</system-reminder>')).toBe(true)
    expect(text).toContain('uploads/s/r1.png')
    expect(text).toContain('read_image')
  })

  it('renders one line per attachment, in draft order', () => {
    const text = renderInjectionText([file(), photo()])
    const lines = text.split('\n')
    // open tag, two instructions, close tag
    expect(lines).toHaveLength(4)
    expect(lines[1]).toContain('r2.txt')
    expect(lines[2]).toContain('r1.png')
    expect(lines[1]).toContain('`read`')
    expect(lines[2]).toContain('read_image')
  })
})

describe('contextMessage', () => {
  it('is a user-role message whose source kind is not "user"', () => {
    const message = contextMessage([photo()])
    expect(message.role).toBe('user')
    // THE point of the change: the projection reads this exact field to choose a
    // context row over a steering bubble (`apiproxy/src/api-proxy.ts:1313`).
    expect(message.source.kind).toBe(VISION_ATTACHMENT_KIND)
    expect(message.source.kind).not.toBe('user')
  })

  it('satisfies every field Session.append validates', () => {
    // `packages/core/session/src/index.ts:301-328`: a non-empty string id, role
    // 'user', a source object with a non-empty string kind, and array content.
    const message = contextMessage([photo()])
    expect(typeof message.id).toBe('string')
    expect(message.id).not.toBe('')
    expect(message.role).toBe('user')
    expect(typeof message.source.kind).toBe('string')
    expect(message.source.kind).not.toBe('')
    expect(Array.isArray(message.content)).toBe(true)
  })

  it('mints a fresh identity per call, so two injections never collide', () => {
    expect(contextMessage([photo()]).id).not.toBe(contextMessage([photo()]).id)
  })

  it('carries exactly one text block holding the reminder', () => {
    const message = contextMessage([photo()])
    expect(message.content).toHaveLength(1)
    const block = message.content[0]!
    expect(block.type).toBe('text')
    expect(block.type === 'text' && block.text).toBe(renderInjectionText([photo()]))
  })

  it('records which refs produced it, so the durable row is self-describing', () => {
    expect(contextMessage([photo('a'), file('b')]).source.refs).toEqual(['a', 'b'])
  })
})

/**
 * A stand-in for the cordis context: enough to capture the listener and dispatch
 * a pre-step through it. The real dispatch machinery is the harness's, so what is
 * checked here is this handler's own contract — that it delegates, passes a reject
 * through, and appends exactly one message.
 */
function fakeCtx() {
  const listeners = new Map<string, (...args: any[]) => any>()
  return {
    on(event: string, handler: (...args: any[]) => any) { listeners.set(event, handler) },
    get(event: string) { return listeners.get(event) },
  }
}

const enter = (messages: any[] = []) => async () => ({ kind: 'enter', messages })

describe('registerContextInjection', () => {
  it('registers both the pre-step and the disposal listener', () => {
    const ctx = fakeCtx()
    registerContextInjection(ctx as never)
    expect(ctx.get('agent/pre-step')).toBeTypeOf('function')
    expect(ctx.get('session/disposed')).toBeTypeOf('function')
  })

  it('appends one context message when the session has refs', async () => {
    const ctx = fakeCtx()
    registerContextInjection(ctx as never)
    syncRefs('s1', [photo()])

    const decision = await ctx.get('agent/pre-step')!(
      { agent: { session: { id: 's1' } }, turn: 1, signal: new AbortController().signal },
      enter([]),
    )
    expect(decision.kind).toBe('enter')
    expect(decision.messages).toHaveLength(1)
    expect(decision.messages[0].source.kind).toBe(VISION_ATTACHMENT_KIND)
  })

  it('leaves the decision untouched when the session has no refs', async () => {
    const ctx = fakeCtx()
    registerContextInjection(ctx as never)
    const existing = { id: 'x', role: 'user', content: [], source: { kind: 'user' } }
    const decision = await ctx.get('agent/pre-step')!(
      { agent: { session: { id: 's1' } }, turn: 1, signal: new AbortController().signal },
      enter([existing]),
    )
    expect(decision.messages).toEqual([existing])
  })

  it('passes a reject straight through without injecting', async () => {
    const ctx = fakeCtx()
    registerContextInjection(ctx as never)
    syncRefs('s1', [photo()])
    const decision = await ctx.get('agent/pre-step')!(
      { agent: { session: { id: 's1' } }, turn: 1, signal: new AbortController().signal },
      async () => ({ kind: 'reject' }),
    )
    expect(decision).toEqual({ kind: 'reject' })
    // And the refs were NOT spent by the rejected step: a later turn still finds
    // them, which is what makes a vetoed step cost the user nothing.
    expect(claimRefs('s1')).toBeDefined()
  })

  it('injects once per turn across the steps of that turn', async () => {
    const ctx = fakeCtx()
    registerContextInjection(ctx as never)
    syncRefs('s1', [photo()])
    const payload = { agent: { session: { id: 's1' } }, turn: 7, signal: new AbortController().signal }

    const first = await ctx.get('agent/pre-step')!(payload, enter([]))
    const second = await ctx.get('agent/pre-step')!(payload, enter([]))
    expect(first.messages).toHaveLength(1)
    expect(second.messages).toHaveLength(0)
  })

  it('drops a disposed session\'s pending refs', async () => {
    const ctx = fakeCtx()
    registerContextInjection(ctx as never)
    syncRefs('s1', [photo()])
    ctx.get('session/disposed')!({ id: 's1' })

    const decision = await ctx.get('agent/pre-step')!(
      { agent: { session: { id: 's1' } }, turn: 1, signal: new AbortController().signal },
      enter([]),
    )
    expect(decision.messages).toHaveLength(0)
  })
})
