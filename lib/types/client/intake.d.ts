/**
 * The native photo intake: the pre-check that decides whether a picked batch may
 * be admitted, the sequence that admits it, and the copy for every outcome.
 *
 * A photo is admitted as a **native draft image** instead of being uploaded into
 * the plugin's own store. The composer's own intake wrapper is not reachable from
 * a slot entry — it is the `conversation.composer.bar` entry's inject face
 * (`ui-conversation/src/client/apply.ts:308-323`), and the `intakeImages`
 * callback that consumes it is private to `InputBar`
 * (`ui-conversation/src/client/skeleton/InputBar.tsx:440-465`) — and the
 * `/photos` command is not a slot component at all, so it has neither the slot
 * props nor the `useProjection` hook. Both entry points therefore call
 * `intakePhotos` from here: one sequence, one set of thresholds, one set of
 * sentences, so the 📷 button and the command cannot drift apart.
 *
 * Nothing in this module touches the DOM, React or DSH: the faces it writes
 * through arrive as arguments, so the arithmetic that decides whether a batch may
 * be admitted *and* the sequence that admits it are both node-testable against
 * fakes.
 */
import type { ComposerAttachment, DraftAttachmentId } from '@deepseek-ai/dsh-client-ui-conversation';
import type { VisionCheckResponse } from '../types.js';
/**
 * The photo picker's accept list. It is the same four types `imageMediaType`
 * validates against (`ui-conversation/src/client/service.ts:326-336`) and the
 * same list the `imageLimits` projection publishes, so the picker's own filter
 * cannot offer a type the intake would then refuse. One definition, because both
 * entry points open the same picker.
 */
export declare const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
/**
 * The deployment's image-intake limits: the `imageLimits` session projection.
 *
 * `ImageAttachmentLimits` as the host publishes it
 * (`apiproxy/src/api/sessions.schema.ts:229-235`, view built at
 * `api-proxy.ts:1290` from `attachments.imageLimits`). The projection unit is
 * registered only while an attachment service is composed, so the whole value —
 * not merely a field of it — is absent in a deployment without one.
 */
export interface ImageLimits {
    /** Media types the deployment accepts; the same set `imageMediaType` validates against. */
    readonly mediaTypes: readonly string[];
    /** Cap on the images one message may carry. */
    readonly maxImagesPerMessage: number;
    /** Cap on one image's bytes. */
    readonly maxImageBytes: number;
    /** Cap on the summed bytes of one message's images. */
    readonly maxMessageImageBytes: number;
}
/** The two facts every check reads off a picked file (`File.type`, `File.size`). */
export interface IntakeFile {
    readonly type: string;
    readonly size: number;
}
/**
 * Why a batch was refused: the check that refused it, plus the threshold it
 * broke. The checks stay free of copy — `intakeRefusalText` renders it — so the
 * same refusal can be tested without asserting on user-facing strings.
 */
export type IntakeRefusal = 
/** A file the deployment's `mediaTypes` does not list. */
{
    readonly reason: 'unsupportedType';
}
/** The draft's images plus this batch would exceed `maxImagesPerMessage`. */
 | {
    readonly reason: 'tooMany';
    readonly limit: number;
}
/** At least one file exceeds `maxImageBytes`. */
 | {
    readonly reason: 'fileTooLarge';
    readonly limit: number;
}
/** The draft's images plus this batch would exceed `maxMessageImageBytes`. */
 | {
    readonly reason: 'totalTooLarge';
    readonly limit: number;
};
/**
 * The composer's own intake pre-check, reproduced (`InputBar.tsx:442-463`).
 *
 * Order is part of the contract, not an accident of the code: format precedes
 * every limit check, so a batch holding a non-image announces the format problem
 * rather than a count or size it could never pass anyway. `current` is the
 * draft's live images, because both remaining checks are projections over the
 * whole message rather than over the picked batch alone.
 *
 * An absent `limits` value is capability absence, not a zero limit: with no
 * attachment service composed there is nothing to check against, and the host
 * enforces the same limits at submit for callers that bypass the composer
 * (`InputBar.tsx:437-439`).
 * @param files - the batch the user just picked.
 * @param current - the draft's live native images.
 * @param limits - the projected limits, or undefined while no attachment service is composed.
 * @returns the refusal, or null when the whole batch may be admitted.
 */
export declare function checkImageIntake(files: readonly IntakeFile[], current: readonly IntakeFile[], limits: ImageLimits | undefined): IntakeRefusal | null;
/**
 * The user-facing copy for one refusal.
 *
 * Vietnamese, like the rest of this plugin's UI, and naming the limit that
 * refused the batch the way the harness's own strings do (`locales.ts:44-47`
 * names the count and the byte size). The harness's `conversation`-namespace
 * strings are not reachable here: `t` for that namespace is the composer-bar
 * entry's locale seat (`slots.ts:545`), and this entry registers without a
 * locale.
 * @param refusal - the check that refused the batch.
 * @returns the notice body.
 */
export declare function intakeRefusalText(refusal: IntakeRefusal): string;
/**
 * The `ConversationController` methods the native photo path composes.
 *
 * Reached as `ctx.get('conversation')` — the service the composer itself resolves
 * the same way (`ui-conversation/src/client/apply.ts:101-102` casts that exact
 * read to `ConversationController`). The service's published `IConversation` face
 * (`service.ts:28-59`) carries only the scope-addressed verbs, so these three
 * members are declared structurally here rather than imported: the plugin reaches
 * the service at runtime and cannot import its package
 * (`@deepseek-ai/dsh-client-ui-conversation` is not a platform module — see
 * `platform-modules.d.ts` and `build-client.mjs`).
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
 * The session's live draft admission, as each entry point reads it.
 *
 * The 📷 button reads the ids off the slot's own `InputState` snapshot and admits
 * through the standard kit's `InputActions`; the `/photos` command reads both off
 * the session's `SessionInput` facade
 * (`ui-conversation/src/client/input/contract.ts:33-59`, `addImages` at `:37`).
 * One shape, two sources — which is what lets both run one sequence.
 */
export interface DraftAdmission {
    /** The draft's native image ids as the caller last observed them (the pre-check's `current`). */
    readonly imageIds: readonly DraftAttachmentId[];
    /** Append ordered ids; false while the machine is adjudicating or submitting. */
    addImages(ids: readonly DraftAttachmentId[]): boolean;
}
/**
 * The faces one admission writes through. Each is absent in a different state,
 * and each absence has its own sentence.
 */
export interface NativeIntakeFaces {
    /** The conversation service; undefined while it is not composed. */
    readonly conversation: NativeDraftImages | undefined;
    /** The session's live draft; undefined while the session is not scoped. */
    readonly draft: DraftAdmission | undefined;
}
/** One picked batch, the faces to admit it through, and where to announce the outcome. */
export interface PhotoIntakeRequest {
    /** The batch the user just picked; a cancelled pick is the caller's own early return. */
    readonly files: readonly File[];
    /** The faces the sequence writes through. */
    readonly faces: NativeIntakeFaces;
    /**
     * The deployment's projected limits. The 📷 button reads them from the
     * composer's own `imageLimits` projection; the `/photos` command has no
     * `useProjection` seat — that hook exists only inside a slot component — so it
     * passes none, and the pre-check then defers to the host's submit-time
     * enforcement, which is the posture the composer documents for callers that
     * bypass it (`InputBar.tsx:437-439`).
     */
    readonly limits: ImageLimits | undefined;
    /** The capability check, already started so its latency hides behind the file dialog. */
    readonly vision: Promise<VisionCheckResponse>;
    /** The notice channel every outcome is announced on. */
    readonly notify: (level: 'info' | 'error', text: string) => void;
}
/**
 * The whole native intake of one picked batch: pre-check, register, admit, and
 * announce what the model can do with the result.
 *
 * This is the 📷 button's and the `/photos` command's single call, so the two
 * entry points cannot disagree about which batches are admitted, in what order
 * the checks run, or what the user is told when one is refused.
 *
 * The batch is refused as a whole, before anything is registered, in the
 * composer's own order and against the composer's own thresholds. A batch the
 * admission transaction refuses is released again, exactly as the composer's own
 * wrapper releases it (`apply.ts:311-313`), so a refused admission cannot leak
 * preview object URLs. Nothing is written into the draft text: the harness owns
 * the image from the moment `addImages` accepts it.
 * @param request - the batch, the faces, the limits, the capability check and the notice channel.
 */
export declare function intakePhotos(request: PhotoIntakeRequest): void;
