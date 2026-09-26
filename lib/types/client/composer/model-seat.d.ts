import { type ReasoningInfo } from '../effort.js';
export interface ModelSeatProps {
    locked: boolean;
    available: boolean;
    directory: {
        subscribe(fn: () => void): () => void;
        getSnapshot(): {
            current: {
                provider: string;
                model: string;
                reasoningEffort?: string;
            } | null;
            groups: readonly {
                id: string;
                name: string;
                models: readonly {
                    id: string;
                    name: string;
                    description?: string;
                    reasoning?: ReasoningInfo;
                }[];
            }[];
            failures: readonly {
                id: string;
                name: string;
                message: string;
            }[];
            status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error';
            error: string | null;
        };
    };
    load: () => void;
    select: (selection: {
        provider: string;
        model: string;
        reasoningEffort?: string;
    }) => Promise<boolean>;
    onError: (message: string) => void;
}
export declare function ModelSeat({ locked, available, directory, load, select, onError }: ModelSeatProps): import("react").JSX.Element | null;
