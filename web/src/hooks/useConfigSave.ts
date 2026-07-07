import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfigStore } from '@/store/configStore'
import { useEventsSetupStore } from '@/store/eventsSetupStore'
import { useNavPrefsStore } from '@/store/navPrefsStore'
import { saveServerConfig, saveNavPrefs } from '@/services/api'
import type { AppConfig } from '@/models/types'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Build the exact payload the old "Save config" button POSTed, but idempotently:
 * the two side-effects (commit selected preset as active, mark scenario confirmed)
 * only mutate the store when they would actually change something, so calling this
 * repeatedly does not churn the config identity and re-trigger the auto-save loop.
 */
function buildMergedConfig(): AppConfig {
  const store = useConfigStore.getState()
  const cfg = store.config
  const selKey = store.uiScenarioKey
  const selBranch = cfg.scenarios?.[selKey]
  const selectedId = store.uiSelectedPresetId ?? selBranch?.activePresetId ?? selBranch?.presets?.[0]?.id

  // 1) commit selected preset as active (only if it isn't already)
  if (selBranch && selectedId && selBranch.activePresetId !== selectedId) {
    store.commitSelectedPreset()
  }
  // 2) mark scenario confirmed from the Web UI (only if not already)
  if (cfg.general && (cfg.general as any).scenarioConfirmed !== true) {
    store.setGeneral({ scenarioConfirmed: true } as any)
  }

  // 3) snapshot current Event Setup and merge into the active preset (mirror of the old bar)
  const setup = useEventsSetupStore.getState().getSetup()
  const updated = useConfigStore.getState().config
  const { scenario, id: activeId } = useConfigStore.getState().getActivePreset()
  const scenarios = updated.scenarios || {}
  const scenarioBranch = scenarios[scenario] || { presets: [], activePresetId: undefined }
  const presets = Array.isArray(scenarioBranch.presets) ? scenarioBranch.presets : []
  const targetId = activeId || presets[0]?.id || null

  return targetId
    ? {
        ...updated,
        scenarios: {
          ...scenarios,
          [scenario]: {
            ...scenarioBranch,
            presets: presets.map((p: any) => (p.id === targetId ? { ...p, event_setup: setup } : p)),
          },
        },
      }
    : updated
}

/**
 * Server persistence for the app config + nav prefs, exposed as an auto-saving hook.
 *
 * - Debounced auto-save on every config / event-setup / nav-pref change.
 * - Signature comparison so the write-back the save itself performs does not loop.
 * - `save({ force: true })` for the manual (fallback) button, which always POSTs.
 *
 * Intended to be mounted ONCE (in the always-visible top bar) so a single
 * auto-save loop runs across all tabs.
 */
export function useConfigSave() {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const lastSigRef = useRef<string>('')
  const inFlightRef = useRef(false)
  const firstRunRef = useRef(true)

  const config = useConfigStore((s) => s.config)
  const revision = useEventsSetupStore((s) => s.revision)
  const navPrefs = useNavPrefsStore((s) => s.prefs)

  const save = useCallback(async (opts?: { force?: boolean }) => {
    if (inFlightRef.current) return
    const merged = buildMergedConfig()
    const currentNav = useNavPrefsStore.getState().prefs
    const sig = JSON.stringify(merged) + '|' + JSON.stringify(currentNav)
    if (!opts?.force && sig === lastSigRef.current) {
      // Nothing changed since the last successful save (or the change was our own write-back).
      setStatus('saved')
      return
    }

    inFlightRef.current = true
    setStatus('saving')
    setError(undefined)
    try {
      await saveServerConfig(merged)
      await saveNavPrefs(currentNav)
      // Reflect the merged config locally so export/import/localStorage match.
      useConfigStore.setState((s) => ({ ...s, config: merged }))
      lastSigRef.current = sig
      setStatus('saved')
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save config')
      setStatus('error')
    } finally {
      inFlightRef.current = false
    }
  }, [])

  // Debounced auto-save. Skip the very first run so we don't clobber the server
  // with the initial/default config before localStorage has hydrated.
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false
      return
    }
    const t = setTimeout(() => { void save() }, 800)
    return () => clearTimeout(t)
  }, [config, revision, navPrefs, save])

  return { status, error, save }
}
