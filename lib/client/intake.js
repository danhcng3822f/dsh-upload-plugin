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
import { formatFileSize } from './uploader.js';
/**
 * The photo picker's accept list. It is the same four types `imageMediaType`
 * validates against (`ui-conversation/src/client/service.ts:326-336`) and the
 * same list the `imageLimits` projection publishes, so the picker's own filter
 * cannot offer a type the intake would then refuse. One definition, because both
 * entry points open the same picker.
 */
export const PHOTO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
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
export function intakePhotos(request) {
    const { files, faces, limits, vision, notify } = request;
    const conversation = faces.conversation;
    if (conversation === undefined) {
        notify('error', 'Dịch vụ hội thoại chưa sẵn sàng để thêm ảnh');
        return;
    }
    const draft = faces.draft;
    if (draft === undefined) {
        notify('error', 'Phiên hiện tại chưa sẵn sàng để thêm ảnh');
        return;
    }
    // `current` is the draft's live native images, so the count and the byte total
    // are projections over the whole message rather than over the picked batch.
    const current = conversation.draftImages(draft.imageIds);
    const refusal = checkImageIntake(files, current.map(image => image.file), limits);
    if (refusal !== null) {
        notify('info', intakeRefusalText(refusal));
        return;
    }
    let images;
    try {
        images = conversation.createDraftImages(files);
    }
    catch (err) {
        // `createDraftImages` is the authoritative MIME gate. Its own error type is
        // matched by name: the class is a runtime export of a package this bundle
        // cannot import (not a platform module), so `instanceof` is not available.
        const error = err instanceof Error ? err : new Error(String(err));
        notify('info', error.name === 'UnsupportedImageMediaTypeError'
            ? intakeRefusalText({ reason: 'unsupportedType' })
            : `Không thêm được ảnh: ${error.message}`);
        return;
    }
    if (!draft.addImages(images.map(image => image.id))) {
        // A locked admission transaction refuses the batch — the facade answers false
        // only while it is adjudicating or submitting (`facade.ts:112`). The
        // descriptors would otherwise leak with no input state pointing at them.
        conversation.releaseDraftImages(images);
        notify('info', 'Chưa thêm được ảnh: hãy thử lại sau khi tin nhắn hiện tại gửi xong');
        return;
    }
    // A warning, never a block, and only once a batch really landed. It matters
    // more now than it did while the plugin uploaded the photo: the image rides the
    // request as real image content, so a model without vision makes the provider
    // refuse the turn instead of ignoring an instruction it could not follow.
    void vision.then((check) => {
        if (check.hasVision)
            return;
        notify('info', `⚠️ Model ${check.model ?? ''} chưa bật tính năng xem ảnh — ${check.reason ?? 'cần thêm input: [text, image] trong cấu hình model'}`);
    }, 
    // The check reports its own failures optimistically, so this arm exists only
    // so a throw from the notice channel cannot escape as an unhandled rejection.
    (err) => { console.warn('[dsh-upload-plugin] vision check:', err); });
}
