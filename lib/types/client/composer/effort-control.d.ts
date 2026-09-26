import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client';
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
export interface EffortControlProps {
    available: boolean;
    /**
     * The session's shared directory store, as `ModelSelectInjected` publishes it
     * (`ui-model-selection/src/client/slots.ts:16`) — the real state type, not a
     * hand-stated subset, so a field this component reads cannot be dropped from
     * the contract unnoticed.
     */
    directory: SnapshotStore<ModelDirectoryState>;
    load: () => void;
    select: (selection: ModelSelection) => Promise<boolean>;
    onError: (message: string) => void;
}
export declare function EffortControl({ available, directory, load, select, onError }: EffortControlProps): import("react").JSX.Element | null;
