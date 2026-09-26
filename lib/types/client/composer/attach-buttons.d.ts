import type { AttachmentStore } from '../attachment-store.js';
import { mintChip } from '../reference.js';
/** The `InputZone` owner share this slot delivers (point-in-time snapshots). */
export interface AttachButtonsProps {
    sessionId: string;
    input: {
        draft: string;
        draftRev: number;
    };
    store: AttachmentStore;
    sessions: Parameters<typeof mintChip>[0];
    notify: (level: 'info' | 'error', text: string) => void;
}
export declare function AttachButtons({ sessionId, input, store, sessions, notify }: AttachButtonsProps): import("react").JSX.Element;
