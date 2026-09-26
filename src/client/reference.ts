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

/** The draft cursor one mint CAS-validates against: the draft text and its revision. */
export interface ChipCursor {
  draft: string
  draftRev: number
}

/**
 * The cursor after a mint that really landed.
 *
 * The machine's own transaction is the model: `replaceSpanWithChip` replaces the
 * span with `PLACEHOLDER + gap` and `adopt()` bumps `draftRev` by exactly one
 * (`ui-conversation/src/client/input/machine.ts:293-304`, `:179-182`). The gap is
 * one space unless the character after the span is already a space; every span
 * this plugin mints is zero-width at the draft END, so the tail is always empty
 * and the gap is always that space. `PLACEHOLDER` is one UTF-16 code unit
 * (`:24`), which is what makes the cursor's draft length track the machine's
 * exactly — `casOk` compares the revision AND bounds-checks `span.end <=
 * draft.length` (`:259-262`).
 *
 * Call it ONLY after a successful mint: a refused mint leaves the draft
 * untouched, so the next iteration must reuse the same pair or its CAS is stale
 * too. Both callers (the composer buttons and the `/photos` and `/files` command
 * path) share this step; it is the arithmetic that lost a whole batch of
 * attachments twice, so it lives here with its own spec.
 * @param cursor - the pair the last mint was attempted with.
 * @returns the advanced pair; the input is never mutated.
 */
export function nextChipCursor(cursor: ChipCursor): ChipCursor {
  return { draft: `${cursor.draft}\uFFFC `, draftRev: cursor.draftRev + 1 }
}
