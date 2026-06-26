import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Tooltip,
} from '@mui/material'
import Section from '@/components/common/Section'
import DeleteIcon from '@mui/icons-material/Delete'
import VisibilityIcon from '@mui/icons-material/Visibility'
import TimelineIcon from '@mui/icons-material/Timeline'
import { fetchHistory, deleteHistory, type RunRecord, type TurnLogEntry } from '@/services/historyApi'
import RaceHistoryDialog from './RaceHistoryDialog'
import TurnLogDialog from './TurnLogDialog'

const statusChip = (record: RunRecord) => {
  if (record.completed) return <Chip label="Completed" color="success" size="small" variant="outlined" />
  if (record.error === "stopped") return <Chip label="Stopped" color="warning" size="small" variant="outlined" />
  if (record.error) return <Chip label="Error" color="error" size="small" variant="filled" />
  return <Chip label="Running?" color="info" size="small" variant="outlined" />
}

const countTraining = (log: TurnLogEntry[] | undefined) =>
  (log ?? []).filter(e => e.action === 'to_training' || e.action === 'training_ready').length

const countRest = (log: TurnLogEntry[] | undefined) =>
  (log ?? []).filter(e => e.action === 'rested' && e.training_type !== 'recreation').length

const countRecreation = (log: TurnLogEntry[] | undefined) =>
  (log ?? []).filter(e => e.action === 'rested' && e.training_type === 'recreation').length

export default function RunHistory() {
  const [records, setRecords] = useState<RunRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogRecord, setDialogRecord] = useState<RunRecord | null>(null)
  const [turnLogRecord, setTurnLogRecord] = useState<RunRecord | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const scrollPosRef = useRef(0)

  const load = useCallback(async () => {
    // Save scroll position before refresh
    if (scrollRef.current) {
      scrollPosRef.current = scrollRef.current.scrollTop
    }
    setError(null)
    try {
      const data = await fetchHistory()
      setRecords(data.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // auto-refresh every 5s; restore scroll after data settles
  useEffect(() => {
    const id = setInterval(async () => {
      await load()
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollPosRef.current
      }
    }, 5000)
    return () => clearInterval(id)
  }, [load])

  const handleDelete = async (id: string) => {
    try {
      await deleteHistory(id)
      setRecords((prev) => prev.filter((r) => r.id !== id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete record')
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return <Alert severity="error" sx={{ maxWidth: 900, mx: 'auto' }}>{error}</Alert>
  }

  if (records.length === 0) {
    return (
      <Section title="Run History" sx={{ width: '100%', maxWidth: 1600, mx: 'auto' }}>
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body1" color="text.secondary">
            No run history yet. Complete a scenario run to see it here.
          </Typography>
        </Box>
      </Section>
    )
  }

  const formatFans = (n: number | null) => {
    if (n == null) return '—'
    return n.toLocaleString()
  }

  const fmtTime = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString()
  }

  const fmtDuration = (record: RunRecord) => {
    const formatSeconds = (seconds: number) => {
      const sec = Math.floor(seconds)
      const min = Math.floor(sec / 60)
      const hr = Math.floor(min / 60)
      if (hr > 0) return `${hr}h ${min % 60}m ${sec % 60}s`
      if (min > 0) return `${min}m ${sec % 60}s`
      return `${sec}s`
    }

    const periods = record.active_periods ?? []
    if (periods.length > 0) {
      let totalMs = 0
      for (const period of periods) {
        if (!period?.start_time) continue
        const start = new Date(period.start_time).getTime()
        if (Number.isNaN(start)) continue
        const stop = period.stop_time
          ? new Date(period.stop_time).getTime()
          : (record.end_time ? new Date(record.end_time).getTime() : Date.now())
        if (Number.isNaN(stop) || stop < start) continue
        totalMs += stop - start
      }
      if (totalMs > 0) return formatSeconds(totalMs / 1000)
    }

    if (record.active_seconds != null && record.active_seconds > 0) {
      return formatSeconds(record.active_seconds)
    }

    if (!record.end_time) return '—'
    const ms = new Date(record.end_time).getTime() - new Date(record.start_time).getTime()
    if (ms < 0) return '—'
    return formatSeconds(ms / 1000)
  }

  return (
    <Section title="Run History" sx={{ width: '100%', maxWidth: 1600, mx: 'auto' }}>
      <TableContainer ref={scrollRef} component={Box} sx={{ width: '100%', overflow: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }}>Start</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }}>End</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }}>Duration</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }}>Scenario</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }}>Preset / Uma</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }} align="right">Fans</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }} align="right">Rank</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }} align="right">Turn</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }} align="center">Races</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }} align="center">Actions</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }} align="center" />
            </TableRow>
          </TableHead>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id} hover sx={{ '& td': { py: 1.5, fontSize: '0.85rem' } }}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {fmtTime(record.start_time)}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {fmtTime(record.end_time)}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {fmtDuration(record)}
                </TableCell>
                <TableCell>
                  <Chip label={record.scenario} size="small" variant="outlined" />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>
                    {record.uma_name || record.preset_name}
                  </Typography>
                </TableCell>
                <TableCell align="right">{formatFans(record.final_fans)}</TableCell>
                <TableCell align="right">
                  {record.final_rank ? (
                    <Typography fontWeight={700} color="primary">{record.final_rank}</Typography>
                  ) : '—'}
                </TableCell>
                <TableCell align="right">{record.final_turn ?? '—'}</TableCell>
                <TableCell>{statusChip(record)}</TableCell>
                <TableCell align="center">
                  <Typography variant="body2">
                    {record.races_attempted.length}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                    <Chip
                      label={`T${countTraining(record.turn_log)}`}
                      size="small"
                      color="primary"
                      variant="outlined"
                      sx={{ height: 18, fontSize: '0.6rem' }}
                    />
                    <Chip
                      label={`R${countRest(record.turn_log)}`}
                      size="small"
                      color="warning"
                      variant="outlined"
                      sx={{ height: 18, fontSize: '0.6rem' }}
                    />
                    <Chip
                      label={`C${countRecreation(record.turn_log)}`}
                      size="small"
                      color="secondary"
                      variant="outlined"
                      sx={{ height: 18, fontSize: '0.6rem' }}
                    />
                  </Box>
                </TableCell>
                <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title="View races">
                    <IconButton
                      size="small"
                      onClick={() => setDialogRecord(record)}
                      disabled={record.races_attempted.length === 0}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="View turn log">
                    <IconButton
                      size="small"
                      onClick={() => setTurnLogRecord(record)}
                      disabled={!record.turn_log || record.turn_log.length === 0}
                    >
                      <TimelineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => handleDelete(record.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <RaceHistoryDialog
        open={dialogRecord !== null}
        record={dialogRecord}
        onClose={() => setDialogRecord(null)}
      />
      <TurnLogDialog
        open={turnLogRecord !== null}
        record={turnLogRecord}
        onClose={() => setTurnLogRecord(null)}
      />
    </Section>
  )
}
