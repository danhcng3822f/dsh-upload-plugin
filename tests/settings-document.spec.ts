import { describe, it, expect } from 'vitest'
import {
  isRowObject,
  messageOf,
  providerModels,
  readProviders,
  SETTINGS_NAMESPACE,
} from '../src/client/settings/document.js'

/** The namespace value as `settings.describe` reports it, trimmed to what is read. */
const VALUE = {
  providers: {
    router9: {
      displayName: '9router',
      apiKeyEnv: 'ROUTER9_API_KEY',
      models: [
        { id: 'cx/gpt-5.6-luna', name: 'GPT 5.6 Luna', reasoningEfforts: { high: 'high' } },
        { id: 'xpiki/claude-opus-5', name: 'xpiki', input: ['text', 'image'] },
      ],
    },
    catalog: { displayName: 'Serves the installed catalog', models: [] },
    malformed: { displayName: 'Malformed', models: ['not a row', null, 7, { id: 'kept' }] },
  },
}

describe('SETTINGS_NAMESPACE', () => {
  it('is the pi-ai provider-profile namespace', () => {
    expect(SETTINGS_NAMESPACE).toBe('llm-pi-ai')
  })
})

describe('readProviders', () => {
  it('reads one row per declared provider, with its own fields', () => {
    const providers = readProviders(VALUE)
    expect(providers.map(provider => provider.id)).toEqual(['router9', 'catalog', 'malformed'])
    expect(providers[0].displayName).toBe('9router')
    expect(providers[0].models).toHaveLength(2)
  })

  it('returns nothing for a value that is not a namespace document', () => {
    expect(readProviders(undefined)).toEqual([])
    expect(readProviders(null)).toEqual([])
    expect(readProviders('llm-pi-ai')).toEqual([])
    expect(readProviders({ providers: [] })).toEqual([])
  })

  it('drops entries that are not objects rather than trusting the document', () => {
    // The document is hand-editable, so a `models` list can hold anything.
    expect(readProviders(VALUE)[2].models).toEqual([{ id: 'kept' }])
  })

  it('keeps a route that declares no models, as a route with none', () => {
    expect(readProviders(VALUE)[1].models).toEqual([])
  })
})

describe('providerModels', () => {
  it('returns one route’s rows', () => {
    expect(providerModels(VALUE, 'router9')?.map(row => row.id))
      .toEqual(['cx/gpt-5.6-luna', 'xpiki/claude-opus-5'])
  })

  it('distinguishes a route that declares no models from one the document omits', () => {
    // The first serves the installed catalog and has no row to extend; the
    // second is a route no edit from here can address.
    expect(providerModels(VALUE, 'catalog')).toEqual([])
    expect(providerModels(VALUE, 'nowhere')).toBeUndefined()
  })
})

describe('isRowObject', () => {
  it('accepts an object and refuses everything else', () => {
    expect(isRowObject({ id: 'x' })).toBe(true)
    expect(isRowObject(['x'])).toBe(false)
    expect(isRowObject(null)).toBe(false)
    expect(isRowObject('x')).toBe(false)
    expect(isRowObject(7)).toBe(false)
  })
})

describe('messageOf', () => {
  it('reads an Error’s message and stringifies anything else', () => {
    expect(messageOf(new Error('transport down'))).toBe('transport down')
    expect(messageOf('refused')).toBe('refused')
    expect(messageOf({ code: 'settings-conflict' })).toBe('[object Object]')
  })
})
