import { useEffect, useRef, useState, useCallback } from 'react'
import { Box, Stack, Typography, ToggleButton, ToggleButtonGroup, IconButton, Tooltip, FormControlLabel, Switch } from '@mui/material'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import Section from '@/components/common/Section'
import { fetchLogs, type LogEntry } from '@/services/api'

const LEVEL_COLOR: Record<string, string> = {
  ERROR: '#ef5350',
  WARNING: '#ffa726',
  INFO: '#66bb6a',
  DEBUG: '#90a4ae',
}

const LEVELS = ['ALL', 'DEBUG', 'INFO', 'WARNING', 'ERROR'] as const
type LevelFilter = (typeof LEVELS)[number]
const RANK: Record<string, number> = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3 }

export default function LogsView() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LevelFilter>('ALL')
  const [autoScroll, setAutoScroll] = useState(true)
  const cursorRef = useRef(0)
  const boxRef = useRef<HTMLDivElement | null>(null)

  const poll = useCallback(async () => {
    try {
      const data = await fetchLogs(cursorRef.current, 1000)
      if (data.entries.length) {
        cursorRef.current = data.last_seq
        setEntries((prev) => {
          const next = [...prev, ...data.entries]
          return next.length > 3000 ? next.slice(next.length - 3000) : next
        })
      } else if (data.last_seq < cursorRef.current) {
        // server restarted / buffer reset — resync
        cursorRef.current = 0
      }
    } catch {
      // ignore transient errors
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 1500)
    return () => clearInterval(id)
  }, [poll])

  useEffect(() => {
    if (autoScroll && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  const visible = filter === 'ALL'
    ? entries
    : entries.filter((e) => (RANK[e.level] ?? 0) >= RANK[filter])

  return (
    <Section title="Logs" sx={{ width: '100%', maxWidth: 1600, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <ToggleButtonGroup
          size="small"
          value={filter}
          exclusive
          onChange={(_, v) => v && setFilter(v)}
        >
          {LEVELS.map((l) => (
            <ToggleButton key={l} value={l} sx={{ px: 1.5, fontSize: 12, fontWeight: 700 }}>
              {l}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <FormControlLabel
          control={<Switch size="small" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />}
          label="Auto-scroll"
        />
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">{visible.length} lines</Typography>
        <Tooltip title="Clear view (does not affect the server log)">
          <IconButton size="small" onClick={() => setEntries([])}><DeleteSweepIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>

      <Box
        ref={boxRef}
        sx={{
          height: '70vh',
          overflow: 'auto',
          bgcolor: (t) => (t.palette.mode === 'dark' ? '#0d1117' : '#1e1e1e'),
          color: '#d4d4d4',
          borderRadius: 1.5,
          p: 1.5,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12.5,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {visible.length === 0 ? (
          <Typography sx={{ color: '#6b7280', fontFamily: 'inherit', fontSize: 'inherit' }}>
            Waiting for log output…
          </Typography>
        ) : (
          visible.map((e) => (
            <Box key={e.seq} sx={{ display: 'flex', gap: 1 }}>
              <Box component="span" sx={{ color: LEVEL_COLOR[e.level] ?? '#90a4ae', fontWeight: 700, minWidth: 62, flexShrink: 0 }}>
                {e.level}
              </Box>
              <Box component="span">{e.text}</Box>
            </Box>
          ))
        )}
      </Box>
    </Section>
  )
}
