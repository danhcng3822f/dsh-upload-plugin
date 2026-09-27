/**
 * The context injection: how a live attachment reaches the model without a word
 * of it landing in the text of the user's own message.
 *
 * ## Why this exists
 *
 * Until R25-B2 the reference codec's `serialize` returned the "read this file"
 * instruction and the composer spliced it into the prompt
 * (`ui-conversation/src/client/input/facade.ts:436`), so the user's chat bubble
 * contained a sentence they never typed. The user rejected that. The harness's
 * own way to put text in front of the model is a context injection — a durable
 * `user/message` whose source kind is not `'user'` — which the client renders as
 * a `Context injection` row rather than as the user's own words
 * (`apiproxy/src/api-proxy.ts:1313` projects the placement, and
 * `ui-conversation/src/client/conversation-nodes/message.ts:42-51` turns it into
 * the `kind: 'context'` node that `ContextInjectionRow` draws).
 *
 * ## The seam
 *
 * `agent/pre-step` (`packages/core/agent/src/runtime-types.ts:231`), a waterfall
 * that runs once per proposed step. Returning `{ kind: 'enter', messages }`
 * REPLACES the step's message list, so appending the context message there puts
 * it in the turn's context by construction — no ordering to manage and no race
 * with the inbox. `tool-skill` is the reference implementation
 * (`packages/skill/tool-skill/src/index.ts:213-251`): it awaits `next()` first
 * and passes a `reject` decision straight through, which is what this handler
 * does too.
 *
 * ## Why not the file's instruction in the codec
 *
 * `src/client/reference.ts`'s codec now returns a single zero-width space. It has
 * to return something non-empty: the harness silently refuses a message with no
 * text and no images (`ui-conversation/src/client/input/hub.ts:155` —
 * `if (text === '' && imageIds.length === 0) return`, which sends nothing, logs
 * nothing and does not even clear the draft), and the chip's serialization is the
 * only thing keeping a file-only send alive.
 *
 * @module dsh-upload-plugin/host/context-injection
 */
import type { Context } from '@deepseek-ai/cordis';
import type { PendingAttachment } from '../types.js';
/**
 * The message source kind this plugin declares.
 *
 * It must not be `'user'`. That single fact is what makes the harness render the
 * injection as a context row instead of a steering bubble — the projection reads
 * the kind directly (`apiproxy/src/api-proxy.ts:1313`) — and it is also what
 * keeps `conversation-nodes/message.ts:42` from classifying the message as the
 * user's own input.
 */
export declare const VISION_ATTACHMENT_KIND = "vision-attachment";
/**
 * The model-facing text of one injection: every live attachment's instruction,
 * one per line, inside the harness's own reminder wrapper.
 *
 * The wrapper is not decoration. `tool-skill` frames its catalog the same way
 * (`tool-skill/src/index.ts:258-268`), and it is what tells the model that the
 * following lines are context rather than something the user said — which is
 * exactly the distinction this whole change is about.
 *
 * The wording itself comes from `instructionFor` (`src/instruction.ts`), the ONE
 * definition both halves share, so the sentences the model reads cannot drift
 * from the ones this plugin used to splice into the message.
 * @param refs - the live attachments to point the model at, in draft order.
 * @returns the reminder block, or an empty string when there is nothing to say.
 */
export declare function renderInjectionText(refs: readonly PendingAttachment[]): string;
/**
 * The message shape this module builds, as `Session.append` validates it.
 *
 * Structurally the harness's `UserMessage` (`packages/llm/llm/src/message.ts:141`)
 * with `id` narrowed to a plain string — the real field is the branded
 * `MessageId`, which is a string at runtime. It is declared here rather than
 * imported because `@deepseek-ai/dsh-session` is not resolvable from this plugin;
 * see the policy block in `src/host/llm-modules.d.ts`.
 *
 * The fields are exactly the ones the session's own validator requires of a
 * `user/message` event (`packages/core/session/src/index.ts:301-328`): a
 * non-empty string id, `role: 'user'`, a source whose `kind` is a non-empty
 * string, and array content.
 */
export interface VisionContextMessage {
    readonly id: string;
    readonly role: 'user';
    readonly content: [{
        type: 'text';
        text: string;
    }];
    readonly source: {
        readonly kind: typeof VISION_ATTACHMENT_KIND;
        readonly refs: readonly string[];
    };
}
/**
 * Build the identified user-role message the step receives.
 *
 * This is `createUserMessage` reproduced rather than called, and the reason is
 * runtime, not taste: `@deepseek-ai/dsh-llm` is not resolvable from this plugin's
 * install location, so importing it would throw `ERR_MODULE_NOT_FOUND` at mount.
 * See the policy block in `src/host/llm-modules.d.ts`, which also records why the
 * deep freeze `createUserMessage` applies is redundant here (`Session.append`
 * freezes the whole event it publishes,
 * `packages/core/session/src/index.ts:627`).
 *
 * `refs` rides the source so the durable log says WHICH attachments produced the
 * injection — the row is then self-describing rather than a bare block of prose,
 * and a consumer can tell two injections apart without parsing the text.
 * @param refs - the live attachments this message is about.
 * @returns a user message carrying the reminder text.
 */
export declare function contextMessage(refs: readonly PendingAttachment[]): VisionContextMessage;
/**
 * Register the pre-step injection on the plugin's context.
 *
 * ## Which step may claim
 *
 * `pre-step` runs once per STEP, and a turn that calls tools proposes several
 * (`core/agent-loop/src/agent.ts:263-266`), so a step is not automatically the
 * user's. The payload's `messages` is the batch the loop just removed from the
 * inbox *for this step* (`core/agent/src/runtime-types.ts:224`), and its shape
 * is pinned by the loop's own tests (`core/agent-loop/tests/interception.spec.ts:103-106`):
 *
 * - the step that opens a turn claims the queued prompt — `{ turn: 1, step: 1, messages: 1 }`;
 * - every continuation step of that turn claims nothing — `{ turn: 1, step: 2, messages: 0 }`;
 * - a `steer` lands in `next-step` (`agent.ts:126-128`) and is claimed by the
 *   next continuation step, alongside whatever was `inject`ed with it.
 *
 * So the rule is: **claim only on a step that carries the user's own input** —
 * a message whose `source.kind` is `'user'` (the kind the composer and the
 * steering path both mint: `acp/src/index.ts:385`). Every other step leaves the
 * set alone for the step that does carry it.
 *
 * ## Why not `decision.messages`
 *
 * The check reads the PAYLOAD's `messages`, not the decision's. The decision is
 * the waterfall's OUTPUT: the loop's default appends a runtime-context snapshot
 * to it (`agent.ts:236-239`) and any downstream listener may append its own
 * (`time-context` does so on every step, `tool-skill` appends a catalog), so the
 * last element of `decision.messages` is frequently another plugin's message
 * rather than the user's. The payload's list is the claimed batch and nothing
 * else, which is also how the harness's own readers use it
 * (`goal-round-driver/src/index.ts:350`, `tool-skill/src/index.ts:183`).
 *
 * ## Ordering
 *
 * `next()` runs first so a `reject` is passed through untouched and a rejected
 * step spends nothing; `signal.throwIfAborted()` sits between `next()` and the
 * mutation for the same reason it does in `tool-skill` and `time-context` — a
 * cancelled turn must not gain a message.
 * @param ctx - the plugin's context.
 */
export declare function registerContextInjection(ctx: Context): void;
/**
 * The one field the claim rule reads off a message: where it came from.
 *
 * Structural rather than the harness's `UserMessage`, for the reason
 * `src/host/llm-modules.d.ts` records: the harness packages are not installed
 * beside this plugin, so their specifiers do not resolve from a real module. The
 * declared payload type is the harness's own `UserMessage`
 * (`llm-modules.d.ts`, `agent/pre-step`), whose `source` is a union that every
 * member of which carries a string `kind` — so this narrowing accepts exactly
 * the values the real field can hold.
 */
interface SourcedMessage {
    readonly source: {
        readonly kind: string;
    };
}
/**
 * Whether the batch claimed for one step holds the user's own input.
 *
 * `'user'` is the source kind of everything the user typed — a queued prompt and
 * a mid-turn `steer` alike — and of nothing else. The plugin's own injection
 * deliberately uses a different kind (`VISION_ATTACHMENT_KIND`), so a step
 * carrying only context injections can never claim, and neither can a
 * goal-round or subagent message.
 * @param messages - the step's claimed batch, as `agent/pre-step` reports it.
 * @returns whether this step is one the user's input enters on.
 */
export declare function carriesUserInput(messages: readonly SourcedMessage[]): boolean;
export {};
