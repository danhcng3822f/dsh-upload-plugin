/** The settings namespace holding pi-ai provider profiles. */
export const SETTINGS_NAMESPACE = 'llm-pi-ai';
/**
 * Human text for a rejected wire call. A transport failure rejects with an
 * `Error`; a host or a runtime can reject with anything, and the caller still has
 * to say something. (Same helper as the shipped Models store.)
 * @param error - the rejection value.
 * @returns the message to show.
 */
export function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * The document is hand-editable, so a model entry is only trusted to be an
 * object. This predicate deliberately does NOT claim an `id`: `ModelRow.id` is
 * required by the type and enforced by nothing at runtime, which is what
 * `isAddressable` in the settings page exists for.
 * @param row - one entry of a profile's `models` array.
 * @returns whether the entry is an object this plugin can read fields from.
 */
export function isRowObject(row) {
    return typeof row === 'object' && row !== null && !Array.isArray(row);
}
/**
 * Read the provider dict out of a namespace value, keeping each profile's own
 * fields untouched: callers render `displayName` and `models` and pass the rows
 * on verbatim, so nothing here normalizes or drops a field.
 * @param value - the namespace's resolved value (`Config` of `llm-pi-ai`).
 * @returns one row per declared provider, or an empty list when none are.
 */
export function readProviders(value) {
    if (typeof value !== 'object' || value === null)
        return [];
    const providers = value.providers;
    if (typeof providers !== 'object' || providers === null || Array.isArray(providers))
        return [];
    return Object.entries(providers).map(([id, profile]) => {
        const fields = typeof profile === 'object' && profile !== null && !Array.isArray(profile)
            ? profile
            : {};
        return {
            id,
            displayName: typeof fields.displayName === 'string' ? fields.displayName : undefined,
            models: Array.isArray(fields.models) ? fields.models.filter(isRowObject) : [],
        };
    });
}
/**
 * One provider route's model rows, as the document declares them.
 *
 * Undefined and `[]` are different facts. `[]` is a route that declares no
 * models and therefore serves the installed catalog; undefined is a route the
 * document does not describe at all, which no edit from here can address.
 * @param value - the namespace's resolved value (`Config` of `llm-pi-ai`).
 * @param providerId - the provider route id (the `providers` dict key).
 * @returns the route's declared rows, or undefined when the document has no such route.
 */
export function providerModels(value, providerId) {
    return readProviders(value).find(provider => provider.id === providerId)?.models;
}
