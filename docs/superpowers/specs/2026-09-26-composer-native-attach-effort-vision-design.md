# Design Spec: Composer-native Attach, Effort & Vision Controls

**Date:** 2026-09-26
**Status:** Approved by User (design decisions settled in session)
**Target Repository:** `D:\dsh-vision-plugim`
**Supersedes scope of:** `2026-04-18-custom-provider-vision-and-files-plugin-design.md` (that spec's `+`-menu command approach remains as an alias path; this spec changes where the controls live and how text reaches the model)

---

## 1. Overview

Four changes to `dsh-upload-plugin`, all delivered **inside the plugin** with no
edits to the DeepSeek Harness checkout at `D:\deepseek-harness`.

1. **Model + effort seat.** The plugin takes over the composer's
   `conversation.input.model` seat and renders the model selector together with a
   reasoning-effort selector to its right.
2. **Attach buttons in the composer.** Photo and file attachment become buttons
   in the composer tool row beside the model control, instead of living only in
   the `+` command menu.
3. **Injection at send time.** The reading instruction stops being pasted into
   the chat draft. The draft carries a short reference token; the full
   instruction is injected into the outgoing prompt when the message is sent.
4. **Vision settings section.** A plugin-owned `settings.section` page lists
   models and toggles image input per model, replacing hand-editing
   `web-search.json`.

### Non-goals

- No edits to `D:\deepseek-harness` (verified unnecessary; see §3).
- No change to the host HTTP endpoints' upload/list/view behaviour.
- No Anthropic/Gemini protocol work; this remains an OpenAI-compatible plugin.

---

## 2. Verified platform facts

These were read out of the harness checkout and are the basis for every design
decision below. Where a code comment contradicted the code, the code wins and the
discrepancy is recorded.

### 2.1 Slot map around the composer

Declared by `packages/client/ui-conversation/src/client/apply.ts` and documented in
`.../contract/slots.ts`:

| Slot | Kind | Owner share |
|---|---|---|
| `conversation.input.model` | `single` | `InputControlOwnerProps` (`locked` only) |
| `conversation.input.right` | `list` | `InputZone` |
| `conversation.input.left` | `list` | `InputZone` |
| `conversation.input.dock` | `list` | `InputZone` |
| `conversation.composer.dock` | `list` | `InputZone` |
| `settings.section` | `list` | owner-declared `inject` |

Registering into an undeclared slot throws; a `single` slot rejects a second
registration.

### 2.2 DOM order correction (the contract comment is stale)

`contract/slots.ts` states the model seat "sits in its own named seat just left
of" `conversation.input.right`. **This is wrong.** The actual DOM in
`InputBar.tsx:770-772` is:

```jsx
<div className={css.trailing}>
  {rightItems}                                    // conversation.input.right
  {renderSlot('conversation.input.model', ...)}   // the model seat
  <ContextMeter />
  [stop] [send]
</div>
```

and `InputBar.module.css:321` is `.trailing { flex: none; gap: 12px }` with no
`row-reverse` and no `order`. Visual order therefore equals DOM order:

```
[ left slot ] … [ right slot ] [ model seat ] [ context meter ] [ send ]
```

Consequences, which drive §4.1 and §4.2:

- `conversation.input.right` renders **left of** the model seat.
- Nothing pluggable renders **right of** the model seat. The only occupants there
  are DSH-owned (`ContextMeter`, the send button).
- Therefore "effort to the right of the model display" is achievable **only** by
  taking over the model seat itself and rendering both controls in one component.

### 2.3 Reference codec = send-time injection point

`packages/client/ui-input-trigger/src/types.ts` exposes a public registration API:

```ts
ctx.inputTriggers.registerSource(src: InputTriggerSource): () => void
```

An `InputTriggerSource` may own a `ReferenceCodec`:

```ts
interface ReferenceCodec {
  clipboardText(ref: string): string                 // copy/paste + persistence form
  serialize(ref: string, signal: AbortSignal): Promise<string>  // model form, at submit
}
```

`ui-conversation/src/client/input/facade.ts:416-440` (`sinkSerialized`) resolves each
draft occurrence through the owning source's codec and splices the returned text
into the prompt **immediately before** `defaultSink(text, imageIds, mode)`. Failure
blocks the send rather than silently downgrading to the clipboard form.

This is the sanctioned way to inject text at send time. There is **no** general
content-transform hook on `defaultSink` or `sendSession`; `InputActions.submit()`
takes no arguments and cannot carry modified content.

Reference implementations to model after: `ui-skill/src/client/index.ts:185`,
`ui-subagent/src/client/index.ts:97` (an `@` source), `ui-cordis/src/client/index.ts:168`
(an `@pluginId` source).

### 2.4 Bundle externals constraint

`packages/client/web/src/platform.ts` seeds the frozen module table with exactly:

```
react, react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/cordis,
@deepseek-ai/dsh-client-ui-slots, @deepseek-ai/dsh-client-web-react,
@deepseek-ai/dsh-client-ui-primitives, @deepseek-ai/dsh-client-ui-attachment,
@deepseek-ai/dsh-client-schema-form
```

`build-client.mjs` reads this list and marks exactly those specifiers external.
Everything else must therefore be:

- **type-only** (`import type`) — erased at build, or
- **reached at runtime through `ctx.get('service')`**, never through a runtime
  import.

The existing code already follows this discipline (`ctx.get('commandUi')`,
`ctx.get('sessions')`). New code must not break it: a runtime import of, say,
`@deepseek-ai/dsh-client-ui-conversation` would be inlined into the plugin bundle
and break service/context identity.

`react` and `@deepseek-ai/dsh-client-ui-primitives` **are** platform modules, so a
React component using `Toast` and the icon set is safe.

### 2.5 Model selection service

`ui-model-selection` publishes `ModelDirectoryResolver` as the `modelDirectories`
service and drives both the `/model` popup and the model seat from one per-session
`ModelDirectory` store:

```ts
directory.store.getSnapshot()   // { current: {provider, model, reasoningEffort}, groups, status, error, failures }
directory.select(selection)     // ModelSelection = { provider, model, reasoningEffort? }
```

`reasoning.efforts` / `reasoning.defaultEffort` per model come from the Host, not
from a client-owned vocabulary.

### 2.6 Settings surface

`ui-settings-models/src/client/index.ts` registers into `settings.section` with
`{ name, id, order, label: () => t('nav'), inject }` and reads/writes through
`connection.api` / `ctx.remote` (settings document wire API, with a
`settings/document-updated` push event). Settings documents live at
`~/.dsh/web-search.json` (path configured in the profile patch).

---

## 3. Why no harness edits are needed

Each requirement maps to an existing public extension point:

| Requirement | Extension point |
|---|---|
| Model + effort control | `conversation.input.model` (single slot) + `modelDirectories` service |
| Attach buttons | `conversation.input.right` (list slot) |
| Send-time injection | `ctx.inputTriggers.registerSource` + `ReferenceCodec` |
| Vision toggle page | `settings.section` (list slot) + settings wire API |

---

## 4. Feature designs

### 4.1 Model + effort seat (`conversation.input.model`)

The plugin registers into the model seat and renders one combined control:

```
[ 📷 ] [ 📄 ] │ [ Model ▾ ] [ Effort ▾ ] │ [ → ]
   └ .right slot ┘  └──── plugin's model seat ────┘
```

**Model half.** A compact re-implementation of the shipped `ModelSelect`: a
trigger showing the current model name, drilling into a provider-grouped list read
from `modelDirectories`. It must reproduce the observable behaviours that matter:

- `locked` from the owner share disables interaction.
- Sessions with a subagent address expose no selector (matching
  `sessions.subagentAddress(sessionId) !== undefined`).
- Loading / error / per-group failure states, with a retry that re-runs `load()`.
- A rejected selection announces through a transient `Toast` anchored to the
  composer card.
- Selection submits `{ provider, model }` through `directory.select`.

Deliberately **not** reproduced: the shipped component's two-level root menu
(Model / Effort row pair). Effort gets its own trigger instead, which is the point
of this feature.

**Effort half.** A separate trigger whose menu is built from the current model's
declared efforts:

- Menu rows = `model.reasoning.efforts` in Host order, each labelled with the
  Host-provided `name`.
- Plus a **Custom…** row that opens a small text input; the submitted
  `reasoningEffort` is the raw trimmed string.
- The trigger shows the effective effort (`current.reasoningEffort ??
  reasoning.defaultEffort`).
- `model.reasoning === undefined` → the effort trigger renders nothing (no
  placeholder, matching the seat's renders-nothing-while-empty convention).
- Selecting submits `{ provider, model, reasoningEffort }` through
  `directory.select`. A model switch preserves the model half only; effort falls
  back to the new model's default, because an effort valid on the old model is not
  necessarily valid on the new one.

### 4.2 Attach buttons (`conversation.input.right`)

Two icon buttons — photo and file — registered into the list slot at `order` 10
and 20, i.e. rendering immediately left of the model seat.

- Reuse the existing `pickFilesFromBrowser`, `optimizeImageIfNeeded` (the >4.5 MB
  downscale), and `uploadMultipleFiles` unchanged.
- On success the plugin registers an attachment record (§4.3) instead of writing
  text into the draft.
- The shipped `+` command menu keeps `/photos`, `/files` and `/uploads` as
  aliases for the same code path. `/uploads` remains the session history view.

### 4.3 Send-time injection (`ctx.inputTriggers`)

A single `InputTriggerSource`:

```ts
{
  trigger: '@',
  name: 'vision',
  candidates: async () => currentAttachmentTokens(),   // menu of pending attachments
  onPick: (pick) => ({ kind: 'insert', reference: { source: 'vision', ref: pick.candidate.name } }),
  lexicon: (session) => currentAttachmentTokens(session),   // lets the draft decorate tokens
  codec: {
    clipboardText: (ref) => `@${ref}`,
    serialize: async (ref) => instructionFor(ref),           // ← the full instruction
  },
}
```

`instructionFor(ref)` produces the existing Vietnamese instruction text for the
attachment kind (photo → `read_image`, file → `read`), keyed off the attachment
record: workspace-relative path plus `isPhoto`.

Two integration details:

- `lexicon` returns **bare names** (`anh1.png`), because the render side scans the
  draft for `<trigger><name>` — the `@` is the trigger, not part of the name. The
  `@anh1.png` form is the clipboard projection; what actually sits in the draft is
  a `U+FFFC` chip (see the insertion mechanism below).
- `@` already carries the shipped `ui-subagent` source. Duplicate registration
  throws only on an identical `(trigger, name)` pair, so `('@', 'vision')`
  coexists; the `@` menu then shows two groups in registration order. If that
  proves confusing in practice, the plugin can move to `/` with a
  `('slash', 'vision')` pair instead — the codec contract is identical. The spike
  decides which reads better.

The draft therefore shows only a compact chip; the long instruction exists solely
in the outgoing prompt. This also lets the plugin delete two existing behaviours
that are the root cause of a known defect:

- `uploader.insertPromptIntoComposer()` — no longer called.
- `attachment-bar.removeDraftAttachment()` overwriting the whole textarea with a
  regenerated prompt — removed; removing an attachment must not destroy text the
  user typed.

**Insertion mechanism: mint a chip, do not write text.**

A reference in the draft is **one `U+FFFC` placeholder plus an entry in the
machine's occurrence table** — it is not the literal string `@anh1.png`. That
string is only the `clipboardText` projection. `sinkSerialized` walks
`state.occurrences`, so writing text with `setDraft` would at best decorate and
would not reliably serialize. `setDraft` is therefore **not** the mechanism.

The plugin's composer component reads `useInput()` (the session standard kit) for
`draft`, `draftRev` and `occurrences`, then dispatches the scoped event:

```ts
ctx.emit('slash/input-insert-reference', {
  reference: { source: 'vision', ref: token, label: token, clipboardText: `@${token}` },
  span: { start: draft.length, end: draft.length, draftRev },   // append position
})
```

`TokenSpan` is `{ start, end, draftRev }` and its contract is *"CAS: stale draftRev
⇒ the whole action no-ops"* — supplying the live `draftRev` from `useInput` is what
makes the insert land.

**The one spike** is whether that scoped event is reachable from a plugin's own
component rather than only from inside `ui-conversation` (every shipped source is
driven by a menu pick, which receives its span from the pipeline). This is
verified **first**, before the rest of §4.3 is built. If the event proves
unreachable, the fallback is the `+`-menu command path — a menu pick does supply a
valid span — and that limitation is reported to the user rather than shipped
silently.

### 4.3.1 Lifecycle: one-shot per send

Attachments are consumed by the message that sends them. The **next** message
injects nothing unless the user attaches again.

This falls out of the mechanism instead of needing extra bookkeeping: injection
happens only for occurrences present in the draft, and DSH clears the draft when a
send settles. After send → no occurrences → `codec.serialize` is never called →
nothing is injected. The plugin must honour three rules to keep it that way:

1. **No pending-attachment queue.** Nothing may re-inject on a later message by
   itself. The draft's occurrences are the sole source of truth for what gets
   serialized.
2. **The composer rail shows only what is currently referenced** — driven by
   `input.occurrences`, so it empties itself when the draft clears.
3. **`/uploads` is history, not a queue.** It lists everything uploaded in the
   session for re-reference. Re-referencing is an explicit user action that mints
   a new chip, which is what makes the instruction appear for that message.

Because injection is draft-driven, a stale token cannot leak into a later message
even though the plugin keeps its records: a record only resolves a chip that is
already in the draft.

### 4.4 Vision settings section (`settings.section`)

A plugin-owned page registered with its own `id` and an `order` after the shipped
`models` section (which uses `order: 10`).

- Lists every provider and model known to the settings document, with the current
  image-input state derived from `model.input?.includes('image')`.
- Toggling on writes `input: ["text","image"]`; toggling off removes the `input`
  key. All other fields of the model entry are preserved verbatim — the shipped
  editors document this "structurally open row" discipline and this page follows
  it.
- Writes go through the settings wire API; the page subscribes to
  `settings/document-updated` to stay fresh.
- A model whose upstream does not support images is the user's call: the page
  states the declaration only and does not probe capability.

---

## 5. Data flow

```
[📷]/[📄] click
  → pickFilesFromBrowser → optimizeImageIfNeeded → uploadMultipleFiles
  → POST /api/vision-plugin/upload  (host writes <workspace>/uploads/<session>/…)
  → attachment record { token, relativePath, isPhoto } in plugin state
  → ctx.emit('slash/input-insert-reference', { reference, span })   // §4.3 — mints the chip

user presses send
  → facade.sinkSerialized() walks the draft's occurrences
  → codec.serialize(token) → full instruction text
  → session.prompt([...images, { type: 'text', text }], mode)
  → DSH clears the draft → occurrences empty → rail empties → nothing pending

next message, no new attach
  → no occurrences → codec never called → no instruction injected   // §4.3.1
```

Attachment state is keyed by session and persisted the way the current plugin
persists its upload list (localStorage per session id), so `/uploads` keeps
working across reloads.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Programmatic chip minting from a plugin component unproven (§4.3) | Spike the scoped `slash/input-insert-reference` event first; fallback is the `+`-menu path (a menu pick supplies a valid span), reported to the user if taken |
| An attachment leaks into a later message (§4.3.1) | Injection is draft-occurrence-driven only; no pending queue; rail reads `input.occurrences`; checklist item in §7 |
| Re-implemented model selector drifts from upstream behaviour | Keep the surface minimal (no two-level menu); pin the behaviours listed in §4.1; the `/model` popup command remains the full-featured path |
| Runtime import of a non-platform module inlines a duplicate copy | Enforce type-only imports + `ctx.get()`; §2.4 states the rule |
| Settings write clobbers sibling fields | Read-modify-write the model entry, preserve unknown keys |
| Taking the `single` model seat while another plugin also wants it | The seat throws on a second registration; this plugin is the only claimant by design. Revisit if a future plugin wants it. |

---

## 7. Testing

- Unit (vitest, existing harness): attachment-record → instruction mapping;
  effort menu construction from a declared-efforts fixture; settings
  read-modify-write preserving unknown keys; token name generation and collision
  handling.
- The reference codec's `serialize` is pure and directly unit-testable.
- Manual verification checklist: attach a photo with the model seat showing a
  vision-capable model; confirm the draft shows only a chip; confirm the sent
  message contains the instruction; **confirm the immediately following message
  contains no instruction (§4.3.1)**; confirm removing an attachment leaves typed
  text intact; confirm the effort menu lists only declared efforts plus Custom;
  confirm the settings toggle round-trips to `web-search.json`.

---

## 8. Out of scope

- Native draft-image attachments (`createDraftImages` / `addImages`). After the
  `input: ["text","image"]` fix this path works and would let photos ride as real
  image blocks with no instruction text at all. It is a simpler design for photos
  but does not cover files, and mixing two attachment mechanisms in one composer
  is worse than one. Revisit only if the `read_image` flow proves unreliable.
- Any change to the host endpoints, or to the harness checkout.
