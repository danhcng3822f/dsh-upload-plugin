/**
 * Type surface of the harness contracts this plugin consumes.
 *
 * Two kinds of symbol belong here, and nothing else:
 *
 * 1. A platform module the plugin imports AT RUNTIME.
 *    `@deepseek-ai/dsh-client-ui-primitives` is seeded into the shell's frozen
 *    module table and marked external by `build-client.mjs`, so the bundle's own
 *    `require` resolves it. It is deliberately not an npm dependency of this
 *    package — the only version on the registry is a different, older package
 *    than the harness ships — so without a declaration `tsc` rejects the import
 *    with TS2307 and the build cannot stay clean.
 * 2. A contract type the plugin consumes STRUCTURALLY: a shape the slot outlet
 *    hands it as props, or one a service publishes. These packages are not
 *    installed here either — the plugin reaches their runtime through
 *    `ctx.get('service')`, never through an import — so the shapes are declared
 *    rather than imported, and `tsc` has nothing else to check them against.
 *
 * Every declaration below is copied VERBATIM from the harness source named in
 * its own comment, field for field and modifier for modifier. The single
 * exception is called out at its declaration. When the harness changes, this
 * file is the one place to re-check: a hand-written subset that quietly drops a
 * field is exactly how `ModelDirectoryState.failures` stayed invisible through a
 * whole fix round.
 *
 * What this file deliberately does NOT do is type the four `slots.register`
 * calls in `index.ts`, which stay cast through `scoped.get('slots') as any`.
 * That cascade is out of proportion to the hole it closes: `register` is generic
 * over the harness's `SlotMap` (declared by each owning package through
 * `declare module '@deepseek-ai/dsh-client-ui-slots'`, e.g.
 * `ui-conversation/src/client/contract/slots.ts:33-221`) plus ~10 helper types in
 * `ui-slots/src/index.ts:145-790`, and `@deepseek-ai/dsh-client-ui-slots` is not
 * installed here. A hand copy of that machinery would re-implement the check
 * rather than apply it. What IS checked locally: each registration's `inject`
 * face is annotated with the component's own props type where the face is the
 * whole contract (`VisionSection`), and the props types themselves are the real
 * harness types above, so a field cannot go missing from a shape the component
 * reads.
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  /**
   * Transient top-center banner: slides in, holds at full opacity, fades out,
   * then reports done so the owner can unmount it. Re-showing the same text
   * restarts the cycle when the owner remounts the component.
   * @param props.text - resolved banner copy; the owner passes the text to show.
   * @param props.icon - optional leading glyph.
   * @param props.anchor - optional element whose horizontal center the banner follows.
   * @param props.onDone - called once the fade completes; unmount the toast here.
   * @returns the floating banner. The implementation returns what its
   * `createPortal` yields, which is `react-dom`'s `ReactPortal`
   * (`ui-primitives/src/Toast.tsx:52-58`), while this declaration says
   * `ReactElement` — a supertype on purpose. The owner only mounts the result,
   * so under-promising the return type cannot mask a call-site error.
   */
  export function Toast(props: {
    text: string
    icon?: import('react').ReactNode
    anchor?: HTMLElement | null
    onDone: () => void
  }): import('react').ReactElement

  /** Visual variant, each backed by its `--dsw-alias-button-*` token family. */
  export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'

  /**
   * Token-styled button atom (`ui-primitives/src/Button.tsx:18-31`). Using it is
   * what makes a plugin's controls inherit the shell's chrome: a bare `<button>`
   * gets the browser's own fill and border, which is what made this plugin's
   * composer controls read as foreign.
   * @param props.variant - visual family (default `'ghost'`).
   * @param props.size - `'md'` 36px capsule or `'sm'` 28px compact.
   * @param props.icon - optional leading 16px icon node.
   */
  export function Button(props: {
    variant?: ButtonVariant
    size?: 'md' | 'sm'
    icon?: import('react').ReactNode
    className?: string | undefined
    children?: import('react').ReactNode
  } & import('react').ButtonHTMLAttributes<HTMLButtonElement>): import('react').ReactElement

  /** Shared props for every `ic_ds_*` icon (`ui-primitives/src/icons/props.ts:2-8`). */
  export interface IconProps {
    /** Square edge in px; defaults to the glyph's own drawn size. */
    size?: number | undefined
    /** Extra class for layout placement; color rides `currentColor`. */
    className?: string | undefined
  }

  /** `ic_ds_paperclip_outline_16` (`ui-primitives/src/icons/index.tsx:523-530`). */
  export function IconPaperclipOutline16(props: IconProps): import('react').ReactElement

  /** `ic_ds_chevron_down_outline_14` (`ui-primitives/src/icons/index.tsx:161-169`). */
  export function IconChevronDownOutline14(props: IconProps): import('react').ReactElement
}

declare module '@deepseek-ai/dsh-brand' {
  const BRAND: unique symbol

  /** A string carrying a compile-time-only brand `B`. */
  export type Branded<B extends string> = string & { readonly [BRAND]: B }
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  /** Minimal observable snapshot source: Session objects and snapshot stores both satisfy it. */
  export interface ObservableSnapshot<T> { getSnapshot(): T; subscribe(fn: () => void): () => void }

  /** Writable snapshot store (bare data face; React selector hooks are synthesized in web-react). */
  export interface SnapshotStore<T> extends ObservableSnapshot<T> {
    /**
     * Mutate the state through an immer draft.
     * @param mutator - draft mutator.
     */
    update(mutator: (draft: T) => void): void
    /**
     * Replace the state wholesale.
     * @param next - next state.
     */
    set(next: T): void
  }
}

declare module '@deepseek-ai/dsh-api-remotes/client' {
  /** Complete model selection for one session. */
  export interface ModelSelection {
    /** Registered provider route. */
    provider: string
    /** Provider-owned model id. */
    model: string
    /** Adapter-owned reasoning effort; absence preserves adapter/provider default behavior. */
    reasoningEffort?: string
  }

  /** One adapter-owned reasoning effort displayed for an exact model route. */
  export interface ModelReasoningEffort {
    /** Opaque value submitted back to the owning adapter. */
    id: string
    /** Adapter-supplied display name. */
    name: string
    /** Optional adapter-supplied description. */
    description?: string
  }

  /** Selectable reasoning metadata for one exact model route. */
  export interface ModelReasoning {
    /** Efforts in adapter-preferred display order. */
    efforts: ModelReasoningEffort[]
    /** Adapter-configured default; absence preserves the provider default. */
    defaultEffort?: string
  }

  /** One model displayed inside its provider group. */
  export interface ModelCatalogModel {
    /** Provider-owned model id. */
    id: string
    /** Provider-supplied display name. */
    name: string
    /** Optional provider-supplied description. */
    description?: string
    /** Exact-route reasoning metadata when the adapter exposes it. */
    reasoning?: ModelReasoning
  }

  /** One provider and the models it advertised successfully. */
  export interface ModelProviderGroup {
    /** Provider route id used for requests. */
    id: string
    /** Provider display name. */
    name: string
    /** Models in provider-preferred order. */
    models: ModelCatalogModel[]
  }

  /** A provider whose asynchronous catalog lookup failed. */
  export interface ModelCatalogFailure {
    /** Provider route id. */
    id: string
    /** Provider display name. */
    name: string
    /** Lookup failure diagnostic. */
    message: string
  }
}

declare module '@deepseek-ai/dsh-client-ui-model-selection' {
  /** Directory snapshot both entries render from. */
  export interface ModelDirectoryState {
    /** Model selection the host reports for the next assembled step; null before the first load. */
    current: import('@deepseek-ai/dsh-api-remotes/client').ModelSelection | null
    /**
     * Whether an adapter serves the current selection's provider, as the host reports
     * it — null before the first load, which is NOT the same as blocked. Read
     * this rather than "current matches no group": catalog membership is
     * advisory, so a route serving a model it stopped advertising is missing
     * from the groups yet perfectly usable.
     */
    routable: boolean | null
    /** Successfully loaded provider groups (last good load). */
    groups: readonly import('@deepseek-ai/dsh-api-remotes/client').ModelProviderGroup[]
    /** Provider-local failures from the last load; usable groups stay usable. */
    failures: readonly import('@deepseek-ai/dsh-api-remotes/client').ModelCatalogFailure[]
    /** Lifecycle of the in-flight operation. */
    status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error'
    /** Whole-request or selection failure text; null when none. */
    error: string | null
  }
}

declare module '@deepseek-ai/dsh-client-ui-conversation' {
  /** Browser-runtime identity of one unsent image draft. */
  export type DraftAttachmentId = import('@deepseek-ai/dsh-brand').Branded<'DraftAttachmentId'>

  /** Half-open [start, end) range/selection in draft character coordinates. */
  export interface EditSelection {
    readonly start: number
    readonly end: number
  }

  /**
   * One reference chip occurrence, backing exactly one U+FFFC placeholder in
   * the draft. Identity is occurrenceId — same-named
   * references stay independently addressable. label/clipboardText are the
   * owner's insert-time projections, cached so the chip survives owner loss
   * (invalid flips instead of dropping the occurrence).
   */
  export interface Occurrence {
    /** Machine-minted stable identity (monotonic per machine). */
    readonly occurrenceId: number
    /** Owning source name (serializer routing key). */
    readonly source: string
    /** Owner-scoped reference id. */
    readonly ref: string
    /** Placeholder offset in the draft; the occurrence occupies exactly [offset, offset+1). */
    readonly offset: number
    /** Chip display label (insert-time cache). */
    readonly label: string
    /** Clipboard / persistence projection, e.g. `/name` (insert-time cache, never the model form). */
    readonly clipboardText: string
    /** Owner-resolution failure flag: chip renders invalid; serialization must fail. */
    readonly invalid?: boolean
  }

  /**
   * Live paste-match attempt published while async matching may still upgrade
   * pasted tokens (the clipboard round-trip). Any non-paste transaction,
   * submit start, invalidate-paste, or release ends it; a paste-upgrade keeps
   * it current (later tokens re-CAS against the advanced draftRev).
   */
  export interface PasteAttemptState {
    /** Machine-minted attempt identity (paste-upgrade must match it). */
    readonly attemptId: number
    /** Pasted range in the draft as of the paste transaction. */
    readonly insertedRange: EditSelection
    /** Caller-supplied projection generation echoed back (the controller drops cross-generation results). */
    readonly generation: number
  }

  /**
   * STAND-IN — the one declaration in this file that is not verbatim. The real
   * `QueuedMessage` is `QueueRow`, i.e. `ConversationSnapshot['queue'][number]`
   * (`ui-conversation/src/client/contract/queue.ts:13`), and that snapshot is the
   * runtime's own conversation projection
   * (`runtime/src/client/sessions/conversation.ts:433`) — a graph this plugin
   * never reads. `unknown` is the safe direction: the field cannot be used by
   * accident, while `InputState.queue` keeps its real name, type and position.
   */
  export type QueuedMessage = unknown

  /** Published input state (the currency; per-session). */
  export interface InputState {
    readonly draft: string
    /** Ordered runtime-only image ids; bytes and URLs stay in ConversationController. */
    readonly imageIds: readonly DraftAttachmentId[]
    /** Monotonic draft revision (span CAS compares against this). */
    readonly draftRev: number
    readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'
    /** Present exactly while claimed/submitting (claim snapshot during flight; submit closure withheld). */
    readonly claim?: { readonly token: string; readonly hint?: string }
    /** Chip occurrence table, sorted by offset (one U+FFFC per entry). */
    readonly occurrences: readonly Occurrence[]
    /** Live paste-match attempt (absent when no paste is matchable). */
    readonly paste?: PasteAttemptState
    /** Read-only transient inbox projection (`session/queue`, including pending steering). */
    readonly queue: readonly QueuedMessage[]
  }

  /**
   * The public input action face provided to every session-scope slot
   * component: two stable-identity void callbacks, mirroring the
   * useStore+actions convention. Command-style handles (track/arbitrate/space/
   * undo/paste/…) stay InputBar-private and never ride this face.
   */
  export interface InputActions {
    /** Single public draft write path (full next draft; occurrence math via diff scan). */
    setDraft(text: string): void
    /** Append ordered browser-owned image ids; busy admission phases refuse. */
    addImages(ids: readonly DraftAttachmentId[]): boolean
    /** Remove one browser-owned image id. */
    removeImage(id: DraftAttachmentId): void
    /** Drop ids whose browser-owned objects no longer exist. */
    pruneImages(ids: readonly DraftAttachmentId[]): void
    /** Enter submission (adjudication / claim transaction / default sink inside). */
    submit(): void
  }
}
