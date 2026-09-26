/**
 * The composer's model seat, taken over so the effort control can sit to the
 * right of the model name.
 *
 * `conversation.input.model` is a `single` slot: taking it means rendering the
 * whole model affordance, so this component re-implements the shipped selector's
 * observable behaviour (provider-grouped list, loading / whole-request error /
 * per-provider failure states with a retry, locked, subagent exclusion, a
 * transient toast on rejection) and adds the effort half.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { effortChoices, effortLabel, type ReasoningInfo } from '../effort.js'

export interface ModelSeatProps {
  locked: boolean
  available: boolean
  directory: {
    subscribe(fn: () => void): () => void
    getSnapshot(): {
      current: { provider: string; model: string; reasoningEffort?: string } | null
      groups: readonly { id: string; name: string; models: readonly { id: string; name: string; description?: string; reasoning?: ReasoningInfo }[] }[]
      failures: readonly { id: string; name: string; message: string }[]
      status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error'
      error: string | null
    }
  }
  load: () => void
  select: (selection: { provider: string; model: string; reasoningEffort?: string }) => Promise<boolean>
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

export function ModelSeat({ locked, available, directory, load, select, onError }: ModelSeatProps) {
  const [snapshot, setSnapshot] = useState(() => directory.getSnapshot())
  const [open, setOpen] = useState<'none' | 'model' | 'effort'>('none')
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
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

  const reasoning = usableReasoning(currentModel?.reasoning)
  const choices = useMemo(
    () => effortChoices(reasoning, current?.reasoningEffort),
    [reasoning, current?.reasoningEffort],
  )

  if (!available) return null

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
    if (accepted) { setOpen('none'); setCustomOpen(false); return }
    const message = directory.getSnapshot().error ?? 'Không đổi được model'
    onError(message)
    // A fresh seq per show: the Toast restarts its own cycle by being remounted.
    toastSeq.current += 1
    setToast({ seq: toastSeq.current, text: message })
  }

  const submit = (selection: { provider: string; model: string; reasoningEffort?: string }): void => {
    void select(selection).then(settle)
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
          {/* One strip for both failure kinds: the whole-request error, and the
              per-provider failures a partly successful load leaves behind. A
              failed provider keeps `error` null (the directory writes `failures`
              and clears `error` in the same update) and is simply absent from
              `groups`, so without this row it would be a dead end — no strip, no
              retry, and no sign of why the provider is missing. */}
          {(snapshot.error !== null || snapshot.failures.length > 0) && (
            <div>
              {snapshot.error !== null && <span>{snapshot.error}</span>}
              {snapshot.failures.map(failure => (
                <div key={failure.id}>
                  <span>{failure.name}</span>
                  <span>{failure.message}</span>
                </div>
              ))}
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
              <button type="submit">OK</button>
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
