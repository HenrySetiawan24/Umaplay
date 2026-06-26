import Section from '@/components/common/Section'
import { useConfigStore } from '@/store/configStore'
import { Stack, TextField, Box } from '@mui/material'
import PriorityStats from './PriorityStats'
import TargetStats from './TargetStats'
import MoodSelector from './MoodSelector'
import StyleSelector from './StyleSelector'
import SkillsPicker from './SkillsPicker'
import RaceScheduler from './RaceScheduler'
import { useEventsData } from '@/hooks/useEventsData'
import EventSetupSection from '../events/EventSetupSection'
import { useEventsSetupStore } from '@/store/eventsSetupStore'
import { useEffect, useMemo, useRef } from 'react'
import FieldRow from '@/components/common/FieldRow'
import type { Preset, ScenarioConfig } from '@/models/types'
import { getStrategyComponent } from './strategy'

const normalizeScenario = (value?: string | null): 'ura' | 'unity_cup' =>
  value === 'unity_cup' ? 'unity_cup' : 'ura'

function useSelectedPreset() {
  const uiScenarioKey = useConfigStore((s) => s.uiScenarioKey)
  const uiSelectedPresetId = useConfigStore((s) => s.uiSelectedPresetId)
  const generalActiveScenario = useConfigStore((s) => s.config.general?.activeScenario)
  const scenarios = useConfigStore((s) => s.config.scenarios)

  const scenarioKey = normalizeScenario(uiScenarioKey ?? generalActiveScenario)
  const branch = useMemo(() => {
    const map = (scenarios ?? {}) as Record<string, ScenarioConfig>
    const raw = map[scenarioKey] ?? { presets: [], activePresetId: undefined }
    const presets: Preset[] = Array.isArray(raw.presets) ? (raw.presets as Preset[]) : []
    const activePresetId = raw.activePresetId && presets.some((p) => p.id === raw.activePresetId)
      ? raw.activePresetId
      : presets[0]?.id
    return { presets, activePresetId }
  }, [scenarios, scenarioKey])

  const presets = branch.presets
  const selectedId = useMemo(() => {
    if (uiSelectedPresetId && presets.some((p) => p.id === uiSelectedPresetId)) {
      return uiSelectedPresetId
    }
    return branch.activePresetId ?? presets[0]?.id
  }, [uiSelectedPresetId, branch.activePresetId, presets])

  const selected = useMemo(() => (selectedId ? presets.find((p) => p.id === selectedId) : undefined), [presets, selectedId])
  return { selected, presets, scenarioKey }
}

export function PresetSettingsSection(_props: { compact?: boolean }) {
  const { selected } = useSelectedPreset()
  const renamePreset = useConfigStore((s) => s.renamePreset)

  if (!selected) return null

  return (
    <Section title="Preset" sx={{ width: '100%', maxWidth: 'none' }}>
      <Stack spacing={2} sx={{ width: '100%' }}>
        <TextField
          label="Preset name"
          size="small"
          value={selected.name}
          onChange={(e) => renamePreset(selected.id, e.target.value)}
          sx={{ maxWidth: 360 }}
        />
        <PriorityStats presetId={selected.id} />
        <TargetStats presetId={selected.id} />
        <MoodSelector presetId={selected.id} />
        <StyleSelector presetId={selected.id} />
      </Stack>
    </Section>
  )
}

export function PresetStrategySection(_props: { compact?: boolean }) {
  const { selected, scenarioKey } = useSelectedPreset()
  if (!selected) return null

  return (
    <Section title="Bot Strategy / Policy" sx={{ width: '100%', maxWidth: 'none' }}>
      {(() => {
        const StrategyComponent = getStrategyComponent(scenarioKey)
        return <StrategyComponent preset={selected} />
      })()}
    </Section>
  )
}

export function PresetEventSection(_props: { compact?: boolean }) {
  const { selected } = useSelectedPreset()
  const patchPreset = useConfigStore((s) => s.patchPreset)
  const eventsIndex = useEventsData()
  const lastSyncedRevision = useRef<number>(-1)

  const importSetup = useEventsSetupStore((s) => s.importSetup)
  const revision = useEventsSetupStore((s) => s.revision)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selected?.event_setup) importSetup(selected.event_setup)
      lastSyncedRevision.current = revision
    }, 0)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  useEffect(() => {
    if (!selected?.id || lastSyncedRevision.current === revision) return
    lastSyncedRevision.current = revision
    const setup = useEventsSetupStore.getState().getSetup()
    patchPreset(selected.id, 'event_setup', setup)
  }, [revision, selected?.id, patchPreset])

  if (!eventsIndex || !selected) return null

  return (
    <Section title="Event Setup" sx={{ width: '100%', maxWidth: 'none' }}>
      <EventSetupSection index={eventsIndex} />
    </Section>
  )
}

export function PresetSkillsSchedulerSection(_props: { compact?: boolean }) {
  const { selected } = useSelectedPreset()
  const patchPreset = useConfigStore((s) => s.patchPreset)
  if (!selected) return null

  return (
    <Box sx={{ width: '100%' }}>
      <Section title="Skills" sx={{ width: '100%', maxWidth: 'none' }}>
        <Stack spacing={2}>
          <FieldRow
            label="Skill points threshold"
            info="Open the Skills screen on race days once points are at or above this value."
            control={
              <TextField
                size="small"
                type="number"
                value={selected.skillPtsCheck ?? 600}
                onChange={(e) =>
                  patchPreset(
                    selected.id!,
                    'skillPtsCheck',
                    Math.max(0, Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0),
                  )
                }
                inputProps={{ min: 0 }}
                sx={{ maxWidth: 160 }}
              />
            }
          />
          <SkillsPicker presetId={selected.id} />
        </Stack>
      </Section>
    </Box>
  )
}

export function PresetRaceSchedulerSection({ compact }: { compact?: boolean }) {
  const { selected } = useSelectedPreset()
  if (!selected) return null

  return (
    <Section title="Race Scheduler" sx={{ width: '100%', maxWidth: 'none' }}>
      <RaceScheduler presetId={selected.id} compact={compact} />
    </Section>
  )
}
