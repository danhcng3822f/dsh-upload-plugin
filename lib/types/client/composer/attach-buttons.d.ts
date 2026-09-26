import type { InputActions, InputState } from '@deepseek-ai/dsh-client-ui-conversation';
import type { AttachmentStore } from '../attachment-store.js';
import { type ImageLimits, type NativeDraftImages } from '../intake.js';
import { mintChip } from '../reference.js';
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
    /** The conversation service face (declared in `../intake.js`); undefined when the service is not composed. */
    conversation: NativeDraftImages | undefined;
    /** The session standard kit's public input actions (the admission verb). */
    inputActions: InputActions;
    /** The session standard kit's projection reader (the intake limits' source). */
    useProjection: ProjectionReader;
}
export declare function AttachButtons({ sessionId, input, store, sessions, notify, conversation, inputActions, useProjection, }: AttachButtonsProps): import("react").JSX.Element;
