/**
 * The `result` envelope every wire call answers with: a business rejection is a
 * resolved value, not a thrown error, so both branches are checked.
 */
type WireResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
    };
};
/** One settings namespace's redacted view, as `settings.describe` reports it. */
interface NamespaceView {
    ns: string;
    value: unknown;
    revision: number;
}
/** One path-addressed edit of `settings.mutate`. */
type SettingsPathOp = {
    op: 'set';
    path: readonly string[];
    value: unknown;
} | {
    op: 'unset';
    path: readonly string[];
};
/** `settings.describe` value: the writability flag plus every exposed namespace. */
interface DescribeValue {
    writable: boolean;
    namespaces: NamespaceView[];
}
/** `settings.mutate` value: the namespace's new view; only `result.ok` is read here. */
interface MutateValue {
    ns: string;
    revision: number;
}
/** The subset of the connection's wire face this page calls. */
export interface VisionSectionApi {
    settings: {
        describe(payload: Record<string, never>): Promise<{
            result: WireResult<DescribeValue>;
        }>;
        mutate(payload: {
            ns: string;
            ops: readonly SettingsPathOp[];
            expectedRevision?: number;
        }): Promise<{
            result: WireResult<MutateValue>;
        }>;
    };
}
export interface VisionSectionProps {
    api: VisionSectionApi;
}
export declare function VisionSection({ api }: VisionSectionProps): import("react").JSX.Element;
export {};
