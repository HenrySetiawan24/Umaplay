import { useEffect, useState, useCallback } from 'react'
import { Box, IconButton, Tooltip, Divider } from '@mui/material'
import GroupsIcon from '@mui/icons-material/Groups'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import CasinoIcon from '@mui/icons-material/Casino'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import { fetchNavStatus, startNav, stopNav, type NavAction } from '@/services/api'

const ACTIONS: { action: NavAction; label: string; hotkey: string; Icon: typeof GroupsIcon }[] = [
  { action: 'team_trials', label: 'Team Trials', hotkey: 'F7', Icon: GroupsIcon },
  { action: 'daily_races', label: 'Daily Races', hotkey: 'F8', Icon: EmojiEventsIcon },
  { action: 'roulette', label: 'Roulette / Prize Derby', hotkey: 'F9', Icon: CasinoIcon },
]

/** Compact daily-action bar (the F7/F8/F9 actions) for the header, beside Start. */
export default function DailyActionsBar() {
  const [running, setRunning] = useState(false)
  const [current, setCurrent] = useState<NavAction | null>(null)
  const [busy, setBusy] = useState(false)

  const poll = useCallback(async () => {
    try {
      const s = await fetchNavStatus()
      setRunning(s.running)
      setCurrent(s.action)
    } catch {
      setRunning(false)
      setCurrent(null)
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 2500)
    return () => clearInterval(id)
  }, [poll])

  const start = async (action: NavAction) => {
    setBusy(true)
    try { await startNav(action); setRunning(true); setCurrent(action) } catch { /* ignore */ }
    setBusy(false)
  }
  const stop = async () => {
    setBusy(true)
    try { await stopNav(); setRunning(false); setCurrent(null) } catch { /* ignore */ }
    setBusy(false)
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
      {ACTIONS.map(({ action, label, hotkey, Icon }) => {
        const isActive = running && current === action
        const disabled = busy || (running && !isActive)
        return (
          <Tooltip key={action} title={isActive ? `Stop ${label}` : `${label} (${hotkey})`}>
            <span>
              <IconButton
                size="small"
                color={isActive ? 'error' : 'default'}
                disabled={disabled}
                onClick={() => (isActive ? stop() : start(action))}
                sx={{
                  border: '1px solid',
                  borderColor: isActive ? 'error.main' : 'divider',
                  borderRadius: 1.5,
                  bgcolor: isActive ? 'error.main' : 'transparent',
                  color: isActive ? 'error.contrastText' : 'text.secondary',
                  '&:hover': { bgcolor: isActive ? 'error.dark' : 'action.hover' },
                }}
              >
                {isActive ? <StopCircleIcon fontSize="small" /> : <Icon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        )
      })}
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1 }} />
    </Box>
  )
}
