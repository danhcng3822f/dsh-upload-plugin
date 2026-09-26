/**
 * Reasoning-effort menu construction.
 *
 * The vocabulary is the Host's, per model: `reasoning.efforts` is what the model
 * declares, so the menu can never offer a level the Host would reject. A Custom
 * row lets the user name a value the catalog does not list.
 */
/** Menu key of the free-text row. */
export declare const CUSTOM_EFFORT_KEY = "custom";
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
