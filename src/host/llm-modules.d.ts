/**
 * Type surface of the harness contracts the HOST half of this plugin consumes.
 *
 * The host half had no equivalent of `src/client/platform-modules.d.ts` until
 * R25-B2, because it imported nothing from the harness at all: `src/index.ts` and
 * `src/host/*` reach every service through `ctx.get('name')` and never through a
 * module specifier. The context injection is the first host-side feature that
 * needs harness TYPES — the message handed to `agent/pre-step` has to be the
 * harness's own `UserMessage` — so the shapes are declared here.
 *
 * ## Why this is a declaration and not an import
 *
 * `import { createUserMessage } from '@deepseek-ai/dsh-llm'` would be correct
 * inside the harness monorepo and is WRONG here, and the failure is at RUNTIME,
 * not compile time. The plugin is installed into the profile at
 * `<DSH_HOME>/profiles/<name>/node_modules/dsh-upload-plugin`, and the
 * `@deepseek-ai` scope directory beside it is EMPTY — no `dsh-llm`, no
 * `dsh-agent`. The loader's `internal.import` anchors only the PLUGIN's own
 * specifier (`vendor/loader/src/config/tree.ts:154-155`); from then on the
 * plugin's own imports are Node's business, resolved against the plugin's
 * location. A static import in `lib/index.js` would therefore fail with
 * `ERR_MODULE_NOT_FOUND` at mount and take the whole plugin down with it —
 * including the four endpoints that work today. `@deepseek-ai/dsh-llm` cannot
 * become a dependency of this package either: it is workspace-only, with no
 * registry release to depend on.
 *
 * So the host half builds the message as a plain object (`contextMessage` in
 * `src/host/context-injection.ts`) and this file gives that object its type.
 * `createUserMessage` is reproduced rather than called: it is
 * `{ ...input, role: 'user', id: crypto.randomUUID() }` followed by a deep
 * freeze (`packages/llm/llm/src/message.ts:192-199` → `:178-185`). The freeze is
 * deliberately NOT reproduced — `Session.append` deep-freezes the entire event it
 * publishes (`packages/core/session/src/index.ts:627`), which is why the
 * harness's own pre-step injectors hand over messages without freezing them
 * twice. The id comes from `node:crypto`'s `randomUUID`, imported explicitly
 * rather than read off the ambient global.
 *
 * ## Policy
 *
 * Every declaration below is copied VERBATIM from the harness source named in its
 * own comment, field for field and modifier for modifier. Where a shape is
 * narrowed, the narrowing is stated at the declaration. When the harness changes,
 * this file is the one place to re-check — the same policy
 * `platform-modules.d.ts` states, and the reason that file exists.
 *
 * ## What is NOT verified here
 *
 * That `agent/pre-step` reaches this plugin's context and that the injected
 * message survives to the model are RUNTIME surfaces with no test in this
 * package; see `r25b2-report.md`. What IS verified statically: the seam admits
 * untagged listeners (`packages/core/scope/src/index.ts:173-181` — a listener
 * with no scope tag is admitted to every scoped dispatch), and the harness's own
 * unscoped pre-step plugins rely on exactly that (`time-context`,
 * `agent-instructions`, `tool-skill`).
 */

/**
 * The self-import below is load-bearing, not tidiness.
 *
 * A `declare module 'X'` in a global `.d.ts` REPLACES the module's declarations
 * unless the file also imports from `X`, which turns the declaration into an
 * AUGMENTATION that merges with the real one. `@deepseek-ai/cordis` IS installed
 * here, so its real declarations exist — without this import they are discarded
 * and `tsc` reports `Module '"@deepseek-ai/cordis"' has no exported member
 * 'Context'` in four files that never touched this change.
 *
 * The harness packages get no such import, and cannot: they are not installed, so
 * `import type {} from '@deepseek-ai/dsh-llm'` is itself a TS2307. Their blocks
 * below are therefore plain ambient declarations, which is exactly what is wanted
 * — there is no real declaration to merge with.
 */
import type {} from '@deepseek-ai/cordis'

declare module '@deepseek-ai/dsh-llm' {
  /**
   * The block `type` tag vocabulary (`packages/llm/llm/src/types.ts:99-105`).
   *
   * NARROWED: the real `ContentBlockMap` is merge-extensible and its block
   * interfaces live across `types.ts`. Only the members this plugin can produce
   * or read are spelled out — `text` is the one it writes, and the rest are here
   * so the union is not a single-member type that would accept anything.
   */
  export interface ContentBlockMap {
    'text': { type: 'text'; text: string }
    'reasoning': { type: 'reasoning'; text: string }
    'image': { type: 'image'; mediaType: string; data: string }
    'tool-call': { type: 'tool-call'; id: string; name: string; arguments: string }
    'tool-result': { type: 'tool-result'; toolCallId: string; content: ContentBlock[]; isError?: boolean }
  }

  /** Any known content block (`packages/llm/llm/src/types.ts:110`). Copied verbatim. */
  export type ContentBlock = ContentBlockMap[keyof ContentBlockMap]

  /**
   * Where a message came from (`packages/llm/llm/src/message.ts:96-105`).
   *
   * NARROWED at `plugin`, `model` and `tool`: the real members are `ContextFormed`,
   * `ModelMessageSource` and `ToolMessageSource`, none of which this plugin
   * produces or reads. `user` is verbatim, because the projection that decides
   * between a steering bubble and a context row is exactly
   * `message.source.kind === 'user'` (`packages/host/apiproxy/src/api-proxy.ts:1313`).
   */
  export interface MessageSourceMap {
    user: { kind: 'user' }
    plugin: { kind: 'plugin'; plugin: string; [key: string]: unknown }
    model: { kind: 'model'; provider: string; model: string; [key: string]: unknown }
    tool: { kind: 'tool'; callId: string; [key: string]: unknown }
  }

  /** Any known message source (`packages/llm/llm/src/message.ts:126`). Copied verbatim. */
  export type MessageSource = MessageSourceMap[keyof MessageSourceMap]

  /**
   * One immutable message (`packages/llm/llm/src/message.ts:128-138`).
   *
   * NARROWED at `id`: the real field is the branded `MessageId`, which lives in
   * `@deepseek-ai/dsh-llm/brand` and is a plain string at runtime. `Session.append`
   * accepts any non-empty string there
   * (`packages/core/session/src/index.ts:310-314`), which is the contract this
   * declaration has to satisfy.
   */
  export interface Message {
    /** Stable identity preserved across every representation boundary. */
    readonly id: string
    /** Provider-neutral conversation role. */
    readonly role: 'system' | 'user' | 'assistant'
    /** Exact model-facing blocks. */
    readonly content: ContentBlock[]
    /** Required source fields supplied by the producer. */
    readonly source: MessageSource
  }

  /** A user-role specialization of the one shared message representation (`message.ts:141-143`). */
  export interface UserMessage extends Message {
    readonly role: 'user'
  }
}

declare module '@deepseek-ai/dsh-session' {
  /** Re-exported by `dsh-session`, which is where `dsh-agent` takes it from (`runtime-types.ts:11`). */
  export interface UserMessage {
    readonly id: string
    readonly role: 'user'
    readonly content: import('@deepseek-ai/dsh-llm').ContentBlock[]
    readonly source: import('@deepseek-ai/dsh-llm').MessageSource
  }

  /**
   * The session a disposed event names (`packages/core/session/src/types.ts:69`).
   *
   * NARROWED to `id`, the one field this plugin reads to drop a disposed
   * session's pending refs. The real `id` is the branded `SessionId`; the
   * narrowing to `string` matches how this file declares `Message.id` and is
   * sound because the branded type IS a string at runtime.
   */
  export interface Session {
    readonly id: string
  }
}

declare module '@deepseek-ai/dsh-agent' {
  /**
   * Whether and with which messages the loop enters a proposed step
   * (`packages/core/agent/src/runtime-types.ts:52-55`). Copied verbatim.
   */
  export type PreStepDecision =
    | { kind: 'reject' }
    | { kind: 'enter'; messages: import('@deepseek-ai/dsh-session').UserMessage[] }
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Reject a proposed step or replace the messages that enter it. Calling
     * `next()` preserves the current messages.
     * @param payload.agent - the agent proposing the step.
     * @param payload.messages - messages removed from the inbox for this step.
     * @param payload.turn - the turn that will own the step.
     * @param payload.step - the step proposed by the loop.
     * @param payload.signal - the current turn's cancellation signal.
     * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
     * @mode waterfall
     *
     * NARROWED at `this`, and at the payload's `agent`: the real signature is
     * `this: Scoped<Agent>` and the payload carries the full `Agent`
     * (`runtime-types.ts:231`). This plugin reads one field of it —
     * `agent.session.id`, the session whose refs are being claimed — so the
     * payload declares only that path. Under-promising the payload cannot mask a
     * call-site error: every field read here is present in the real `Agent`.
     *
     * `messages`, `turn` and `step` are declared because they are part of the
     * real payload and a handler may read them; this one does not, which is why
     * the unused parameters are omitted at the call site rather than faked.
     */
    'agent/pre-step'(
      this: unknown,
      payload: {
        agent: { readonly session: { readonly id: string } }
        messages: import('@deepseek-ai/dsh-session').UserMessage[]
        turn: number
        step: number
        signal: AbortSignal
      },
      next: () => Promise<import('@deepseek-ai/dsh-agent').PreStepDecision>,
    ): Promise<import('@deepseek-ai/dsh-agent').PreStepDecision>

    /**
     * An agent left the registry and its session is being disposed
     * (`packages/core/session/src/index.ts:64`). Copied; `this` narrowed for the
     * same reason as `agent/pre-step` above.
     * @mode emit
     */
    'session/disposed'(this: unknown, session: import('@deepseek-ai/dsh-session').Session): void
  }
}
