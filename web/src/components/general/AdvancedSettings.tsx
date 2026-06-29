import {
  Box, Collapse, Divider, FormControlLabel, MenuItem, Select, Slider, Stack, Switch, TextField, Typography,
} from '@mui/material'
import { useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import FieldRow from '@/components/common/FieldRow'
import { useConfigStore } from '@/store/configStore'

export default function AdvancedSettings() {
  const { config, setGeneral } = useConfigStore()
  const [open, setOpen] = useState(false)
  const a = config.general.advanced

  const [autoRest, setAutoRest] = useState(a.autoRestMinimum)
  const [skillInterval, setSkillInterval] = useState(a.skillCheckInterval)
  const [skillDelta, setSkillDelta] = useState(a.skillPtsDelta)
  const [undertrain, setUndertrain] = useState(a.undertrainThreshold)
  const [topStats, setTopStats] = useState(a.topStatsFocus)
  const [externalUrl, setExternalUrl] = useState(a.externalProcessorUrl)
  const [settleTimeout, setSettleTimeout] = useState(a.trainingSettleTimeoutMs ?? 400)
  const [settleDiff, setSettleDiff] = useState(a.trainingSettleDiffThreshold ?? 2)
  const [raceScale, setRaceScale] = useState(a.raceAwaitScale ?? 1)
  const [trainPause, setTrainPause] = useState(a.trainingPostClickPause ?? 3)
  const [skillsScrolls, setSkillsScrolls] = useState(a.skillsMaxScrolls ?? 15)
  const [skillsPatience, setSkillsPatience] = useState(a.skillsScanPatience ?? 3)

  const autoRestMarks = useMemo(() => {
    const marks = [{ value: 1 }]
    for (let v = 5; v <= 70; v += 5) {
      marks.push({ value: v })
    }
    return marks
  }, [])

  const toNumber = (val: number | number[]) => (Array.isArray(val) ? val[0] : val)

  useEffect(() => {
    setAutoRest(a.autoRestMinimum)
    setSkillInterval(a.skillCheckInterval)
    setSkillDelta(a.skillPtsDelta)
    setUndertrain(a.undertrainThreshold)
    setTopStats(a.topStatsFocus)
    setExternalUrl(a.externalProcessorUrl)
    setSettleTimeout(a.trainingSettleTimeoutMs ?? 400)
    setSettleDiff(a.trainingSettleDiffThreshold ?? 2)
    setRaceScale(a.raceAwaitScale ?? 1)
    setTrainPause(a.trainingPostClickPause ?? 3)
    setSkillsScrolls(a.skillsMaxScrolls ?? 15)
    setSkillsPatience(a.skillsScanPatience ?? 3)
  }, [
    a.autoRestMinimum,
    a.skillCheckInterval,
    a.skillPtsDelta,
    a.undertrainThreshold,
    a.topStatsFocus,
    a.externalProcessorUrl,
    a.trainingSettleTimeoutMs,
    a.trainingSettleDiffThreshold,
    a.raceAwaitScale,
    a.trainingPostClickPause,
    a.skillsMaxScrolls,
    a.skillsScanPatience,
  ])

  const commitAdvanced = <K extends keyof typeof a>(key: K, value: (typeof a)[K]) => {
    setGeneral({
      advanced: {
        ...a,
        [key]: value,
      },
    })
  }
  const sliderSx = {
    width: '100%',
    mt: '-2px',
    mb: '-4px',
    py: 0.5,
    '.MuiSlider-thumb': {
      width: 12,
      height: 12,
      boxShadow: 'none',
    },
    '.MuiSlider-thumb::before': {
      boxShadow: 'none',
    },
    '.MuiSlider-rail': {
      height: 4,
      borderRadius: 2,
    },
    '.MuiSlider-track': {
      height: 4,
      borderRadius: 2,
    },
  } as const
  const renderSliderControl = ({
    id,
    value,
    min,
    max,
    step,
    marks,
    format,
    onChange,
    onCommit,
  }: {
    id: string
    value: number
    min: number
    max: number
    step: number
    marks?: typeof autoRestMarks
    format?: (v: number) => string
    onChange: (event: Event | SyntheticEvent<Element, Event>, value: number | number[]) => void
    onCommit: (event: Event | SyntheticEvent<Element, Event>, value: number | number[]) => void
  }) => {
    const percent = max === min ? 0 : ((value - min) / (max - min)) * 100
    const formatted = format ? format(value) : `${value}`
    return (
      <Box sx={controlWrapSx} data-advanced-slider={id}>
        <Box sx={{ position: 'relative', width: '100%' }}>
          <Typography
            component="span"
            sx={{
              position: 'absolute',
              top: -14,
              left: `${Math.min(100, Math.max(0, percent))}%`,
              transform: 'translateX(-50%)',
              fontWeight: 800,
              fontSize: 16,
              lineHeight: 1,
              color: '#1976d2',
            }}
            data-advanced-slider-label
          >
            {formatted}
          </Typography>
          <Slider
            value={value}
            onChange={onChange}
            onChangeCommitted={onCommit}
            min={min}
            max={max}
            step={step}
            marks={marks}
            sx={sliderSx}
          />
        </Box>
      </Box>
    )
  }
  const controlWrapSx = (theme: any) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
    px: 1.5,
    pt: 3,
    pb: 1.75,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 1.5,
    backgroundColor:
      theme.palette.mode === 'dark'
        ? theme.palette.background.default
        : theme.palette.grey[50],
    boxShadow: theme.palette.mode === 'dark'
      ? 'inset 0 0 0 1px rgba(255,255,255,0.05)'
      : '0 1px 2px rgba(15, 23, 42, 0.08)',
    maxWidth: 240,
    width: '100%',
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const logLabelOffsets = () => {
      document.querySelectorAll<HTMLElement>('[data-advanced-slider]').forEach((container) => {
        const id = container.getAttribute('data-advanced-slider') ?? 'unknown'
        const thumb = container.querySelector<HTMLElement>('.MuiSlider-thumb')
        const label = container.querySelector<HTMLElement>('[data-advanced-slider-label]')
        const sliderRoot = container.querySelector<HTMLElement>('.MuiSlider-root')
        if (!thumb || !label) return
        const thumbRect = thumb.getBoundingClientRect()
        const labelRect = label.getBoundingClientRect()
        const topGap = Math.round(thumbRect.top - labelRect.bottom)
        const paddingTop = sliderRoot ? window.getComputedStyle(sliderRoot).paddingTop : null
        console.debug('[AdvancedSettings] slider spacing', {
          id,
          topGap,
          paddingTop,
        })
      })
    }
    logLabelOffsets()
  }, [])

  return (
    <Stack spacing={1.5}>
      <Typography
        variant="subtitle1"
        sx={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '▼' : '▶'} Advanced settings
      </Typography>

      <Collapse in={open}>
        <Divider sx={{ mb: 2 }} />

        <FieldRow
          label="Hotkey"
          control={
            <Select
              size="small"
              value={a.hotkey}
              onChange={(e) => setGeneral({ advanced: { ...a, hotkey: e.target.value as any } })}
            >
              {['F1', 'F2', 'F3', 'F4'].map((k) => (
                <MenuItem key={k} value={k}>{k}</MenuItem>
              ))}
            </Select>
          }
          info="Keyboard key to toggle the agent on/off."
        />

        <FieldRow
          label="Debug mode"
          control={
            <FormControlLabel
              control={
                <Switch
                  checked={a.debugMode}
                  onChange={(e) => setGeneral({ advanced: { ...a, debugMode: e.target.checked } })}
                />
              }
              label={a.debugMode ? 'Enabled' : 'Disabled'}
            />
          }
          info="Enable debug mode for verbose logging and extra overlays."
        />

        <FieldRow
          label="Use external processor"
          control={
            <FormControlLabel
              control={
                <Switch
                  checked={a.useExternalProcessor}
                  onChange={(e) =>
                    setGeneral({ advanced: { ...a, useExternalProcessor: e.target.checked } })
                  }
                />
              }
              label={a.useExternalProcessor ? 'Enabled' : 'Disabled'}
            />
          }
          info="Send OCR/YOLO processing to a remote server."
        />

        <FieldRow
          label="External processor URL"
          control={
            <TextField
              size="small"
              fullWidth
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              onBlur={() => {
                if (externalUrl !== a.externalProcessorUrl) {
                  setGeneral({ advanced: { ...a, externalProcessorUrl: externalUrl } })
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const next = externalUrl.trim()
                  if (next && next !== a.externalProcessorUrl) {
                    setGeneral({ advanced: { ...a, externalProcessorUrl: next } })
                  }
                }
              }}
              disabled={!a.useExternalProcessor}
              placeholder="http://127.0.0.1:8001"
            />
          }
          info="Base URL for the remote inference server."
        />

        <FieldRow
          label="Auto rest minimum"
          info="Below this energy% the bot will rest automatically."
          control={renderSliderControl({
            id: 'autoRestMinimum',
            value: autoRest,
            min: 1,
            max: 70,
            step: 1,
            marks: autoRestMarks,
            format: (v) => `${v}%`,
            onChange: (_, v) => {
              const raw = toNumber(v)
              const next = raw <= 1 ? 1 : Math.max(5, Math.min(70, Math.round(raw / 5) * 5))
              setAutoRest(next)
            },
            onCommit: (_, v) => {
              const raw = toNumber(v)
              const next = raw <= 1 ? 1 : Math.max(5, Math.min(70, Math.round(raw / 5) * 5))
              setAutoRest(next)
              commitAdvanced('autoRestMinimum', next)
            },
          })}
          sx={{ mt: 2 }}
        />

        <FieldRow
          label="Skills: check interval"
          info="How often to reopen the Skills shop during races — 1 checks every turn, 3 checks every third turn."
          control={renderSliderControl({
            id: 'skillCheckInterval',
            value: skillInterval,
            min: 1,
            max: 5,
            step: 1,
            onChange: (_, v) => {
              const next = Math.max(1, Math.min(5, Math.round(toNumber(v))))
              setSkillInterval(next)
            },
            onCommit: (_, v) => {
              const next = Math.max(1, Math.min(5, Math.round(toNumber(v))))
              setSkillInterval(next)
              commitAdvanced('skillCheckInterval', next)
            },
          })}
          sx={{ mt: 2 }}
        />

        <FieldRow
          label="Skills: points delta"
          info="Reopen the Skills shop only after earning at least this many points (e.g. 60 waits until you gain 60 more points)."
          control={renderSliderControl({
            id: 'skillPtsDelta',
            value: skillDelta,
            min: 60,
            max: 200,
            step: 10,
            onChange: (_, v) => {
              const raw = toNumber(v)
              const next = Math.max(60, Math.min(200, Math.round(raw / 10) * 10))
              setSkillDelta(next)
            },
            onCommit: (_, v) => {
              const raw = toNumber(v)
              const next = Math.max(60, Math.min(200, Math.round(raw / 10) * 10))
              setSkillDelta(next)
              commitAdvanced('skillPtsDelta', next)
            },
          })}
          sx={{ mt: 2 }}
        />

        <FieldRow
          label="Undertrain threshold"
          info="Lower values make detection stricter, higher values more forgiving. The system looks at how much each stat contributes to your total stats and compares it with how much it should contribute based on the ideal balance. Think of it as checking if any stat is falling behind or getting too far ahead. For example, if your total stats add up to 1640 and SPD is 375, that means SPD makes up about 23% of your total. But according to the ideal setup (your stat caps), SPD should represent let's say 32% — which would be around 525 points. That means SPD is about 9% lower than where it should be, so it’s undertrained. However, if your undertraining threshold is 10%, the bot won’t force SPD training yet because the difference isn’t big enough. On the other hand, PWR is let's say 512, which is 31% of the total, while its ideal ratio in this hypothetical scenario is let's say 25%, so it’s 7% higher than expected — meaning PWR is overtrained and should be paused until the others catch up."
          control={renderSliderControl({
            id: 'undertrainThreshold',
            value: undertrain,
            min: 1,
            max: 20,
            step: 1,
            format: (v) => `${v}%`,
            onChange: (_, v) => {
              const next = Math.max(1, Math.min(20, Math.round(toNumber(v))))
              setUndertrain(next)
            },
            onCommit: (_, v) => {
              const next = Math.max(1, Math.min(20, Math.round(toNumber(v))))
              setUndertrain(next)
              commitAdvanced('undertrainThreshold', next)
            },
          })}
          sx={{ mt: 2 }}
        />

        <FieldRow
          label="Top stats focus"
          info="Used to re-prioritize stats when training and also if bot finds a low SV value in priority stat compared with maximum SV value in another tile. If difference is not more than 0.75 we skip the 'best' option and get the second best option only if it is in these first top stats"
          control={renderSliderControl({
            id: 'topStatsFocus',
            value: topStats,
            min: 1,
            max: 5,
            step: 1,
            onChange: (_, v) => {
              const next = Math.max(1, Math.min(5, Math.round(toNumber(v))))
              setTopStats(next)
            },
            onCommit: (_, v) => {
              const next = Math.max(1, Math.min(5, Math.round(toNumber(v))))
              setTopStats(next)
              commitAdvanced('topStatsFocus', next)
            },
          })}
          sx={{ mt: 2 }}
        />

        <FieldRow
          label="Training settle: max wait"
          info="After clicking a training tile, the bot polls the screen and scans as soon as the raise/support animation stops moving. This is the upper bound on that wait — it almost always finishes earlier. Raise it if the game animates slowly; lower it for snappier scanning."
          control={renderSliderControl({
            id: 'trainingSettleTimeoutMs',
            value: settleTimeout,
            min: 100,
            max: 1000,
            step: 50,
            format: (v) => `${v}ms`,
            onChange: (_, v) => {
              const next = Math.max(100, Math.min(1000, Math.round(toNumber(v) / 50) * 50))
              setSettleTimeout(next)
            },
            onCommit: (_, v) => {
              const next = Math.max(100, Math.min(1000, Math.round(toNumber(v) / 50) * 50))
              setSettleTimeout(next)
              commitAdvanced('trainingSettleTimeoutMs', next)
            },
          })}
          sx={{ mt: 2 }}
        />

        <FieldRow
          label="Training settle: sensitivity"
          info="How still the screen must be before the bot considers the animation finished (mean per-pixel frame difference). Higher = less sensitive, so it settles and scans sooner; lower = stricter, so it waits longer for the screen to fully stop. Raise this if looping sparkle/rainbow effects keep it waiting the full time."
          control={renderSliderControl({
            id: 'trainingSettleDiffThreshold',
            value: settleDiff,
            min: 0.5,
            max: 10,
            step: 0.5,
            onChange: (_, v) => {
              const next = Math.max(0.5, Math.min(10, Math.round(toNumber(v) * 2) / 2))
              setSettleDiff(next)
            },
            onCommit: (_, v) => {
              const next = Math.max(0.5, Math.min(10, Math.round(toNumber(v) * 2) / 2))
              setSettleDiff(next)
              commitAdvanced('trainingSettleDiffThreshold', next)
            },
          })}
          sx={{ mt: 2 }}
        />

        <FieldRow
          label="Race pacing"
          info="Multiplier on the race-day animation grace waits (race start, skip, result screens). 1.0 keeps current pacing; lower speeds the bot up on fast devices/emulators; higher gives slow phones more time for animations to finish."
          control={renderSliderControl({
            id: 'raceAwaitScale',
            value: raceScale,
            min: 0.4,
            max: 2,
            step: 0.1,
            format: (v) => `${v.toFixed(1)}x`,
            onChange: (_, v) => {
              const next = Math.max(0.4, Math.min(2, Math.round(toNumber(v) * 10) / 10))
              setRaceScale(next)
            },
            onCommit: (_, v) => {
              const next = Math.max(0.4, Math.min(2, Math.round(toNumber(v) * 10) / 10))
              setRaceScale(next)
              commitAdvanced('raceAwaitScale', next)
            },
          })}
          sx={{ mt: 2 }}
        />

        <FieldRow
          label="Training: wait before next turn"
          info="Seconds to wait after clicking a training before the bot resumes and starts the next turn. The in-game training animation plays during this time, so this isn't pure idle — but lowering it lets the bot start advancing through the result screens sooner. Too low risks capturing mid-animation. Default 3s."
          control={renderSliderControl({
            id: 'trainingPostClickPause',
            value: trainPause,
            min: 0.5,
            max: 10,
            step: 0.5,
            format: (v) => `${v.toFixed(1)}s`,
            onChange: (_, v) => {
              const next = Math.max(0.5, Math.min(10, Math.round(toNumber(v) * 2) / 2))
              setTrainPause(next)
            },
            onCommit: (_, v) => {
              const next = Math.max(0.5, Math.min(10, Math.round(toNumber(v) * 2) / 2))
              setTrainPause(next)
              commitAdvanced('trainingPostClickPause', next)
            },
          })}
          sx={{ mt: 2 }}
        />

        <FieldRow
          label="Skills: max scrolls"
          info="How many times the bot scrolls the skill shop while buying before giving up. Higher reaches skills further down a long list; lower ends the buy session sooner."
          control={renderSliderControl({
            id: 'skillsMaxScrolls',
            value: skillsScrolls,
            min: 1,
            max: 60,
            step: 1,
            onChange: (_, v) => {
              const next = Math.max(1, Math.min(60, Math.round(toNumber(v))))
              setSkillsScrolls(next)
            },
            onCommit: (_, v) => {
              const next = Math.max(1, Math.min(60, Math.round(toNumber(v))))
              setSkillsScrolls(next)
              commitAdvanced('skillsMaxScrolls', next)
            },
          })}
          sx={{ mt: 2 }}
        />

        <FieldRow
          label="Skills: stop after repeats"
          info="Stop scrolling the skill shop after this many consecutive scrolls show the same screen with nothing bought (i.e. you've reached the bottom). Lower stops sooner; higher is more tolerant of scroll/animation hiccups."
          control={renderSliderControl({
            id: 'skillsScanPatience',
            value: skillsPatience,
            min: 1,
            max: 10,
            step: 1,
            onChange: (_, v) => {
              const next = Math.max(1, Math.min(10, Math.round(toNumber(v))))
              setSkillsPatience(next)
            },
            onCommit: (_, v) => {
              const next = Math.max(1, Math.min(10, Math.round(toNumber(v))))
              setSkillsPatience(next)
              commitAdvanced('skillsScanPatience', next)
            },
          })}
          sx={{ mt: 2 }}
        />
      </Collapse>
    </Stack>
  )
}
