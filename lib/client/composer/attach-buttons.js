import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The composer's attach buttons.
 *
 * Registered into `conversation.input.right`, which renders immediately left of
 * the model seat. A successful upload is turned into a draft chip; the
 * instruction text is produced later, by the reference codec at send time.
 */
import { useCallback, useRef, useState } from 'react';
import { Button, IconPaperclipOutline16 } from '@deepseek-ai/dsh-client-ui-primitives';
import { mintChip, nextChipCursor } from '../reference.js';
import { pickFilesFromBrowser, uploadMultipleFiles } from '../uploader.js';
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
export function AttachButtons({ sessionId, input, store, sessions, notify }) {
    const [busy, setBusy] = useState(false);
    // The slot hands over a point-in-time snapshot; this ref is refreshed on every
    // render, so a click starts from the click-time draft and draftRev rather than
    // from the values captured when the component mounted. draftRev is a CAS token,
    // so a stale one makes the insert a silent no-op — `attach` carries the pair
    // forward from this starting point, because it cannot re-render mid-loop.
    const live = useRef(input);
    live.current = input;
    const attach = useCallback(async (isPhoto) => {
        const accept = isPhoto ? 'image/png,image/jpeg,image/webp,image/gif' : '*/*';
        const files = await pickFilesFromBrowser(accept, true);
        if (files.length === 0)
            return;
        setBusy(true);
        try {
            const responses = await uploadMultipleFiles(sessionId, files, isPhoto);
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
                    isPhoto,
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
    return (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "toolbar", size: "sm", icon: _jsx(IconCameraOutline16, { size: 16 }), style: ICON_BUTTON, title: "Th\u00EAm \u1EA3nh", "aria-label": "Th\u00EAm \u1EA3nh", disabled: busy, onClick: () => { void attach(true); } }), _jsx(Button, { variant: "toolbar", size: "sm", icon: _jsx(IconPaperclipOutline16, { size: 16 }), style: ICON_BUTTON, title: "Th\u00EAm t\u1EC7p", "aria-label": "Th\u00EAm t\u1EC7p", disabled: busy, onClick: () => { void attach(false); } })] }));
}
