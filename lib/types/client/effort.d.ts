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
export declare const CUSTOM_EFFORT_KEY = "custom";
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
export declare const THINKING_LEVELS: readonly ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
/** One level a `reasoningEfforts` declaration may name. */
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
/**
 * Whether a typed value names a level the declaration schema accepts.
 *
 * A key outside these seven is rejected at the schema, so an arbitrary string —
 * a token budget, a provider-specific spelling — cannot be declared at all. It
 * has to be refused where it is typed instead of accepted and refused later.
 * @param value - the trimmed text the user typed into the Custom row.
 * @returns whether the value is one of the seven level names.
 */
export declare function isThinkingLevel(value: string): value is ThinkingLevel;
/** The accepted levels, spelled for a notice. */
export declare const THINKING_LEVEL_NAMES: string;
/** The `reasoning` share of a resolved model, as the directory publishes it. */
export interface ReasoningInfo {
    efforts: readonly {
        id: string;
        name: string;
        description?: string;
    }[];
    defaultEffort?: string;
}
/** One menu row. */
export interface EffortChoice {
    key: string;
    /** The value submitted as `reasoningEffort`; undefined on the Custom row. */
    effort?: string;
    label: string;
    description?: string;
    selected: boolean;
    /** True only on the Custom row, which opens a text input instead of submitting. */
    custom?: boolean;
}
/**
 * Build the effort menu for one model.
 * @param reasoning - the model's declared reasoning metadata; undefined = no effort control.
 * @param current - the session's chosen effort, when it has one.
 */
export declare function effortChoices(reasoning: ReasoningInfo | undefined, current: string | undefined): EffortChoice[];
/** The label the trigger shows for the effective effort. */
export declare function effortLabel(reasoning: ReasoningInfo | undefined, current: string | undefined): string | undefined;
