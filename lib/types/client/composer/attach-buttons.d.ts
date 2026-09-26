import type { ComposerAttachment, DraftAttachmentId, InputActions, InputState } from '@deepseek-ai/dsh-client-ui-conversation';
import type { AttachmentStore } from '../attachment-store.js';
import { type ImageLimits } from '../intake.js';
import { mintChip } from '../reference.js';
/**
 * The `ConversationController` methods the native photo path composes.
 *
 * Reached as `ctx.get('conversation')` — the service the composer itself
 * resolves the same way (`ui-conversation/src/client/apply.ts:101-102` casts that
 * exact read to `ConversationController`). The service's published
 * `IConversation` face (`service.ts:28-59`) carries only the scope-addressed
 * verbs, so these three members are declared structurally here rather than
 * imported: the plugin reaches the service at runtime and cannot import its
 * package (`@deepseek-ai/dsh-client-ui-conversation` is not a platform module —
 * see `platform-modules.d.ts` and `build-client.mjs`).
 */
export interface NativeDraftImages {
    /** Validate MIME and register runtime-only draft images; throws `UnsupportedImageMediaTypeError`. */
    createDraftImages(files: readonly File[]): readonly ComposerAttachment[];
    /** Resolve ordered input-state ids back to their live descriptors. */
    draftImages(ids: readonly DraftAttachmentId[]): readonly ComposerAttachment[];
    /** Drop descriptors whose admission was refused, revoking their preview URLs. */
    releaseDraftImages(attachments: readonly ComposerAttachment[]): void;
}
/**
 * The session standard kit's projection reader — the fifth framework hook seat
 * (`web-react/src/session-provider.tsx:96-114`), delivered to every session-scope
 * slot component (`scoped-slots.tsx:378`). Key-addressed, and `undefined` means
 * capability absent rather than a zero value. This plugin reads exactly one key:
 * `imageLimits`, the same source the composer's own pre-check reads
 * (`InputBar.tsx:91`).
 */
export interface ProjectionReader {
    (key: 'imageLimits'): ImageLimits | undefined;
}
/**
 * The `InputZone` owner share this slot delivers (point-in-time snapshots), as
 * the harness publishes it: `input` is the live `InputState`, not a hand-stated
 * subset (`ui-conversation/src/client/contract/slots.ts:274-277`).
 */
export interface AttachButtonsProps {
    sessionId: string;
    input: InputState;
    store: AttachmentStore;
    sessions: Parameters<typeof mintChip>[0];
    notify: (level: 'info' | 'error', text: string) => void;
    /** The conversation service face; undefined when the service is not composed. */
    conversation: NativeDraftImages | undefined;
    /** The session standard kit's public input actions (the admission verb). */
    inputActions: InputActions;
    /** The session standard kit's projection reader (the intake limits' source). */
    useProjection: ProjectionReader;
}
export declare function AttachButtons({ sessionId, input, store, sessions, notify, conversation, inputActions, useProjection, }: AttachButtonsProps): import("react").JSX.Element;
