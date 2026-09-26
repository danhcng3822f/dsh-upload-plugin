/**
 * The native image-intake pre-check, and the copy for its refusals.
 *
 * The 📷 button admits photos as **native draft images** instead of uploading
 * them into the plugin's own store. The composer's own intake wrapper is not
 * reachable from a slot entry — it is the `conversation.composer.bar` entry's
 * inject face (`ui-conversation/src/client/apply.ts:308-323`), and the
 * `intakeImages` callback that consumes it is private to `InputBar`
 * (`ui-conversation/src/client/skeleton/InputBar.tsx:440-465`). A plugin
 * registering into `conversation.input.right` therefore composes the two calls
 * that wrapper composes — `ConversationController.createDraftImages`
 * (`service.ts:164-172`) and `InputActions.addImages` (`input/contract.ts:37`) —
 * and reproduces the wrapper's checks here, in the wrapper's own order and
 * against the wrapper's own thresholds.
 *
 * Nothing in this module touches the DOM, React or DSH, so the arithmetic that
 * decides whether a batch may be admitted is node-testable.
 */
import { formatFileSize } from './uploader.js';
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
export function checkImageIntake(files, current, limits) {
    if (files.length === 0 || limits === undefined)
        return null;
    if (files.some(file => !limits.mediaTypes.includes(file.type))) {
        return { reason: 'unsupportedType' };
    }
    if (current.length + files.length > limits.maxImagesPerMessage) {
        return { reason: 'tooMany', limit: limits.maxImagesPerMessage };
    }
    if (files.some(file => file.size > limits.maxImageBytes)) {
        return { reason: 'fileTooLarge', limit: limits.maxImageBytes };
    }
    const total = current.reduce((sum, file) => sum + file.size, 0)
        + files.reduce((sum, file) => sum + file.size, 0);
    if (total > limits.maxMessageImageBytes) {
        return { reason: 'totalTooLarge', limit: limits.maxMessageImageBytes };
    }
    return null;
}
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
export function intakeRefusalText(refusal) {
    switch (refusal.reason) {
        case 'unsupportedType':
            return 'Chỉ hỗ trợ ảnh PNG, JPG, WebP, GIF';
        case 'tooMany':
            return `Một tin nhắn chỉ được thêm tối đa ${refusal.limit} ảnh`;
        case 'fileTooLarge':
            return `Mỗi ảnh phải nhỏ hơn ${formatFileSize(refusal.limit)}`;
        case 'totalTooLarge':
            return `Tổng dung lượng ảnh vượt quá ${formatFileSize(refusal.limit)}, hãy bỏ bớt ảnh`;
    }
}
