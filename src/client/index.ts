import type { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { AttachmentStore } from './attachment-store.js'
import { AttachmentRailEntry, bindAttachmentStore } from './attachment-bar.js'
import { AttachButtons } from './composer/attach-buttons.js'
import { ModelSeat } from './composer/model-seat.js'
import { registerVisionCommands } from './commands.js'
import { createVisionSource, type VisionSource } from './reference.js'
import { VisionSection } from './settings/vision-section.js'

export const name = 'dsh-upload-plugin-client'

export function apply(ctx: Context): void {
  registerVisionCommands(ctx)

  // Task 5 — the composer attach buttons and the reference source they mint
  // through. Storage is injected so the store stays testable in node.
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
    // The brief writes this component inline as JSX; `index.ts` is a `.ts` file,
    // which the TypeScript parser refuses to read as JSX (TS1005), so the same
    // element is built with `createElement` — identical tree and props.
    slots.inject('conversation.input.right', () => slots.register({
      name: 'conversation.input.right',
      id: 'vision-attach',
      order: 10,
    }, (props: any) => {
      const conversation = ctx.get('conversation') as any
      // The composer notice channel, in ui-conversation's own shape
      // (`QueueDock.tsx`: `conversation.input.for(actx).notify(level, text)`).
      // A missing channel must never block attachment, so it degrades to the console.
      const notify = (level: 'info' | 'error', text: string): void => {
        const actx = sessions?.scope?.(props.sessionId)
        if (actx === undefined) return
        const facade = conversation?.input?.for?.(actx)
        if (typeof facade?.notify !== 'function') {
          console.warn(`[dsh-upload-plugin] ${level}: ${text}`)
          return
        }
        facade.notify(level, text)
      }
      return createElement(AttachButtons, {
        sessionId: props.sessionId,
        input: props.input,
        store,
        sessions,
        notify,
      })
    }))
  })

  // Task 6 — the rail rides the live draft. This block binds the ONE record index
  // (the store above) so the rail and the command path resolve the same records
  // the buttons write, and registers the entry that re-renders the rail whenever
  // the composer's InputZone share changes. The entry renders nothing itself; the
  // rail is plain DOM inside the composer card.
  bindAttachmentStore(store)

  ctx.inject(['slots'], (scoped: Context) => {
    const slots = scoped.get('slots') as any
    slots.inject('conversation.input.right', () => slots.register({
      name: 'conversation.input.right',
      id: 'vision-rail',
      order: 11,
    }, AttachmentRailEntry))
  })

  // Task 8 — the model seat, taken over so the effort control can sit to its
  // right. `conversation.input.model` is a `single` slot, so this replaces the
  // shipped `ui-model-selection` occupant rather than adding beside it; the
  // `@deepseek-ai/dsh-client-ui-model-selection` edge in `dsh.client.inject`
  // makes that occupant's fiber activate first, so whenever it is present it is
  // already registered when ours lands. The brief writes the element inline as
  // JSX; `index.ts` is a `.ts` file, which the TypeScript parser refuses to read
  // as JSX (TS1005), so the component itself is handed to the registry instead —
  // the outlet delivers the same component the same props it reads.
  ctx.inject(['slots', 'sessions', 'modelDirectories'], (scoped: Context) => {
    const slots = scoped.get('slots') as any
    const sessions = scoped.get('sessions') as any
    const directories = scoped.get('modelDirectories') as any
    slots.inject('conversation.input.model', () => slots.register({
      name: 'conversation.input.model',
      // A single slot throws on a second registration at the occupied cell's own
      // priority (`SlotCore.register`: "single slot ... already has a
      // registration at priority 0"), and the shipped occupant registers at the
      // default 0. A LOWER rank shadows it instead — a cell renders its lowest
      // live entry — which is how ui-subagent takes `conversation.composer`.
      priority: -1,
      // The render machinery memoizes an entry's inject face per entry x session
      // scope (web-react `scoped-slots.tsx`, sessionInjectCache), so `load` and
      // `select` keep their identity across re-renders and the seat's mount
      // effect fires once per session. Built inline in a render callback
      // instead, `load` would be a fresh function on every composer render and
      // that effect would re-issue `session.models` on every keystroke.
      inject: (sessionId: string) => {
        const available = sessions?.subagentAddress?.(sessionId) === undefined
        const directory = directories.directoryFor(sessionId)
        return {
          available,
          directory: directory.store,
          load: () => { if (available) directory.load().catch(() => {}) },
          select: (selection: { provider: string; model: string; reasoningEffort?: string }) =>
            available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false),
          onError: (message: string) => { console.warn('[dsh-upload-plugin] model seat:', message) },
        }
      },
    }, ModelSeat))
  })

  // Task 10 — the plugin's own settings page, one toggle per model. `settings.section`
  // is a root-scoped list, so the registration carries the nav identity (`id` keys the
  // shell's `only` filter, `order` positions the row) and a `label` thunk, matching the
  // shipped `models` entry (`ui-settings-models/src/client/index.ts:118`).
  //
  // The brief writes the element inline as JSX in a render callback; `index.ts` is a
  // `.ts` file, which the TypeScript parser refuses to read as JSX (TS1005), so the
  // component is handed to the registry and the wire face arrives through the `inject`
  // face instead — Task 8's route, for Task 8's reason. Here the reason is sharper
  // still: the section's `load` effect is keyed on its `api` prop, so a fresh element
  // per render would re-read the settings document on every re-render. The face thunk
  // may still run more than once, but it only ever hands over the connection's own
  // stable `api`, which is the identity that effect actually depends on.
  ctx.inject(['slots', 'connection'], (scoped: Context) => {
    const slots = scoped.get('slots') as any
    const connection = scoped.get('connection') as any
    slots.inject('settings.section', () => slots.register({
      name: 'settings.section',
      id: 'vision',
      order: 20,
      label: () => 'Vision',
      inject: () => ({ api: connection.api }),
    }, VisionSection))
  })
}
