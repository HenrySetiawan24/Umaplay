import { useEffect, useState, useCallback } from 'react'
import { Box, Button, Stack, Typography, CircularProgress, Chip } from '@mui/material'
import GroupsIcon from '@mui/icons-material/Groups'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import CasinoIcon from '@mui/icons-material/Casino'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import Section from '@/components/common/Section'
import { fetchNavStatus, startNav, stopNav, type NavAction } from '@/services/api'

const ACTIONS: { action: NavAction; label: string; hotkey: string; icon: React.ReactNode }[] = [
  { action: 'team_trials', label: 'Team Trials', hotkey: 'F7', icon: <GroupsIcon /> },
  { action: 'daily_races', label: 'Daily Races', hotkey: 'F8', icon: <EmojiEventsIcon /> },
  { action: 'roulette', label: 'Roulette / Prize Derby', hotkey: 'F9', icon: <CasinoIcon /> },
]

const PRETTY: Record<string, string> = {
  team_trials: 'Team Trials',
  daily_races: 'Daily Races',
  roulette: 'Roulette / Prize Derby',
}

export default function DailyActions() {
  const [running, setRunning] = useState(false)
  const [current, setCurrent] = useState<NavAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const poll = useCallback(async () => {
    try {
      const s = await fetchNavStatus()
      setRunning(s.running)
      setCurrent(s.action)
    } catch {
      setRunning(false)
      setCurrent(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 2500)
    return () => clearInterval(id)
  }, [poll])

  const handleStart = async (action: NavAction) => {
    setBusy(true)
    try {
      await startNav(action)
      setRunning(true)
      setCurrent(action)
    } catch { /* ignore */ }
    setBusy(false)
  }

  const handleStop = async () => {
    setBusy(true)
    try {
      await stopNav()
      setRunning(false)
      setCurrent(null)
    } catch { /* ignore */ }
    setBusy(false)
  }

  return (
    <Section title="Daily actions">
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Run a one-off automation (the same as the F7/F8/F9 hotkeys). One runs at a time;
          uses the Shop / Team Trials preferences on the left.
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">Status:</Typography>
          {loading ? (
            <CircularProgress size={14} />
          ) : running ? (
            <Chip
              size="small"
              color="success"
              variant="outlined"
              label={`Running — ${current ? PRETTY[current] ?? current : 'nav'}`}
            />
          ) : (
            <Chip size="small" variant="outlined" label="Idle" />
          )}
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
          {ACTIONS.map(({ action, label, hotkey, icon }) => (
            <Button
              key={action}
              variant="outlined"
              startIcon={icon}
              disabled={busy || running}
              onClick={() => handleStart(action)}
              sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', flex: { xs: '1 1 auto', sm: '0 0 auto' } }}
            >
              {label}
              <Chip label={hotkey} size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />
            </Button>
          ))}
          <Button
            variant="contained"
            color="error"
            startIcon={<StopCircleIcon />}
            disabled={busy || !running}
            onClick={handleStop}
            sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none' }}
          >
            Stop
          </Button>
        </Stack>
      </Stack>
    </Section>
  )
}
