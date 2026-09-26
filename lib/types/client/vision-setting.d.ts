/**
 * Read-modify-write for one model row's image-input declaration.
 *
 * Rows are structurally open: a field this plugin does not edit — one a future
 * schema adds, or one hand-written in the settings document — must survive being
 * touched here. So the operation clones the row and changes only `input`.
 */
/** One model row of a provider profile, with unknown fields preserved. */
export interface ModelRow {
    id: string;
    name?: string;
    input?: readonly string[];
    [field: string]: unknown;
}
/** Whether the row declares image input. */
export declare function hasVision(row: ModelRow): boolean;
/**
 * Set or clear the image modality on one row.
 * @param models - the provider's model rows.
 * @param modelId - the row to change.
 * @param on - true writes `["text","image"]`, false removes the `input` key.
 * @returns a new array; the input is never mutated.
 */
export declare function setVision(models: readonly ModelRow[], modelId: string, on: boolean): ModelRow[];
