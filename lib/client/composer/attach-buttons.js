import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The composer's attach buttons.
 *
 * Registered into `conversation.input.right`, which renders immediately left of
 * the model seat. The two buttons take two different routes, deliberately:
 *
 * - **📷 photo** admits the picked files as the harness's own **native draft
 *   images**. The composer renders them, the composer's rail removes them, and at
 *   submit they become real image content blocks
 *   (`ui-conversation/src/client/service.ts:142-157`), so the model receives the
 *   image itself rather than an instruction telling it to go read a file.
 * - **📄 file** keeps the plugin's own path: upload into the workspace, record,
 *   chip. A non-image cannot be a draft image, so the instruction still has to
 *   reach the model another way — that is task R25-B2.
 */
import { useCallback, useRef, useState } from 'react';
import { Button, IconPaperclipOutline16 } from '@deepseek-ai/dsh-client-ui-primitives';
import { checkImageIntake, intakeRefusalText } from '../intake.js';
import { mintChip, nextChipCursor } from '../reference.js';
import { checkModelVision, pickFilesFromBrowser, uploadMultipleFiles } from '../uploader.js';
import { IconCameraOutline16 } from './icons.js';
/**
 * Icon-only form for these two controls.
 *
 * `Button size="sm"` is a 28px-tall pill with `padding: 0 10px`, sized for a
 * label. The shell's own icon button is a 28x28 square (its stylesheet names
 * `Icon_container 28x28` as the icon-only form), so the box is squared here
 * while the variant keeps supplying the token fill and its hover state.
 */
const ICON_BUTTON = { width: 28, padding: 0 };
/**
 * The photo picker's accept list. It is the same four types `imageMediaType`
 * validates against and the same list the `imageLimits` projection publishes, so
 * the picker's own filter cannot offer a type the intake would then refuse.
 */
const PHOTO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
export function AttachButtons({ sessionId, input, store, sessions, notify, conversation, inputActions, useProjection, }) {
    const [busy, setBusy] = useState(false);
    // The slot hands over a point-in-time snapshot; this ref is refreshed on every
    // render, so a click starts from the click-time draft and draftRev rather than
    // from the values captured when the component mounted. draftRev is a CAS token,
    // so a stale one makes the insert a silent no-op — `attachFile` carries the pair
    // forward from this starting point, because it cannot re-render mid-loop.
    const live = useRef(input);
    live.current = input;
    // The deployment's image-intake limits, read from the composer's own source.
    // Absent while no attachment service is composed; the pre-check then defers
    // entirely to the host's submit-time enforcement, exactly as the composer's does.
    const imageLimits = useProjection('imageLimits');
    /**
     * The 📷 path: pick, pre-check, admit natively.
     *
     * Nothing here uploads, mints a chip or writes a record — the harness owns the
     * image from the moment `addImages` accepts it. `createDraftImages` and
     * `addImages` are the two calls the composer's own wrapper composes
     * (`ui-conversation/src/client/apply.ts:308-323`), including its release on a
     * refused admission.
     */
    const attachPhoto = useCallback(async () => {
        // Started before the picker resolves, so the vision warning costs the user no
        // extra wait: a file dialog is slower than this request by orders of magnitude.
        const vision = checkModelVision(sessionId);
        const files = await pickFilesFromBrowser(PHOTO_ACCEPT, true);
        if (files.length === 0)
            return;
        if (conversation === undefined) {
            notify('error', 'Dịch vụ hội thoại chưa sẵn sàng để thêm ảnh');
            return;
        }
        // The batch is refused as a whole, before anything is registered, in the
        // composer's own order and against the composer's own thresholds.
        const current = conversation.draftImages(live.current.imageIds);
        const refusal = checkImageIntake(files, current.map(image => image.file), imageLimits);
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
        if (!inputActions.addImages(images.map(image => image.id))) {
            // A locked admission transaction refuses the batch — the facade answers
            // false only while it is adjudicating or submitting (`facade.ts:112`). The
            // descriptors would otherwise leak with no input state pointing at them,
            // which is why the composer's own wrapper releases them too.
            conversation.releaseDraftImages(images);
            notify('info', 'Chưa thêm được ảnh: hãy thử lại sau khi tin nhắn hiện tại gửi xong');
            return;
        }
        // A warning, never a block. It matters more now than it did while the plugin
        // uploaded the photo: the image rides the request as real image content, so a
        // model without vision makes the provider refuse the turn instead of ignoring
        // an instruction it could not follow.
        void vision.then((check) => {
            if (check.hasVision)
                return;
            notify('info', `⚠️ Model ${check.model ?? ''} chưa bật tính năng xem ảnh — ${check.reason ?? 'cần thêm input: [text, image] trong cấu hình model'}`);
        }, 
        // The check reports its own failures optimistically, so this arm exists only
        // so a throw from the notice channel cannot escape as an unhandled rejection.
        (err) => { console.warn('[dsh-upload-plugin] vision check:', err); });
    }, [sessionId, conversation, inputActions, imageLimits, notify]);
    /** The 📄 path, unchanged: upload into the workspace, record, chip. */
    const attachFile = useCallback(async () => {
        const files = await pickFilesFromBrowser('*/*', true);
        if (files.length === 0)
            return;
        setBusy(true);
        try {
            const responses = await uploadMultipleFiles(sessionId, files, false);
            // This loop runs synchronously, so React cannot re-render inside it and the
            // `live` ref still holds the revision the click started from. The cursor
            // models the machine's own transaction instead — `nextChipCursor` carries
            // the append and the revision bump, and is called only after a mint really
            // landed, because a refused mint leaves the draft untouched and the next
            // iteration must reuse the same pair.
            let cursor = { draft: live.current.draft, draftRev: live.current.draftRev };
            for (let i = 0; i < responses.length; i++) {
                const response = responses[i];
                if (!response.ok || response.relativePath === undefined)
                    continue;
                const token = store.nextToken(sessionId, response.filename ?? files[i].name);
                const record = {
                    token,
                    ref: store.refFor(sessionId, token),
                    relativePath: response.relativePath,
                    isPhoto: false,
                    size: files[i].size,
                    uploadedAt: Date.now(),
                };
                store.add(sessionId, record);
                if (!mintChip(sessions, sessionId, cursor, record)) {
                    notify('error', `Không chèn được tham chiếu cho ${token}`);
                    continue;
                }
                cursor = nextChipCursor(cursor);
            }
        }
        catch (err) {
            notify('error', `Lỗi tải tệp: ${err.message}`);
        }
        finally {
            setBusy(false);
        }
    }, [sessionId, store, sessions, notify]);
    return (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "toolbar", size: "sm", icon: _jsx(IconCameraOutline16, { size: 16 }), style: ICON_BUTTON, title: "Th\u00EAm \u1EA3nh", "aria-label": "Th\u00EAm \u1EA3nh", disabled: busy, onClick: () => { void attachPhoto(); } }), _jsx(Button, { variant: "toolbar", size: "sm", icon: _jsx(IconPaperclipOutline16, { size: 16 }), style: ICON_BUTTON, title: "Th\u00EAm t\u1EC7p", "aria-label": "Th\u00EAm t\u1EC7p", disabled: busy, onClick: () => { void attachFile(); } })] }));
}
