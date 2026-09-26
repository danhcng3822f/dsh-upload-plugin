import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation';
import type { AttachmentStore } from '../attachment-store.js';
import { mintChip } from '../reference.js';
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
}
export declare function AttachButtons({ sessionId, input, store, sessions, notify }: AttachButtonsProps): import("react").JSX.Element;
