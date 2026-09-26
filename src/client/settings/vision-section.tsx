/**
 * The plugin's own settings page: one toggle per model, controlling whether the
 * model declares image input.
 *
 * This states a declaration only — it never probes whether an upstream really
 * serves images. The shipped Models page owns provider topology; this page owns
 * exactly one field of one row and preserves everything else.
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
 * The one op writes a whole provider's `models` array rather than a path inside
 * one row, because `applyPathOp` (`settings/settings/src/index.ts:205`) treats
 * any non-plain-object child as a leaf: an index path such as
 * `providers.<id>.models.0.input` walks into the ARRAY, finds it is not a plain
 * object, and replaces it with an object keyed by `"0"`. `models` is the
 * deepest addressable node.
 */
import { useCallback, useEffect, useState } from 'react'
import { hasVision, setVision, type ModelRow } from '../vision-setting.js'

/** The settings namespace holding pi-ai provider profiles. */
const NAMESPACE = 'llm-pi-ai'

/**
 * Human text for a rejected wire call. A transport failure rejects with an
 * `Error`; a host or a runtime can reject with anything, and the page still has
 * to say something. (Same helper as the shipped Models store.)
 * @param error - the rejection value.
 * @returns the message to show.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The `result` envelope every wire call answers with: a business rejection is a
 * resolved value, not a thrown error, so both branches are checked.
 */
type WireResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } }

/** One settings namespace's redacted view, as `settings.describe` reports it. */
interface NamespaceView {
  ns: string
  value: unknown
  revision: number
}

/** One path-addressed edit of `settings.mutate`. */
type SettingsPathOp =
  | { op: 'set'; path: readonly string[]; value: unknown }
  | { op: 'unset'; path: readonly string[] }

/** `settings.describe` value: the writability flag plus every exposed namespace. */
interface DescribeValue {
  writable: boolean
  namespaces: NamespaceView[]
}

/** `settings.mutate` value: the namespace's new view; only `result.ok` is read here. */
interface MutateValue {
  ns: string
  revision: number
}

/** The subset of the connection's wire face this page calls. */
export interface VisionSectionApi {
  settings: {
    describe(payload: Record<string, never>): Promise<{ result: WireResult<DescribeValue> }>
    mutate(payload: {
      ns: string
      ops: readonly SettingsPathOp[]
      expectedRevision?: number
    }): Promise<{ result: WireResult<MutateValue> }>
  }
}

/** One provider profile the page renders. */
interface ProviderRow {
  id: string
  displayName: string | undefined
  models: ModelRow[]
}

/**
 * The document is hand-editable, so a model entry is only trusted to be an
 * object. This predicate deliberately does NOT claim an `id`: `ModelRow.id` is
 * required by the type and enforced by nothing at runtime, which is what
 * {@link isAddressable} exists for.
 * @param row - one entry of a profile's `models` array.
 * @returns whether the entry is an object this page can read fields from.
 */
function isRowObject(row: unknown): row is ModelRow {
  return typeof row === 'object' && row !== null && !Array.isArray(row)
}

/**
 * Whether a row can be toggled at all: `setVision` addresses a row by `id`, so a
 * row without a usable one cannot be named — and `setVision` would flip EVERY
 * id-less row at once, since `undefined !== undefined` is false.
 * @param row - one model entry.
 * @returns whether the row carries a usable id.
 */
function isAddressable(row: ModelRow): boolean {
  return typeof row.id === 'string' && row.id.length > 0
}

/**
 * Read the provider dict out of a namespace value, keeping each profile's own
 * fields untouched: the page renders `displayName` and `models` and passes the
 * rows to `setVision` verbatim, so nothing here normalizes or drops a field.
 * @param value - the namespace's resolved value (`Config` of `llm-pi-ai`).
 * @returns one row per declared provider, or an empty list when none are.
 */
function readProviders(value: unknown): ProviderRow[] {
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

export interface VisionSectionProps {
  api: VisionSectionApi
}

export function VisionSection({ api }: VisionSectionProps) {
  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [writable, setWritable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Nothing about the host's posture is known before the first describe lands,
  // so the page must not state one: `writable` defaults to false and the
  // provider list starts empty, and both would otherwise be reported as fact.
  const [loading, setLoading] = useState(true)

  /**
   * Refresh the whole page from the host. `api` is the connection's own stable
   * `IApiClient`, so this callback keeps its identity across renders and the
   * mount effect below runs once — a settings page must not re-read the
   * document on every render.
   */
  const load = useCallback(async () => {
    try {
      const response = await api.settings.describe({})
      if (!response.result.ok) {
        setError(response.result.error.message)
        return
      }
      const view = response.result.value.namespaces.find(candidate => candidate.ns === NAMESPACE)
      if (view === undefined) {
        setProviders([])
        setWritable(false)
        setError(`Không tìm thấy namespace "${NAMESPACE}"`)
        return
      }
      setProviders(readProviders(view.value))
      setWritable(response.result.value.writable)
      setError(null)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  /**
   * Flip one row's image declaration and write the provider's whole `models`
   * array back.
   *
   * The document is re-read here rather than reused from state: the array being
   * replaced has to be the one current NOW, or a stale snapshot would revert a
   * change made elsewhere. The same read supplies the revision, so a genuinely
   * concurrent write is answered `settings-conflict` instead of being
   * overwritten — the shipped Models card passes `expectedRevision` for exactly
   * this reason (`CustomProviderCard.tsx:150-153`).
   *
   * The write names one path, `providers.<id>.models`, so no other provider and
   * no other field of this profile is restated. A profile that resolves only
   * from a base layer does materialize its `models` array into the user layer;
   * that is the only node the op names, and the resolved result is unchanged.
   * @param providerId - the provider route id (the `providers` dict key).
   * @param modelId - the row to change, matched by `setVision`.
   * @param on - true declares `["text","image"]`, false removes the `input` key.
   */
  const toggle = useCallback(async (providerId: string, modelId: string, on: boolean) => {
    setBusy(true)
    try {
      const described = await api.settings.describe({})
      if (!described.result.ok) {
        setError(described.result.error.message)
        return
      }
      const view = described.result.value.namespaces.find(candidate => candidate.ns === NAMESPACE)
      const provider = view === undefined
        ? undefined
        : readProviders(view.value).find(row => row.id === providerId)
      if (view === undefined || provider === undefined) {
        setError(`Không tìm thấy provider "${providerId}" trong "${NAMESPACE}"`)
        return
      }
      const response = await api.settings.mutate({
        ns: NAMESPACE,
        ops: [{
          op: 'set',
          path: ['providers', providerId, 'models'],
          value: setVision(provider.models, modelId, on),
        }],
        expectedRevision: view.revision,
      })
      if (!response.result.ok) {
        setError(response.result.error.code === 'settings-conflict'
          ? 'Cấu hình vừa bị thay đổi ở nơi khác. Thử lại.'
          : response.result.error.message)
        return
      }
      await load()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }, [api, load])

  if (error !== null) {
    return (
      <div>
        <p>Không đọc được cấu hình model: {error}</p>
        <button type="button" onClick={() => { void load() }}>Thử lại</button>
      </div>
    )
  }

  const total = providers.reduce((sum, provider) => sum + provider.models.length, 0)
  // A route that declares no `models` serves the installed catalog and has no
  // row this page can state anything about, so it draws no section at all
  // rather than an empty heading.
  const declared = providers.filter(provider => provider.models.length > 0)

  return (
    <div>
      <p>Bật/tắt khả năng đọc ảnh cho từng model. Bật sẽ khai báo <code>input: [&quot;text&quot;,&quot;image&quot;]</code>.</p>
      {loading && <p>Đang tải…</p>}
      {!loading && !writable && <p>Cấu hình hiện chỉ cho đọc nên không lưu được thay đổi.</p>}
      {!loading && total === 0 && <p>Chưa có provider nào khai báo model trong <code>{NAMESPACE}</code>.</p>}
      {declared.map(provider => {
        const rows = provider.models.filter(isAddressable)
        const skipped = provider.models.length - rows.length
        return (
          <section key={provider.id}>
            <h3>{provider.displayName ?? provider.id}</h3>
            {rows.map((model, index) => (
              // The key pairs the row's position with its id: `setVision` flips
              // every row whose id matches, so a malformed document may hold
              // duplicate ids and the position is what stays unique.
              <label key={`${model.id}#${String(index)}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={hasVision(model)}
                  disabled={busy || !writable}
                  onChange={event => { void toggle(provider.id, model.id, event.target.checked) }}
                />
                <span>{model.name ?? model.id}</span>
              </label>
            ))}
            {skipped > 0 && <p>{skipped} model thiếu id nên bỏ qua.</p>}
          </section>
        )
      })}
    </div>
  )
}
