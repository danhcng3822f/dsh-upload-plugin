/**
 * Reasoning-effort menu construction.
 *
 * The vocabulary is the Host's, per model: `reasoning.efforts` is what the model
 * declares, so the menu can never offer a level the Host would reject. A Custom
 * row lets the user name a value the catalog does not list.
 */
/** Menu key of the free-text row. */
export const CUSTOM_EFFORT_KEY = 'custom';
/**
 * Build the effort menu for one model.
 * @param reasoning - the model's declared reasoning metadata; undefined = no effort control.
 * @param current - the session's chosen effort, when it has one.
 */
export function effortChoices(reasoning, current) {
    if (reasoning === undefined || reasoning.efforts.length === 0)
        return [];
    const effective = current ?? reasoning.defaultEffort;
    const rows = reasoning.efforts.map(effort => ({
        key: `effort:${effort.id}`,
        effort: effort.id,
        label: effort.name,
        ...effort.description === undefined ? {} : { description: effort.description },
        selected: effort.id === effective,
    }));
    rows.push({ key: CUSTOM_EFFORT_KEY, label: 'Custom…', selected: false, custom: true });
    return rows;
}
/** The label the trigger shows for the effective effort. */
export function effortLabel(reasoning, current) {
    if (reasoning === undefined)
        return undefined;
    const effective = current ?? reasoning.defaultEffort;
    if (effective === undefined)
        return undefined;
    return reasoning.efforts.find(e => e.id === effective)?.name ?? effective;
}
