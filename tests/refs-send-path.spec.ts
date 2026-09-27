/**
 * R31 across the seam: the real client classifier, the real endpoint handler and
 * the real store, wired together the way the browser and the host are.
 *
 * Every other spec in this directory pins one module. This one exists because the
 * bug it fixes lived in the SEAM — the client pushed correctly, the host held the
 * set correctly, and the client's own empty push at send time erased it before the
 * turn could claim it. A test of either half alone passes on the broken system, so
 * the properties from the brief are asserted here, end to end.
 *
 * The four that must hold:
 *
 * 1. after a send the host still holds the refs, and the turn's first step claims
 *    them, and the claim spends them so the next message injects nothing;
 * 2. a rail removal clears them;
 * 3. a removal by editing the draft clears them;
 * 4. re-attaching after a send re-arms — including the same file again, which
 *    `/photos` re-references by its existing ref, so the pushed set is identical.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  noteDraftRemoval, noteSerializedRef, resetRefSync, syncActiveRefs,
} from '../src/client/ref-sync.js'
import { makeRef, type AttachmentRecord } from '../src/client/attachments.js'
import { handleReadRefs, handleSyncRefs } from '../src/host/endpoints.js'
import { claimRefs, clearRefs } from '../src/host/refs-store.js'
import type { PendingAttachment, RefPushReason } from '../src/types.js'

const SESSION = 'session-abc12345'

/** The record the browser holds for one attached file, as `attachment-store` mints it. */
const record: AttachmentRecord = {
  token: 'tải xuống.webp',
  ref: makeRef('abc12345', 'tải xuống.webp'),
  relativePath: 'uploads/session-abc12345/session_abc12345__tải xuống.webp',
  isPhoto: false,
  size: 1,
  uploadedAt: 1,
}

/** What the host should end up holding for it. */
const pending: PendingAttachment = {
  ref: record.ref,
  relativePath: record.relativePath,
  isPhoto: false,
}

/**
 * The client's transport, wired to the real route handler.
 *
 * `handleSyncRefs` is `async` but has no `await` before it writes, so the store is
 * updated by the time this returns — the same ordering the browser relies on.
 */
function wire() {
  const reasons: RefPushReason[] = []
  const impl = ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    reasons.push(body.reason)
    return handleSyncRefs(body).then(result => ({ ok: result.ok }))
  }) as unknown as typeof fetch
  return { reasons, impl }
}

/** One committed send, as the client performs it: serialize, then the empty push. */
function send(refs: readonly AttachmentRecord[], impl: typeof fetch): void {
  for (const attachment of refs) noteSerializedRef(attachment.ref)
  syncActiveRefs(SESSION, [], impl)
}

beforeEach(() => {
  resetRefSync()
  clearRefs(SESSION)
})

describe('the send path, end to end', () => {
  it('holds the refs across the send, so the turn claims them and spends them', async () => {
    const { reasons, impl } = wire()

    // 1. Attach: the rail pushes the live set, and the host holds it unspent.
    syncActiveRefs(SESSION, [record], impl)
    expect((await handleReadRefs(SESSION)).refs).toEqual([pending])

    // 2. Send: the composer clears the draft and the rail re-renders empty.
    send([record], impl)

    // The bug: this used to be an empty, unspent set, so the turn injected nothing.
    const afterSend = await handleReadRefs(SESSION)
    expect(afterSend.refs).toEqual([pending])
    expect(afterSend.spent).toBe(false)
    expect(reasons).toEqual(['live', 'sent'])

    // 3. The turn's first step claims it — once.
    expect(claimRefs(SESSION)).toEqual([pending])
    expect(claimRefs(SESSION)).toBeUndefined()

    // 4. And the message AFTER it carries no instruction.
    expect(claimRefs(SESSION)).toBeUndefined()
    expect((await handleReadRefs(SESSION)).spent).toBe(true)
  })

  // A lost response must not lose the attachment: the client re-issues the empty
  // push, and it must still say `sent`. The evidence that decided the first attempt
  // has been spent by then, so a re-derived reason would read this as a removal and
  // erase the refs — the bug, reached through the network instead of the composer.
  it('still holds the refs when the send\'s empty push was not confirmed', async () => {
    let refuse = false
    const reasons: RefPushReason[] = []
    const impl = ((_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      reasons.push(body.reason)
      if (refuse) {
        refuse = false
        return Promise.resolve({ ok: false })
      }
      return handleSyncRefs(body).then(result => ({ ok: result.ok }))
    }) as unknown as typeof fetch

    syncActiveRefs(SESSION, [record], impl)
    refuse = true
    send([record], impl)
    await Promise.resolve(); await Promise.resolve()
    // The next composer render retries the push the host refused.
    syncActiveRefs(SESSION, [], impl)

    expect(reasons).toEqual(['live', 'sent', 'sent'])
    expect((await handleReadRefs(SESSION)).refs).toEqual([pending])
    expect(claimRefs(SESSION)).toEqual([pending])
  })

  it('shows the whole story in the log, which is what the diagnosis reads', async () => {
    const { impl } = wire()
    syncActiveRefs(SESSION, [record], impl)
    send([record], impl)
    claimRefs(SESSION)

    const read = await handleReadRefs(SESSION)
    expect(read.log).toMatchObject([
      { count: 1, reason: 'live' },
      { count: 0, reason: 'sent' },
    ])
    // Reading is not claiming: the set it just described is still spent, and the
    // injection it explains already happened.
    expect(claimRefs(SESSION)).toBeUndefined()
  })

  it('re-arms when the same file is referenced again after a send', async () => {
    const { impl } = wire()
    syncActiveRefs(SESSION, [record], impl)
    send([record], impl)
    expect(claimRefs(SESSION)).toEqual([pending])

    // `/photos` re-references the existing record, so this push is byte-identical
    // to the one before the send — and it must still inject.
    syncActiveRefs(SESSION, [record], impl)
    expect(claimRefs(SESSION)).toEqual([pending])
  })

  it('clears the held refs when the rail removes the chip', async () => {
    const { reasons, impl } = wire()
    syncActiveRefs(SESSION, [record], impl)
    // The ✕ writes the draft, which empties it, and the rail pushes the empty set.
    noteDraftRemoval(SESSION)
    syncActiveRefs(SESSION, [], impl)

    expect(reasons).toEqual(['live', 'removed'])
    expect((await handleReadRefs(SESSION)).refs).toEqual([])
    expect(claimRefs(SESSION)).toBeUndefined()
  })

  it('clears the held refs when the chip is removed by editing the draft', async () => {
    const { impl } = wire()
    syncActiveRefs(SESSION, [record], impl)
    // Backspacing over the placeholder: the plugin sees no removal at all, only a
    // draft that no longer holds the chip. With no evidence of a send, an empty
    // push is a removal — the default, and the safe direction.
    syncActiveRefs(SESSION, [], impl)

    expect((await handleReadRefs(SESSION)).refs).toEqual([])
    expect(claimRefs(SESSION)).toBeUndefined()
  })

  // The one way the two signals can disagree: a submit that serialized the chip
  // and then never emptied the draft (the host refused it) leaves a send mark
  // behind. The user's removal afterwards is the later fact and must win.
  it('still clears when a removal follows a submit that never emptied the draft', async () => {
    const { reasons, impl } = wire()
    syncActiveRefs(SESSION, [record], impl)
    noteSerializedRef(record.ref)
    noteDraftRemoval(SESSION)
    syncActiveRefs(SESSION, [], impl)

    expect(reasons).toEqual(['live', 'removed'])
    expect(claimRefs(SESSION)).toBeUndefined()
  })

  it('keeps two sessions apart through the whole cycle', async () => {
    const { impl } = wire()
    const other: AttachmentRecord = {
      ...record, ref: makeRef('zzz99999', 'b.txt'), relativePath: 'uploads/session-zzz99999/b.txt',
    }
    syncActiveRefs(SESSION, [record], impl)
    syncActiveRefs('session-zzz99999', [other], impl)
    send([record], impl)

    // The send belongs to SESSION only.
    expect(claimRefs(SESSION)).toEqual([pending])
    expect(claimRefs('session-zzz99999')).toEqual([
      { ref: other.ref, relativePath: other.relativePath, isPhoto: false },
    ])
    clearRefs('session-zzz99999')
  })
})
