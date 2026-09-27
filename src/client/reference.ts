import type { AttachmentStore } from './attachment-store.js'
import type { AttachmentRecord } from './attachments.js'
import { VISION_SOURCE } from './attachments.js'
import { noteSerializedRef } from './ref-sync.js'

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
 * What the codec substitutes for a chip: one zero-width space.
 *
 * Exported so the spec can assert the exact character and its survival through
 * the harness's `trim()`, rather than restating the literal and drifting from it.
 * See the codec's `serialize` for why it must be non-empty and why this character
 * in particular.
 */
export const ZERO_WIDTH_PLACEHOLDER = '\u200B'

/**
 * The plugin's reference source.
 *
 * The draft holds one U+FFFC chip per inserted reference; the chip carries this
 * source's name and the record's ref. At submit the facade calls `codec.serialize`
 * once per chip and splices the result into the prompt. As of R25-B2 that result
 * is a zero-width space, not prose: the instruction travels as a host-side context
 * injection instead, and this codec's remaining jobs are resolving the ref (so an
 * unknown one blocks the send) and keeping a file-only message non-empty.
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

      // R25-B2 — the instruction NO LONGER travels in the message text.
      //
      // It used to be `instructionFor(record)`, which the composer spliced into
      // the prompt at the chip's offset (`facade.ts:436`), so the user's own chat
      // bubble contained a sentence they never typed. The instruction is now a
      // host-side context injection (`src/host/context-injection.ts`), and this
      // codec's whole remaining job is to resolve the ref so an unknown one still
      // blocks the send.
      //
      // It must return something NON-EMPTY, and this is the trap the first attempt
      // at this change fell into. The harness silently refuses a message with no
      // text and no images:
      //
      //   ui-conversation/src/client/input/hub.ts:155
      //   if (text === '' && imageIds.length === 0) return
      //
      // Nothing is sent, no error is raised, no notice appears and the draft is
      // not even cleared — the button simply dies. A file-only send is exactly
      // `text === ''` once this stops returning prose, so the chip's serialization
      // is the only thing keeping it alive.
      //
      // U+200B ZERO WIDTH SPACE, and it survives the harness's own trim:
      // `facade.ts:440` passes the spliced prompt through `out.trim()`, and `trim`
      // removes WhiteSpace and LineTerminator code points. U+200B is neither — it
      // is category Cf (format), not Zs — so it passes through untouched and the
      // send stays non-empty. Verified against the Unicode property, not by eye:
      // `'\u200B'.trim() === '\u200B'` holds in the Node the plugin builds under.
      //
      // A zero-width character rather than a space on purpose: a space would be
      // invisible too, but it would survive into the model-facing prompt as
      // trailing whitespace, while this contributes no glyph, no width and no
      // token to the message the user can see.
      serialize: async (ref, signal) => {
        if (signal.aborted) throw new Error('aborted')
        const record = store.byRef(ref)
        if (record === undefined) {
          // Still a hard failure, and still the reason this codec resolves the ref
          // at all. A chip whose record is gone has no path to tell the model
          // about, so the send must block with a visible error rather than go
          // through carrying a placeholder that points at nothing.
          throw new Error(`vision: unknown attachment reference "${ref}"`)
        }
        // R31 — this call IS the send, as far as the client can observe one, and
        // it is the only place the plugin sees one before the draft it is about
        // to empty is re-pushed as an empty set. `ref-sync` uses it to tell an
        // empty push caused by a send from one caused by a removal, which need
        // opposite treatment on the host. Marked only on the success path: a
        // throw blocks the send and the draft is retained, so nothing empties.
        noteSerializedRef(ref)
        return ZERO_WIDTH_PLACEHOLDER
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
