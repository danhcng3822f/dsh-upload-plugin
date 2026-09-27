/**
 * The `llm-pi-ai` settings document, as this plugin reads and writes it.
 *
 * Wire shape, read out of the harness rather than assumed. The read is
 * `settings.describe({})`, whose `result.value` carries `writable` plus one
 * redacted view per namespace; the write is
 * `settings.mutate({ ns, ops, expectedRevision })` — the path-addressed edit the
 * shipped Models page itself uses for profile changes
 * (`ui-settings-models/src/client/CustomProviderCard.tsx:147`), typed in
 * `host/apiproxy/src/fetch/client.ts:152` and served at
 * `host/apiproxy/src/fetch/handler.ts:136`. There is no
 * `settings.read(ns)`/`settings.write(ns, value)` verb.
 *
 * The one op a caller may write is a whole provider's `models` array rather than
 * a path inside one row, because `applyPathOp`
 * (`settings/settings/src/index.ts:205`) treats any non-plain-object child as a
 * leaf: an index path such as `providers.<id>.models.0.input` walks into the
 * ARRAY, finds it is not a plain object, and replaces it with an object keyed by
 * `"0"`. `models` is the deepest addressable node.
 *
 * Two surfaces edit this document — the plugin's own settings page and the
 * composer's effort control — so the envelope, the namespace and the provider-row
 * read are stated here once instead of once per surface.
 */
import type { ModelRow } from '../vision-setting.js'

/** The settings namespace holding pi-ai provider profiles. */
export const SETTINGS_NAMESPACE = 'llm-pi-ai'

/**
 * Human text for a rejected wire call. A transport failure rejects with an
 * `Error`; a host or a runtime can reject with anything, and the caller still has
 * to say something. (Same helper as the shipped Models store.)
 * @param error - the rejection value.
 * @returns the message to show.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The `result` envelope every wire call answers with: a business rejection is a
 * resolved value, not a thrown error, so both branches are checked.
 */
export type WireResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } }

/** One settings namespace's redacted view, as `settings.describe` reports it. */
export interface NamespaceView {
  ns: string
  value: unknown
  revision: number
}

/** One path-addressed edit of `settings.mutate`. */
export type SettingsPathOp =
  | { op: 'set'; path: readonly string[]; value: unknown }
  | { op: 'unset'; path: readonly string[] }

/** `settings.describe` value: the writability flag plus every exposed namespace. */
export interface DescribeValue {
  writable: boolean
  namespaces: NamespaceView[]
}

/** `settings.mutate` value: the namespace's new view; only `result.ok` is read here. */
export interface MutateValue {
  ns: string
  revision: number
}

/** The settings face both editing surfaces call, as the connection publishes it. */
export interface SettingsApi {
  describe(payload: Record<string, never>): Promise<{ result: WireResult<DescribeValue> }>
  mutate(payload: {
    ns: string
    ops: readonly SettingsPathOp[]
    expectedRevision?: number
  }): Promise<{ result: WireResult<MutateValue> }>
}

/** One provider profile the document declares. */
export interface ProviderRow {
  id: string
  displayName: string | undefined
  models: ModelRow[]
}

/**
 * The document is hand-editable, so a model entry is only trusted to be an
 * object. This predicate deliberately does NOT claim an `id`: `ModelRow.id` is
 * required by the type and enforced by nothing at runtime, which is what
 * `isAddressable` in the settings page exists for.
 * @param row - one entry of a profile's `models` array.
 * @returns whether the entry is an object this plugin can read fields from.
 */
export function isRowObject(row: unknown): row is ModelRow {
  return typeof row === 'object' && row !== null && !Array.isArray(row)
}

/**
 * Read the provider dict out of a namespace value, keeping each profile's own
 * fields untouched: callers render `displayName` and `models` and pass the rows
 * on verbatim, so nothing here normalizes or drops a field.
 * @param value - the namespace's resolved value (`Config` of `llm-pi-ai`).
 * @returns one row per declared provider, or an empty list when none are.
 */
export function readProviders(value: unknown): ProviderRow[] {
  if (typeof value !== 'object' || value === null) return []
  const providers = (value as { providers?: unknown }).providers
  if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) return []
  return Object.entries(providers as Record<string, unknown>).map(([id, profile]) => {
    const fields = typeof profile === 'object' && profile !== null && !Array.isArray(profile)
      ? profile as { displayName?: unknown; models?: unknown }
      : {}
    return {
      id,
      displayName: typeof fields.displayName === 'string' ? fields.displayName : undefined,
      models: Array.isArray(fields.models) ? fields.models.filter(isRowObject) : [],
    }
  })
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
export function providerModels(value: unknown, providerId: string): ModelRow[] | undefined {
  return readProviders(value).find(provider => provider.id === providerId)?.models
}
