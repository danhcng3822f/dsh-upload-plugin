/**
 * Reasoning-effort menu construction, and the vocabulary a Custom value is
 * checked against.
 *
 * The vocabulary is the Host's, per model: `reasoning.efforts` is what the model
 * declares, so the menu can never offer a level the Host would reject. A Custom
 * row lets the user name a value the catalog does not list — and because the
 * model's declaration IS that catalog, naming one means extending the
 * declaration, which is what {@link THINKING_LEVELS} bounds.
 */
/** Menu key of the free-text row. */
export const CUSTOM_EFFORT_KEY = 'custom';
/**
 * pi-ai's canonical thinking levels, in pi-ai's escalation order — the ONLY keys
 * a model's `reasoningEfforts` may declare.
 *
 * Copied from the harness's own drift gate (`llm-pi-ai/src/catalog.ts:69-77`),
 * which the profile schema validates the declaration's keys against
 * (`llm-pi-ai/src/config.ts:203-206`). The Host publishes a model's *declared*
 * levels but never this list, so a typed Custom value has to be checked against
 * a copy held here — the same posture `platform-modules.d.ts` takes for every
 * other harness contract this plugin cannot import. A pi-ai upgrade that changes
 * the set makes this copy stale; the notice the user sees is generated from it
 * rather than restated, so the two cannot disagree with each other.
 */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
/**
 * Whether a typed value names a level the declaration schema accepts.
 *
 * A key outside these seven is rejected at the schema, so an arbitrary string —
 * a token budget, a provider-specific spelling — cannot be declared at all. It
 * has to be refused where it is typed instead of accepted and refused later.
 * @param value - the trimmed text the user typed into the Custom row.
 * @returns whether the value is one of the seven level names.
 */
export function isThinkingLevel(value) {
    return THINKING_LEVELS.includes(value);
}
/** The accepted levels, spelled for a notice. */
export const THINKING_LEVEL_NAMES = THINKING_LEVELS.join(', ');
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
