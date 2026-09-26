/**
 * Read-modify-write for one model row's image-input declaration.
 *
 * Rows are structurally open: a field this plugin does not edit — one a future
 * schema adds, or one hand-written in the settings document — must survive being
 * touched here. So the operation clones the row and changes only `input`.
 */
/** Whether the row declares image input. */
export function hasVision(row) {
    return Array.isArray(row.input) && row.input.includes('image');
}
/**
 * Set or clear the image modality on one row.
 * @param models - the provider's model rows.
 * @param modelId - the row to change.
 * @param on - true writes `["text","image"]`, false removes the `input` key.
 * @returns a new array; the input is never mutated.
 */
export function setVision(models, modelId, on) {
    return models.map(row => {
        if (row.id !== modelId)
            return row;
        const next = { ...row };
        if (on) {
            next.input = ['text', 'image'];
        }
        else {
            delete next.input;
        }
        return next;
    });
}
