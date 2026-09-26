/**
 * The composer's reasoning-effort control.
 *
 * It registers into `conversation.input.right`, so it renders to the LEFT of the
 * model seat — the model seat itself is left to the harness's shipped selector,
 * which owns the model list, its failure states and its retry.
 *
 * The menu is built from the Host's per-model effort vocabulary
 * (`model.reasoning.efforts`) plus one Custom row, so it can never offer a level
 * the Host would reject. A model that declares no reasoning renders nothing.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, IconChevronDownOutline14, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { effortChoices, effortLabel, type ReasoningInfo } from '../effort.js'

/**
 * The trigger and its menu, styled from the shell's own tokens so the control
 * reads as part of the composer rather than beside it.
 *
 * A bare `<button>` takes the browser's default fill and border, which is what
 * made this plugin's controls look foreign; `Button` supplies the
 * `--dsw-alias-button-*` chrome instead. The menu card copies the geometry the
 * shell's `Menu` primitive uses for its own list — 12px radius, inverted
 * hairline, `--dsw-specific-menu` fill, `--dsw-shadow-lv3` — and opens upward
 * because the composer sits at the bottom of the viewport.
 */
const ROOT_STYLE = { position: 'relative', display: 'inline-flex', alignItems: 'center' } as const
const MENU_STYLE = {
  position: 'absolute',
  bottom: 'calc(100% + 4px)',
  left: 0,
  zIndex: 20,
  minWidth: 160,
  padding: 4,
  border: '1px solid var(--dsw-alias-border-inverted)',
  borderRadius: 12,
  background: 'var(--dsw-specific-menu)',
  boxShadow: 'var(--dsw-shadow-lv3)',
} as const
const ROW_STYLE = { width: '100%', justifyContent: 'flex-start' } as const

export interface EffortControlProps {
  available: boolean
  /**
   * The session's shared directory store, as `ModelSelectInjected` publishes it
   * (`ui-model-selection/src/client/slots.ts:16`) — the real state type, not a
   * hand-stated subset, so a field this component reads cannot be dropped from
   * the contract unnoticed.
   */
  directory: SnapshotStore<ModelDirectoryState>
  load: () => void
  select: (selection: ModelSelection) => Promise<boolean>
  onError: (message: string) => void
}

/**
 * The model's reasoning metadata, only when it carries the effort catalog.
 *
 * The directory's data is the Host's, so a `reasoning` object can arrive without
 * the `efforts` array `ReasoningInfo` declares — and both `effortChoices` and
 * `effortLabel` read `reasoning.efforts` unguarded (`effort.ts:36`, `:54`), which
 * would throw mid-render. Normalizing here keeps `effort.ts` untouched and makes
 * such a value behave exactly like no reasoning declared at all.
 * @param reasoning - the resolved model's reasoning share, as the directory publishes it.
 * @returns the metadata when it declares an effort catalog, else undefined.
 */
function usableReasoning(reasoning: ReasoningInfo | undefined): ReasoningInfo | undefined {
  if (reasoning === undefined || !Array.isArray(reasoning.efforts)) return undefined
  return reasoning
}

export function EffortControl({ available, directory, load, select, onError }: EffortControlProps) {
  const [snapshot, setSnapshot] = useState(() => directory.getSnapshot())
  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => directory.subscribe(() => { setSnapshot(directory.getSnapshot()) }), [directory])

  /**
   * Load the catalog on mount. This component reads the current model's reasoning
   * out of the same directory the shipped selector reads, and that directory does
   * not fetch on its own — the selector loads it when its menu opens. Without this
   * the control would render nothing until the user happened to open the model
   * menu first.
   */
  useEffect(() => {
    if (!available) return
    load()
  }, [available, load])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) { setOpen(false); setCustomOpen(false) }
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

  const reasoning = usableReasoning(currentModel?.reasoning)
  const choices = useMemo(
    () => effortChoices(reasoning, current?.reasoningEffort),
    [reasoning, current?.reasoningEffort],
  )

  if (!available) return null
  if (reasoning === undefined) return null

  /**
   * A rejected selection: announce it, and keep the diagnostic channel.
   *
   * The Host's own text is read from the directory at settle time, not from this
   * render's snapshot: `select()` clears `error` when it starts and writes the
   * failure through the store, so a snapshot captured when the click's render ran
   * still holds the pre-click value and would lose the message to the fallback.
   * @param accepted - whether the directory took the selection.
   */
  const settle = (accepted: boolean): void => {
    if (accepted) { setOpen(false); setCustomOpen(false); return }
    const message = directory.getSnapshot().error ?? 'Không đổi được model'
    onError(message)
    // A fresh seq per show: the Toast restarts its own cycle by being remounted.
    toastSeq.current += 1
    setToast({ seq: toastSeq.current, text: message })
  }

  const chooseEffort = (effort: string | undefined): void => {
    if (current === null || effort === undefined) return
    // Re-apply the SAME route with the new level: only `reasoningEffort` changes,
    // so the provider and model come from the session's current selection.
    void select({ provider: current.provider, model: current.model, reasoningEffort: effort }).then(settle)
  }

  return (
    <div ref={rootRef} style={ROOT_STYLE}>
      <Button
        variant="toolbar"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mức suy luận"
        onClick={() => { setOpen(!open); setCustomOpen(false) }}
      >
        {effortLabel(reasoning, current?.reasoningEffort) ?? '—'}
        <IconChevronDownOutline14 size={14} />
      </Button>

      {open && (
        <div role="menu" style={MENU_STYLE}>
          {/* Only the Host-declared efforts are radio rows; Custom… is a button
              that opens a text input instead. `effortChoices` marks a row
              selected only for an effort the catalog declares, so an effective
              effort from outside the catalog (a value typed into Custom…, or one
              the Host reports for a route it no longer advertises) checks no row
              while the trigger above still shows that value. The shipped
              selector resolves an unadvertised effort the same way, so this is
              left as is: the trigger carries the value, and Custom… is the
              affordance for entering another one. */}
          {choices.filter(choice => !choice.custom).map(choice => (
            <Button
              key={choice.key}
              variant="ghost"
              size="sm"
              style={ROW_STYLE}
              role="menuitemradio"
              aria-checked={choice.selected}
              disabled={snapshot.status === 'selecting'}
              onClick={() => { chooseEffort(choice.effort) }}
            >
              {choice.label}
            </Button>
          ))}
          <Button variant="ghost" size="sm" style={ROW_STYLE} onClick={() => { setCustomOpen(true) }}>
            Custom…
          </Button>
          {customOpen && (
            <form
              style={{ display: 'flex', gap: 4, padding: 4 }}
              onSubmit={(event) => {
                event.preventDefault()
                // The submitted effort is the raw trimmed string, and an empty
                // result means nothing was chosen — never a bare ''.
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
              <Button variant="ghost" size="sm" type="submit">OK</Button>
            </form>
          )}
        </div>
      )}

      {/* Portaled to the body by the primitive itself, anchored to the composer
          card so the banner centres over the chat column. The seq key remounts it
          so a repeated rejection restarts the cycle instead of being swallowed. */}
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}
